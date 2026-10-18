<p align="center">
  <img src="assets/icons/icon.png" width="84" alt="OpenCline logo" />
</p>

<h1 align="center">OpenCline</h1>

<p align="center">
  <strong>Your terminal. Your codebase. Less AI nonsense.</strong>
</p>

<p align="center">
  A terminal-first AI coding agent built to help you ship, debug, and improve real software without fighting your tools.
</p>

<p align="center">
  <a href="apps/cli/README.md">Get started</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/ravvdevv/opencline/releases">Releases</a> ·
  <a href="LICENSE">License</a> ·
  <a href="https://github.com/cline/cline">Upstream: Cline</a>
</p>

---

OpenCline is an opinionated, terminal-first fork of [Cline](https://github.com/cline/cline) for developers who want to **ship code, not babysit their AI**.

## Why OpenCline?

- **Concise by default:** Caveman Ultra and Ponytail Ultra styles.
- **Context that sticks:** separate user, global, and project memory.
- **Safer execution:** focused checks for destructive commands and possible secret leaks.
- **More reliable sessions:** retries for provider overloads and interrupted streams.
- **A smoother workflow:** project setup, change verification, and a standalone Windows CLI.

## Key features

### Make the agent work your way

- Built-in `/caveman` and `/ponytail` style commands support `lite`, `full`, `ultra`, and `off`; Ultra is the default level. Their core behavior does not require downloading a skill just to use the style commands.
- Helpers cover ADHD-friendly responses, reviews, audits, and technical debt.
- Installed Caveman, Ponytail, and `i-have-adhd` skills can load automatically at startup.
- Run `/init` to create or update project guidance in `AGENTS.md`.
- Separate user, global, and project memory keeps context scoped and editable.
- Focused safeguards catch recognizable destructive operations and commands that may expose secrets.
- A change-verification script identifies changed files and affected packages, runs relevant package checks, and rebuilds SDK packages when SDK source changes.

### Reliable sessions

- Retries for temporary provider-overload errors.
- Retries for dropped provider streams, with explicit exhaustion reporting instead of silently leaving a session in a confusing state.
- Correct handling of selected AWS Bedrock profiles.
- Explicit style overrides take precedence cleanly, and built-in style commands expand locally without an extra model call.

### Easy Windows setup

- Standalone Windows x64 CLI, with no separate runtime needed for the published binary.
- Releases smoke-test the CLI and publish a SHA-256 checksum.
- The PowerShell installer verifies the download and adds OpenCline to PATH.
- Local updater checks for running OpenCline processes, stages the replacement binary before swapping it in, retries transient file-lock failures, and verifies the installed version.
- Release checks gate publishing on CLI validation.

These changes focus on the terminal workflow and Windows CLI distribution. OpenCline still builds on Cline's shared codebase, and the feature list should not be read as a claim that every upstream component has been rewritten or every optional interface is packaged as a finished product.

## Quick start

### Windows: install the latest release

Open the [latest releases](https://github.com/ravvdevv/opencline/releases) and download `opencline-windows-x64.exe` if an executable is attached.

Or install it from PowerShell:

```powershell
irm https://raw.githubusercontent.com/ravvdevv/opencline/main/apps/cli/script/install-opencline-release.ps1 | iex
```

The installer verifies the download with its SHA-256 checksum. If no executable is attached to the latest release, build from source.

Open a **new terminal** and run:

```powershell
opencline
```

### Build and install from source

Requirements: [Bun](https://bun.sh/) and Git.

```bash
git clone https://github.com/ravvdevv/opencline.git
cd opencline
bun install
bun run install:opencline
```

### Run locally

```bash
bun install
bun run start
```

For full installation options, CLI usage, providers, and configuration, see the [CLI guide](apps/cli/README.md).

## Credits

OpenCline builds on [Cline](https://github.com/cline/cline). Upstream code and licensing notices remain governed by the repository's [LICENSE](LICENSE).
