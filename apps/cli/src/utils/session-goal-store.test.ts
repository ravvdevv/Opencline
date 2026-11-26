import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSessionGoal, writeSessionGoal } from "./session-goal-store";

describe("session goal store", () => {
	let dataDir: string;
	let originalDataDir: string | undefined;

	beforeEach(() => {
		dataDir = mkdtempSync(join(tmpdir(), "cline-goal-store-"));
		originalDataDir = process.env.CLINE_DATA_DIR;
		process.env.CLINE_DATA_DIR = dataDir;
	});

	afterEach(() => {
		if (originalDataDir === undefined) {
			delete process.env.CLINE_DATA_DIR;
		} else {
			process.env.CLINE_DATA_DIR = originalDataDir;
		}
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("round-trips a goal per workspace", () => {
		writeSessionGoal("/workspace/a", "ship the fix");
		writeSessionGoal("/workspace/b", "run tests");

		expect(readSessionGoal("/workspace/a")).toBe("ship the fix");
		expect(readSessionGoal("/workspace/b")).toBe("run tests");
	});

	it("removes a goal when cleared", () => {
		writeSessionGoal("/workspace/a", "ship the fix");
		writeSessionGoal("/workspace/a", null);

		expect(readSessionGoal("/workspace/a")).toBeNull();
	});

	it("treats corrupt state as no goal", () => {
		const goalsPath = join(dataDir, "cache", "workspace-goals.json");
		mkdirSync(join(goalsPath, ".."), { recursive: true });
		writeFileSync(goalsPath, "not json", "utf8");

		expect(readSessionGoal("/workspace/a")).toBeNull();

		writeSessionGoal("/workspace/a", "fresh goal");
		expect(
			JSON.parse(readFileSync(goalsPath, "utf8")) as Record<string, string>,
		).toEqual({ "/workspace/a": "fresh goal" });
	});
});
