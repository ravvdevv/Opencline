# Project Memory

## Project
- OpenCline is a fork of Cline focused on the CLI. Keep user-facing branding as OpenCline, including the executable name `opencline.exe` and custom icon assets.
- Repository uses Bun and TypeScript. Follow `AGENTS.md` and repository instructions; when SDK source changes, run `bun run build:sdk` before CLI tests.

## Decisions and conventions
- Keep the CLI usable from the terminal, including YOLO mode where supported, web search/fetch where enabled by configuration, and persistent memory.
- Global memory belongs in `%USERPROFILE%\.cline\MEMORY.md`; project memory belongs in `.cline\memory.md` under the active project directory.
- Keep global memory project-agnostic. Record OpenCline implementation details and repository work here instead.

## Current memory implementation
- `apps/cli/src/runtime/memory.ts` resolves, reads, initializes, clears, and injects global/project memory into the system prompt.
- `apps/cli/src/runtime/prompt.ts` adds both scopes to the prompt for the CLI's normal agent flow.
- CLI commands: `opencline memory` and `opencline memory-global`, supporting `--init`, `--path`, `--clear --yes`, `--add <note>` (deduplicated), and `--search <query>` (ranked matching lines).
- Memory files are bounded to 12,000 characters when loaded. The agent is prompted to update memory, but automatic saves are still model/tool-driven, not guaranteed by a background session-end service.

## Verification and known issues
- Latest successful standalone build command: `bun run apps/cli/script/build.ts --single`.
- Focused memory/prompt tests passed: 14 tests after adding memory add/search coverage and Windows absolute-path parsing.
- CLI typecheck passed.
- Latest `bun run verify:changes` passed: SDK build, 107 focused CLI tests, package typechecks, and `git diff --check`.
- The Windows standalone smoke tests passed version and hub checks. Temporary smoke-test cleanup can warn that a temp directory is locked.

## Latest improvements
- `apps/cli/src/runtime/prompt.ts` now recognizes Windows drive-letter paths such as `@C:\\Users\\...` in file mentions; prompt tests pass on Windows.
- `apps/cli/src/runtime/memory.ts` provides scoped memory search and deduplicated note append, exposed through `opencline memory --search/--add` and global equivalents.
- `act.ts` and `yolo.ts` now instruct the agent to use a closed coding loop: inspect, implement, test, diagnose, verify the final diff, and report evidence.
- Memory updates remain model/tool-driven; there is not yet a guaranteed background save hook.
