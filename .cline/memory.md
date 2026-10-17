# Project Memory

## Project
- OpenCline is a fork of Cline focused on the CLI. Keep user-facing branding as OpenCline, including the executable name `opencline.exe` and custom icon assets.
- Repository uses Bun and TypeScript. Follow `AGENTS.md` and repository instructions; when SDK source changes, run `bun run build:sdk` before CLI tests.

## Decisions and conventions
- Keep the CLI usable from the terminal, including YOLO mode where supported, web search/fetch where enabled by configuration, and persistent memory.
- Global `MEMORY.md` and `USER.md` live in `%USERPROFILE%\\.cline\\`; project memory remains `.cline\\memory.md` under the active project directory. Put user preferences in `USER.md`, reusable agent/environment lessons in `MEMORY.md`, and workspace-specific decisions in project memory.
- Keep global memory project-agnostic. Record OpenCline implementation details and repository work here instead.

## Current memory implementation
- `apps/cli/src/runtime/memory.ts` provides a Hermes-style `memory` tool with add/replace/remove actions across `memory`, `user`, and `project` targets, duplicate detection, scoped limits, and basic injection-pattern screening.
- `MEMORY.md` is limited to 2,200 characters, `USER.md` to 1,375, and project memory to 2,200. All three bounded snapshots are injected at session start to keep the prompt prefix stable and token overhead predictable.
- The interactive TUI exposes the persistent memory tool in both plan and act modes. Changes are written immediately and appear in the next session's system prompt; there is no separate background review worker or full session-search tool yet.
- CLI commands: `opencline memory`, `opencline memory-global`, and `opencline memory-user`, supporting `--init`, `--path`, `--clear --yes`, `--add <note>`, and `--search <query>`.

## Verification and known issues
- Latest successful standalone build command before current memory changes: `bun run apps/cli/script/build.ts --single`.
- Current focused memory/prompt/mode tests: 29 passed; CLI typecheck and `git diff --check` passed.
- The Windows standalone smoke tests previously passed version and hub checks. Temporary smoke-test cleanup can warn that a temp directory is locked.

## Latest improvements
- `apps/cli/src/runtime/prompt.ts` recognizes Windows drive-letter paths such as `@C:\\Users\\...` in file mentions; prompt tests pass on Windows.
- `apps/cli/src/runtime/memory.ts` provides scoped memory search and deduplicated note append, exposed through the CLI memory commands.
- `act.ts` and `yolo.ts` instruct the agent to use a closed coding loop: inspect, implement, test, diagnose, verify the final diff, and report evidence.
- Token efficiency guidance favors narrow searches, relevant file ranges, batching independent reads, and focused validation without skipping necessary checks.
