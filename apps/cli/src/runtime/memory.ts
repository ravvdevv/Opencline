import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveClineDir } from "@cline/shared/storage";

export const PROJECT_MEMORY_RELATIVE_PATH = join(".cline", "memory.md");
export const GLOBAL_MEMORY_FILE_NAME = "MEMORY.md";
export const MEMORY_MAX_CHARS = 12_000;

export interface MemoryDocument {
	scope: "global" | "project";
	path: string;
	content: string;
	exists: boolean;
	truncated: boolean;
}

export function resolveMemoryPath(
	scope: "global" | "project",
	cwd = process.cwd(),
): string {
	return scope === "global"
		? join(resolveClineDir(), GLOBAL_MEMORY_FILE_NAME)
		: join(resolve(cwd), PROJECT_MEMORY_RELATIVE_PATH);
}

export function readMemory(
	scope: "global" | "project",
	cwd = process.cwd(),
): MemoryDocument {
	const path = resolveMemoryPath(scope, cwd);
	if (!existsSync(path)) {
		return { scope, path, content: "", exists: false, truncated: false };
	}
	try {
		const content = readFileSync(path, "utf8");
		return {
			scope,
			path,
			content: content.slice(0, MEMORY_MAX_CHARS),
			exists: true,
			truncated: content.length > MEMORY_MAX_CHARS,
		};
	} catch {
		return { scope, path, content: "", exists: false, truncated: false };
	}
}

export function initializeMemory(
	scope: "global" | "project",
	cwd = process.cwd(),
): string {
	const path = resolveMemoryPath(scope, cwd);
	mkdirSync(scope === "global" ? resolveClineDir() : resolve(cwd, ".cline"), {
		recursive: true,
	});
	if (!existsSync(path)) {
		const title = scope === "global" ? "Global Memory" : "Project Memory";
		const description =
			scope === "global"
				? "Durable preferences and context that apply across projects."
				: "Durable facts, decisions, conventions, and workflows for this project.";
		writeFileSync(
			path,
			`# ${title}\n\n> ${description}\n\n## Context\n\n\n## Decisions and conventions\n\n\n## Ongoing work\n\n`,
			"utf8",
		);
	}
	return path;
}

export function clearMemory(
	scope: "global" | "project",
	cwd = process.cwd(),
): string {
	const path = resolveMemoryPath(scope, cwd);
	mkdirSync(scope === "global" ? resolveClineDir() : resolve(cwd, ".cline"), {
		recursive: true,
	});
	const title = scope === "global" ? "Global Memory" : "Project Memory";
	writeFileSync(path, `# ${title}\n\n`, "utf8");
	return path;
}

export function searchMemory(
	scope: "global" | "project",
	query: string,
	cwd = process.cwd(),
	limit = 20,
): Array<{ line: number; text: string; score: number }> {
	const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])];
	if (terms.length === 0) return [];
	const memory = readMemory(scope, cwd);
	return memory.content
		.split(/\r?\n/)
		.map((text, index) => {
			const normalized = text.toLowerCase();
			const score = terms.reduce(
				(total, term) => total + (normalized.includes(term) ? 1 : 0),
				0,
			);
			return { line: index + 1, text, score };
		})
		.filter((entry) => entry.score > 0 && entry.text.trim().length > 0)
		.sort((a, b) => b.score - a.score || a.line - b.line)
		.slice(0, Math.max(1, limit));
}

export function appendMemoryNote(
	scope: "global" | "project",
	note: string,
	cwd = process.cwd(),
): { path: string; added: boolean } {
	const normalizedNote = note.trim().replace(/\s+/g, " ");
	if (!normalizedNote) throw new Error("Memory note cannot be empty.");
	const path = initializeMemory(scope, cwd);
	const existing = readFileSync(path, "utf8");
	const noteLine = `- ${normalizedNote}`;
	if (
		existing
			.split(/\r?\n/)
			.some((line) => line.trim().toLowerCase() === noteLine.toLowerCase())
	) {
		return { path, added: false };
	}

	const sectionHeading = "## Captured notes";
	const headingIndex = existing.indexOf(sectionHeading);
	let updated: string;
	if (headingIndex >= 0) {
		const insertAt = existing.indexOf("\n", headingIndex) + 1;
		updated = `${existing.slice(0, insertAt)}${noteLine}\n${existing.slice(insertAt)}`;
	} else {
		updated = `${existing.trimEnd()}\n\n${sectionHeading}\n${noteLine}\n`;
	}
	if (updated.length > MEMORY_MAX_CHARS) {
		throw new Error(
			`Memory limit exceeded (${MEMORY_MAX_CHARS} characters). Edit or remove outdated notes first.`,
		);
	}
	writeFileSync(path, updated, "utf8");
	return { path, added: true };
}

export function buildMemoryPromptSection(cwd = process.cwd()): string {
	const globalMemory = readMemory("global", cwd);
	const projectMemory = readMemory("project", cwd);
	const sections = [
		`### Global memory (applies across projects)\nFile: ${globalMemory.path}\n\n${globalMemory.content.trim() || "(No global memory saved yet.)"}`,
		`### Project memory (only for this workspace)\nFile: ${projectMemory.path}\n\n${projectMemory.content.trim() || "(No project memory saved yet.)"}`,
	];

	return [
		"# Persistent Memory",
		"Persistent memory is stored in two separate Markdown files. Global memory applies across projects; project memory applies only to the current workspace. Treat saved notes as useful context, verify them against the current repository when needed, and never mix the two scopes.",
		...sections,
		"## Memory maintenance",
		"- MEMORY SHOULD BE QUIET AND NATURAL. When the user shares a useful, non-sensitive fact for continuity (for example, 'I'm 19', a durable preference, or a project detail), save it to the appropriate memory file before replying. Do not announce that you are saving memory, narrate file operations, or make the conversation awkward. Respond naturally to the user's message (for example, 'Got it' when appropriate).",
		"- When the user explicitly asks you to remember something, save it immediately, even during a short casual exchange. Use file tools to actually write the file, then verify the write. Do not treat acknowledging a fact in chat as persistence.",
		"- Never mention memory maintenance unless the user asks about it, a write fails and affects the request, or disclosure is needed to explain a limitation. Never claim that something was saved unless the file write succeeded.",
		"- For substantial coding tasks, before reporting completion, review what durable information was learned and update the appropriate memory file using file tools. If there is a genuinely useful new fact, decision, correction, preference, unresolved issue, or workflow lesson, write it now rather than merely planning to remember it.",
		"- If the appropriate memory file does not exist, create it. If it exists, read it first, then edit it in place: preserve valid notes, deduplicate, correct stale facts, and keep the file organized. Never overwrite useful notes with a blank template.",
		"- Do not write memory for trivial requests or when there is no durable new information. Never claim that something was saved unless the file write succeeded.",
		"- Do not save secrets, credentials, access tokens, private personal data, transient command output, guesses, or facts that are already obvious from source code.",
		"- Keep notes concise, factual, deduplicated, and organized. Correct stale notes instead of endlessly appending. Stay within 12,000 characters per file.",
		"- At the end of substantial work, persist a short summary of changed files, important decisions, validation results, and remaining issues in project memory. Put only reusable preferences and cross-project conventions in global memory.",
		"- Ask before saving sensitive or ambiguous personal details. Never copy project-specific information into global memory.",
	].join("\n\n");
}
