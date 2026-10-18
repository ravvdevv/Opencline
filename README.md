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

Most coding agents can edit files. The annoying part is getting them to work the way you actually want.

**OpenCline makes the useful stuff the default:** concise responses, practical coding habits, persistent project context, focused safety checks, and recovery when providers have a bad day.

It is an opinionated fork of [Cline](https://github.com/cline/cline), built around a simple idea: **spend your tokens shipping software, not managing your AI.**

## Why OpenCline?

- **Gets to the point.** Caveman Ultra and Ponytail Ultra provide concise, task-focused defaults, with style commands you can change whenever you want.
- **Remembers what matters.** Separate user, global, and project memory help preserve preferences and decisions between sessions.
- **Works with you, not against you.** Normal implementation stays autonomous, while focused safeguards catch recognizable destructive commands and possible secret leaks.
- **Recovers from provider hiccups.** Retries handle temporary overloads and dropped streams, with clear errors when recovery runs out.
- **Helps you ship properly.** Project initialization and change-verification tools help generate guidance and run relevant checks.
- **Ready for Windows.** A standalone x64 CLI, checksum-verified installer, and guarded updater make setup less of a side quest.

## What’s improved

### Less prompt babysitting

- Built-in `/caveman` and `/ponytail` style commands support `lite`, `full`, `ultra`, and `off`; Ultra is the default level. Their core behavior does not require downloading a skill just to use the style commands.
- Built-in `/i-have-adhd`, `/ponytail-review`, `/ponytail-audit`, and `/ponytail-debt` prompt helpers provide focused response, review, audit, and technical-debt guidance.
- Startup skill injection can load the actual installed Caveman, Ponytail, and `i-have-adhd` skill instructions into the session. The startup defaults are separate from the allowlist for on-demand skill calls.
- Built-in `/init` inspects a project and creates or carefully updates `AGENTS.md` using repository evidence, while avoiding unrelated source changes and preserving existing guidance.
- Persistent memory uses three separate stores: user profile, global agent knowledge, and project-specific memory. Entries support add, replace, and remove operations, with size limits and basic prompt-injection checks.
- A focused safety guard blocks recognizable dangerous operations such as disk/partition destruction, broad recursive deletion, destructive Git commands, destructive database statements, and commands that appear to send credentials or secret files externally. It is designed to avoid forcing a synthetic specification-approval or failing-test cycle for normal edits.
- A change-verification script identifies changed files and affected packages, runs relevant package checks, and rebuilds SDK packages when SDK source changes.

### Reliability when providers wobble

- Retries for temporary provider-overload errors.
- Retries for dropped provider streams, with explicit exhaustion reporting instead of silently leaving a session in a confusing state.
- Correct handling of selected AWS Bedrock profiles.
- Explicit style overrides take precedence cleanly, and built-in style commands expand locally without an extra model call.

### Windows without the setup scavenger hunt

- Standalone Windows x64 CLI executable for users who don't want to install Node.js or Bun separately to run the published binary.
- GitHub Actions release workflow validates version tags, builds the executable, smoke-tests `--version` and `--help`, and publishes a SHA-256 checksum with the binary.
- PowerShell release installer verifies the downloaded executable against its checksum, installs to the user's local application directory, and adds the executable to the user PATH.
- Local updater checks for running OpenCline processes, stages the replacement binary before swapping it in, retries transient file-lock failures, and verifies the installed version.
- Release checks gate publishing on CLI validation.

These changes focus on the terminal workflow and Windows CLI distribution. OpenCline still builds on Cline's shared codebase, and the feature list should not be read as a claim that every upstream component has been rewritten or every optional interface is packaged as a finished product.

## Get started

### Windows: install the latest release

Open the [latest releases](https://github.com/ravvdevv/opencline/releases) and download `opencline-windows-x64.exe` if an executable is attached.

Or install it from PowerShell:

```powershell
irm https://raw.githubusercontent.com/ravvdevv/opencline/main/apps/cli/script/install-opencline-release.ps1 | iex
```

The installer verifies the downloaded binary against its published SHA-256 checksum before installation. If no executable is attached to the latest release yet, use the local build steps below.

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

## Project status

- **CLI:** the primary focus, with a Windows x64 build and release-install workflow.
- **VS Code:** extension source exists in `apps/vscode/`; this README does not claim a separately verified OpenCline Marketplace release.
- **Desktop app:** `apps/examples/desktop-app` is an example project, not a claim that a polished, production-ready desktop installer is available.

OpenCline is actively evolving. Expect changes as features are tested and the workflow gets sharper.

## Credits

OpenCline builds on [Cline](https://github.com/cline/cline). Upstream code and licensing notices remain governed by the repository's [LICENSE](LICENSE).
