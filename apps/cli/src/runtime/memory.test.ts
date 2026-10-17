import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	appendMemoryNote,
	buildMemoryPromptSection,
	clearMemory,
	initializeMemory,
	readMemory,
	resolveMemoryPath,
	searchMemory,
} from "./memory";

const temporaryDirectories: string[] = [];
const originalClineDir = process.env.CLINE_DIR;

function tempDir(): string {
	const path = mkdtempSync(join(tmpdir(), "opencline-memory-"));
	temporaryDirectories.push(path);
	return path;
}

afterEach(() => {
	for (const path of temporaryDirectories.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
	if (originalClineDir === undefined) delete process.env.CLINE_DIR;
	else process.env.CLINE_DIR = originalClineDir;
});

describe("persistent memory", () => {
	it("keeps global and project memory in separate locations", () => {
		const cwd = tempDir();
		const configDir = tempDir();
		process.env.CLINE_DIR = configDir;

		expect(resolveMemoryPath("project", cwd)).toBe(
			join(cwd, ".cline", "memory.md"),
		);
		expect(resolveMemoryPath("global", cwd)).toBe(join(configDir, "MEMORY.md"));
	});

	it("initializes each scope without overwriting existing notes", () => {
		const cwd = tempDir();
		const configDir = tempDir();
		process.env.CLINE_DIR = configDir;

		const projectPath = initializeMemory("project", cwd);
		const globalPath = initializeMemory("global", cwd);
		expect(readFileSync(projectPath, "utf8")).toContain("# Project Memory");
		expect(readFileSync(globalPath, "utf8")).toContain("# Global Memory");

		writeFileSync(projectPath, "# Project Memory\n\nKeep this.\n", "utf8");
		initializeMemory("project", cwd);
		expect(readFileSync(projectPath, "utf8")).toContain("Keep this.");
	});

	it("loads both memory scopes with explicit boundaries and maintenance guidance", () => {
		const cwd = tempDir();
		const configDir = tempDir();
		process.env.CLINE_DIR = configDir;
		writeFileSync(
			initializeMemory("global", cwd),
			"# Global\nRemember concise answers.\n",
		);
		writeFileSync(
			initializeMemory("project", cwd),
			"# Project\nUse Bun for scripts.\n",
		);

		const prompt = buildMemoryPromptSection(cwd);
		expect(prompt).toContain("Remember concise answers.");
		expect(prompt).toContain("Use Bun for scripts.");
		expect(prompt).toContain(
			"Never copy project-specific information into global memory.",
		);
		expect(prompt).toContain("MEMORY SHOULD BE QUIET AND NATURAL");
		expect(prompt).toContain("Do not announce that you are saving memory");
		expect(prompt).toContain(resolveMemoryPath("global", cwd));
		expect(prompt).toContain(resolveMemoryPath("project", cwd));
	});

	it("bounds loaded memory and reports truncation", () => {
		const cwd = tempDir();
		const path = initializeMemory("project", cwd);
		writeFileSync(path, "x".repeat(13_000), "utf8");

		const memory = readMemory("project", cwd);
		expect(memory.content).toHaveLength(12_000);
		expect(memory.truncated).toBe(true);
	});

	it("adds notes without duplicates and preserves existing content", () => {
		const cwd = tempDir();
		const path = initializeMemory("project", cwd);
		writeFileSync(path, "# Project Memory\n\nUse Bun for scripts.\n", "utf8");

		expect(appendMemoryNote("project", "Prefer focused tests.", cwd).added).toBe(true);
		expect(appendMemoryNote("project", "Prefer focused tests.", cwd).added).toBe(false);
		const content = readFileSync(path, "utf8");
		expect(content).toContain("Use Bun for scripts.");
		expect(content.match(/Prefer focused tests\./g)).toHaveLength(1);
	});

	it("searches relevant memory lines without crossing scopes", () => {
		const cwd = tempDir();
		const configDir = tempDir();
		process.env.CLINE_DIR = configDir;
		writeFileSync(initializeMemory("project", cwd), "# Project\nUse Bun for package scripts.\nRun focused tests first.\n", "utf8");
		writeFileSync(initializeMemory("global", cwd), "# Global\nPrefer concise answers.\n", "utf8");

		expect(searchMemory("project", "Bun scripts", cwd).map((entry) => entry.text)).toContain("Use Bun for package scripts.");
		expect(searchMemory("global", "Bun scripts", cwd)).toHaveLength(0);
	});

	it("clears only the selected scope", () => {
		const cwd = tempDir();
		const configDir = tempDir();
		process.env.CLINE_DIR = configDir;
		writeFileSync(initializeMemory("project", cwd), "project note");
		writeFileSync(initializeMemory("global", cwd), "global note");

		clearMemory("project", cwd);
		expect(readMemory("project", cwd).content).not.toContain("project note");
		expect(readMemory("global", cwd).content).toContain("global note");
	});
});
