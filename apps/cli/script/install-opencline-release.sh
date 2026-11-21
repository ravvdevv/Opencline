#!/usr/bin/env bash
set -euo pipefail

REPO="ravvdevv/opencline"
INSTALL_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"

case "$(uname -s)" in
	Linux) OS="linux" ;;
	Darwin) OS="darwin" ;;
	*)
		echo "Unsupported OS: $(uname -s). Use the Windows PowerShell installer on Windows." >&2
		exit 1
		;;
esac

case "$(uname -m)" in
	x86_64|amd64) ARCH="x64" ;;
	aarch64|arm64) ARCH="arm64" ;;
	*)
		echo "Unsupported architecture: $(uname -m)" >&2
		exit 1
		;;
esac

ASSET="opencline-${OS}-${ARCH}"
CHECKSUM="${ASSET}.sha256"
TARGET_EXE="$INSTALL_DIR/opencline"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/opencline-install-XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

if command -v curl >/dev/null 2>&1; then
	FETCH=(curl -fsSL)
elif command -v wget >/dev/null 2>&1; then
	FETCH=(wget -qO-)
else
	echo "curl or wget is required to download OpenCline." >&2
	exit 1
fi

fetch() {
	if [ "${FETCH[0]}" = "curl" ]; then
		curl -fsSL "$1" -o "$2"
	else
		wget -qO "$2" "$1"
	fi
}

echo "Checking latest GitHub release..."
RELEASE_JSON="$("${FETCH[@]}" "https://api.github.com/repos/$REPO/releases/latest")"
TAG="$(printf '%s' "$RELEASE_JSON" | node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(r.tag_name||"")')"
if [ -z "$TAG" ]; then
	echo "Could not determine the latest release tag from GitHub." >&2
	exit 1
fi

ASSET_URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"
CHECKSUM_URL="https://github.com/$REPO/releases/download/$TAG/$CHECKSUM"

echo "Downloading $ASSET ($TAG)..."
fetch "$ASSET_URL" "$TMP_DIR/$ASSET"
fetch "$CHECKSUM_URL" "$TMP_DIR/$CHECKSUM"

echo "Verifying SHA-256..."
EXPECTED="$(awk '{print tolower($1)}' "$TMP_DIR/$CHECKSUM" | head -n1)"
if ! printf '%s' "$EXPECTED" | grep -Eq '^[0-9a-f]{64}$'; then
	echo "The release checksum file is malformed." >&2
	exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
	ACTUAL="$(sha256sum "$TMP_DIR/$ASSET" | awk '{print tolower($1)}')"
elif command -v shasum >/dev/null 2>&1; then
	ACTUAL="$(shasum -a 256 "$TMP_DIR/$ASSET" | awk '{print tolower($1)}')"
else
	echo "sha256sum or shasum is required to verify the download." >&2
	exit 1
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
	echo "SHA-256 verification failed. The downloaded executable was not installed." >&2
	exit 1
fi

chmod +x "$TMP_DIR/$ASSET"
DOWNLOADED_VERSION="$("$TMP_DIR/$ASSET" --version | tr -d '\r')"
if [ -z "$DOWNLOADED_VERSION" ]; then
	echo "The downloaded executable failed its version check." >&2
	exit 1
fi

mkdir -p "$INSTALL_DIR"
STAGED_EXE="$TARGET_EXE.new"
cp "$TMP_DIR/$ASSET" "$STAGED_EXE"
chmod +x "$STAGED_EXE"
mv -f "$STAGED_EXE" "$TARGET_EXE"

echo "Installed: $TARGET_EXE"
echo "Version: $DOWNLOADED_VERSION"

case ":$PATH:" in
	*":$INSTALL_DIR:"*) ;;
	*)
		echo
		echo "$INSTALL_DIR is not on your PATH. Add it to your shell profile, for example:"
		echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
		;;
esac

echo "Done. Run: opencline"
