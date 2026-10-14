# OpenCline

OpenCline is our developer-agent fork built on the Cline codebase. The goal is not to ship a cosmetic rename: it is to make a practical, provider-flexible engineering workspace for solo builders who need to understand, change, test, and ship real projects.

## Product principles

- **Own the workflow, not the model.** Keep model/provider choice flexible and avoid hard-coded model IDs or vendor-specific assumptions.
- **Understand before changing.** Inspect project instructions, architecture, scripts, and git state before proposing edits.
- **Small, reviewable changes.** Prefer focused diffs, explicit plans for risky work, and standard commits.
- **Prove the result.** Run relevant tests, builds, and type checks; report what passed, failed, or could not be run.
- **Human control by default.** Make file changes and terminal actions understandable, reviewable, and appropriately permissioned.
- **Useful on real machines.** Prioritize reliable Windows and Linux development workflows, with attention to resource use and clear setup diagnostics.
- **Transparent limitations.** Never claim a build, integration, or action succeeded without evidence.

## Initial target use cases

### 1. Solo-builder project work

Take a task from an existing repository through inspection, implementation, tests, and a concise handoff. Respect repository-specific instructions and avoid unrelated refactors.

### 2. Full-stack product development

Help maintain web apps, APIs, databases, and desktop/mobile projects. Trace behavior across layers, make coordinated changes, and validate the paths affected by a change.

### 3. Local and provider-flexible AI development

Support configurable compatible endpoints and model names without assuming one provider or forcing a model identifier into the application. Make connection errors and missing credentials actionable.

### 4. Security-aware coding

Help review code for common vulnerabilities, explain findings in plain language, and prioritize fixes. Any testing must remain scoped to systems the user owns or is authorized to assess.

### 5. Build and release reliability

Diagnose toolchain, dependency, build, packaging, and CI failures. Distinguish warnings from blockers and development builds from verified release artifacts.

### 6. Repository maintenance

Support focused bug fixes, issue triage, changelog-aware release work, and conventional commit messages without silently rewriting project history.

## Near-term implementation order

1. Establish the fork identity and reproducible development setup.
2. Build and run the unmodified baseline; record environment-specific blockers.
3. Map the existing agent, provider, tool-permission, and UI extension points before changing core behavior.
4. Implement one vertical slice: project-aware task planning, controlled edits, relevant verification, and an evidence-based summary.
5. Add regression tests and security checks for every new workflow.
6. Rebrand UI and docs consistently only after identifying the actual product surfaces and preserving required legal notices.

## Non-goals for the first iteration

- A broad, risky rewrite of the agent runtime.
- Hard-coding one model, endpoint, or API key into the product.
- Removing approval boundaries merely to make automation appear more autonomous.
- Claiming a GitHub fork exists before a destination repository is created and pushed.

## Upstream and licensing

OpenCline is derived from the Cline repository. Preserve the upstream license, copyright notices, and applicable attribution. Keep the upstream remote available for syncing changes. Before publishing, review the current license and third-party notices, and clearly distinguish OpenCline-specific changes from upstream code.
