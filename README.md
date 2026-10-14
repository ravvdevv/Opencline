<p align="center">
  <img src="assets/icons/icon.png" width="76" alt="OpenCline logo" />
</p>

<h1 align="center">OpenCline</h1>

<p align="center">
  A terminal-first AI coding agent.
  <br />
  Explore codebases, make changes, run commands, and iterate from your terminal.
</p>

<p align="center">
  <a href="apps/cli/README.md">CLI guide</a> ·
  <a href="LICENSE">License</a> ·
  <a href="https://github.com/cline/cline">Upstream project</a>
</p>

---

OpenCline is an independent, CLI-focused fork of [Cline](https://github.com/cline/cline). The goal is simple: make a capable coding agent comfortable to use directly from a terminal, with flexible model configuration and a workflow that keeps the developer in control.

This repository is focused on the **OpenCline CLI**. The upstream project includes other products and integrations; they are not the focus of this fork.

## What it does

- **Work in your repository:** inspect files, understand project structure, and make coordinated code changes.
- **Run development tools:** execute commands, tests, builds, and other project workflows.
- **Use your preferred model:** configure supported providers or an OpenAI-compatible endpoint, including local model servers.
- **Stay in control:** review tool actions and choose the level of autonomy appropriate for the task.
- **Extend the workflow:** use the CLI's supported tools, MCP integrations, rules, and skills.

OpenCline is actively being adapted from upstream Cline. Some behavior and branding may still reflect upstream conventions while the fork is in progress.

## Quick start

### Requirements

- [Bun](https://bun.sh/) compatible with the version specified in the root package.json
- Git
- Windows, macOS, or Linux (platform-specific features may vary)

### Run from source

Clone the repository and install dependencies:

    git clone https://github.com/ravvdevv/opencline.git
    cd opencline
    bun install
    bun run start

The first start builds the SDK workspace packages before launching the CLI. To pass CLI arguments through the development script:

    bun run start -- --help
    bun run start -- -i

To check the CLI version:

    bun run start -- --version

### Build a standalone Windows CLI

From PowerShell at the repository root:

    .\apps\cli\script\install-opencline.ps1

The installer builds the Windows x64 executable, installs it to %LOCALAPPDATA%\OpenCline\opencline.exe, and adds the install directory to your user PATH. Open a new terminal and run:

    opencline --help
    opencline -i

Close running OpenCline processes before reinstalling so Windows can replace the executable.

## Configure a model

OpenCline supports the provider and authentication flows implemented by its CLI. To see available options, run:

    bun run start -- --help
    bun run start -- auth

For an OpenAI-compatible local server, configure the provider with that server's base URL, API key (if required), and model ID. For example, a server exposing an OpenAI-compatible API at http://localhost:1234/v1 can be configured with the CLI's openai-compatible provider.

Changing a base URL does not translate between API protocols. The endpoint must implement the protocol expected by the selected provider.

See the [CLI guide](apps/cli/README.md) for provider setup, modes, and command details.

## Development

Install dependencies:

    bun install

Run the CLI from source:

    bun run start

Run the CLI typecheck:

    bun -F @cline/cli typecheck

Run the CLI unit tests:

    bun -F @cline/cli test:unit

Build the standalone CLI for the current platform:

    bun -F @cline/cli build:platforms:single

## Project status

OpenCline is under active development. The current priority is a dependable terminal workflow, clean model configuration, correct standalone builds, and a clear OpenCline identity. Features inherited from upstream are subject to change as the fork evolves.

Please report reproducible bugs with your operating system, Bun version, command, and relevant error output. Avoid posting API keys, tokens, or other secrets.

## Credits and license

OpenCline is based on [Cline](https://github.com/cline/cline) and retains the upstream project's applicable notices and license. See [LICENSE](LICENSE) for the license included in this repository.

Thanks to the Cline team and contributors whose work makes this fork possible.
