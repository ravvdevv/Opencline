#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INSTALL_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/opencline"

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

SOURCE_EXE="$REPO_ROOT/apps/cli/dist/cli-${OS}-${ARCH}/bin/cline"
TARGET_EXE="$INSTALL_DIR/opencline"

resolve_bun() {
	if command -v bun >/dev/null 2>&1 && bun --version >/dev/null 2>&1; then
		command -v bun
		return 0
	fi
	# Arch Linux bun package can leave the postinstall shim broken; use the real binary if present.
	for candidate in \
		/usr/lib/node_modules/bun/node_modules/@oven/bun-linux-x64/bin/bun \
		/usr/lib/node_modules/bun/node_modules/@oven/bun-linux-arm64/bin/bun \
		"$HOME/.bun/bin/bun"; do
		if [ -x "$candidate" ] && "$candidate" --version >/dev/null 2>&1; then
			echo "$candidate"
			return 0
		fi
	done
	return 1
}

BUN_BIN="$(resolve_bun || true)"
if [ -z "$BUN_BIN" ]; then
	echo "Bun is required to build OpenCline. Install Bun and make sure it works:" >&2
	echo "  Arch Linux: sudo pacman -S --needed bun && sudo bun /usr/lib/node_modules/bun/install.js" >&2
	echo "  Or: curl -fsSL https://bun.sh/install | bash" >&2
	exit 1
fi

echo "Building OpenCline for ${OS}-${ARCH} using $BUN_BIN..."
(
	cd "$REPO_ROOT"
	"$BUN_BIN" run apps/cli/script/build.ts --single
)

if [ ! -f "$SOURCE_EXE" ]; then
	echo "Build completed but the expected executable was not found: $SOURCE_EXE" >&2
	exit 1
fi

mkdir -p "$INSTALL_DIR" "$DATA_DIR"

# Stage then move so a failed copy does not leave a partial executable.
STAGED_EXE="$TARGET_EXE.new"
cp "$SOURCE_EXE" "$STAGED_EXE"
chmod +x "$STAGED_EXE"
mv -f "$STAGED_EXE" "$TARGET_EXE"

echo "Installed: $TARGET_EXE"
echo "Checking executable..."
"$TARGET_EXE" --version

case ":$PATH:" in
	*":$INSTALL_DIR:"*) ;;
	*)
		echo
		echo "$INSTALL_DIR is not on your PATH. Add it to your shell profile, for example:"
		echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
		;;
esac

echo "Done. Run: opencline"
