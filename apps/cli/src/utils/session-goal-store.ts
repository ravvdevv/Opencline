import { randomUUID } from "node:crypto";
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveClineDataDir } from "@cline/shared/storage";

type GoalMap = Record<string, string>;

function getGoalsPath(): string {
	return join(resolveClineDataDir(), "cache", "workspace-goals.json");
}

function readGoals(): GoalMap {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(getGoalsPath(), "utf8"),
		);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		return parsed as GoalMap;
	} catch {
		// Missing, unreadable, or corrupt files mean no persisted goals.
		return {};
	}
}

function writeGoals(goals: GoalMap): void {
	const path = getGoalsPath();
	const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(tempPath, `${JSON.stringify(goals, null, 2)}\n`, "utf8");
		renameSync(tempPath, path);
	} catch {
		// Persistence is best effort; the TUI must stay usable on read-only disks.
		rmSync(tempPath, { force: true });
	}
}

export function readSessionGoal(workspaceRoot: string): string | null {
	const value = readGoals()[workspaceRoot];
	return typeof value === "string" && value.trim() ? value : null;
}

/** Pass `null` to remove the goal for this workspace. */
export function writeSessionGoal(
	workspaceRoot: string,
	goal: string | null,
): void {
	const goals = readGoals();
	const trimmed = goal?.trim();
	if (trimmed) {
		goals[workspaceRoot] = trimmed;
	} else {
		delete goals[workspaceRoot];
	}
	writeGoals(goals);
}
