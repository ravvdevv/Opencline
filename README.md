<p align="center">
  <img src="assets/icons/icon.png" width="72" alt="OpenCline logo" />
</p>

<h1 align="center">OpenCline</h1>

<p align="center"><strong>Your terminal. Your codebase. Less AI nonsense.</strong></p>

<p align="center">A terminal-first AI coding agent for shipping and improving real software.</p>

<p align="center">
  <a href="apps/cli/README.md">Docs</a> ·
  <a href="https://github.com/ravvdevv/Opencline/releases">Releases</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

## Why OpenCline?

- **Less prompt babysitting:** Caveman and Ponytail styles, plus review and audit helpers.
- **Context that sticks:** separate user, global, and project memory.
- **Safer changes:** focused command safeguards and change verification.
- **Reliable sessions:** retries for temporary provider and stream failures.
- **Windows-ready:** standalone CLI with a checksum-verified installer.

## Quick start

**Windows:** Download the executable from [Releases](https://github.com/ravvdevv/Opencline/releases), or run in PowerShell:

```powershell
irm https://raw.githubusercontent.com/ravvdevv/Opencline/main/apps/cli/script/install-opencline-release.ps1 | iex
```

Then open a new terminal and run `opencline`.

**Build from source** (requires [Bun](https://bun.sh/) and Git):

```bash
git clone https://github.com/ravvdevv/Opencline.git
cd Opencline
bun install
bun run install:opencline
```

Need provider setup, configuration, or command details? Read the [CLI guide](apps/cli/README.md).

## Credits

Built on [Cline](https://github.com/cline/cline). See [LICENSE](LICENSE).
