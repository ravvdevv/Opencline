import { describe, expect, it } from "vitest";
import {
	formatGoalPrompt,
	GOAL_ACHIEVED_MARKER,
	hasGoalAchievedMarker,
	parseGoalArguments,
} from "./goal-command";

describe("parseGoalArguments", () => {
	it("shows the goal with no arguments", () => {
		expect(parseGoalArguments("  ")).toEqual({ kind: "show" });
	});

	it.each(["clear", "STOP", "off", "reset", "none", "cancel"])(
		"treats %s as clearing the goal",
		(input) => {
			expect(parseGoalArguments(input)).toEqual({ kind: "clear" });
		},
	);

	it("keeps the full condition as the goal", () => {
		expect(parseGoalArguments("ship the fix\nand run tests")).toEqual({
			kind: "set",
			goal: "ship the fix\nand run tests",
		});
	});
});

describe("formatGoalPrompt", () => {
	it("prefixes the active goal without changing the prompt", () => {
		const result = formatGoalPrompt("ship the fix", "check the tests");
		expect(result).toContain("<session_goal>");
		expect(result).toContain("Active goal: ship the fix");
		expect(result).toContain(GOAL_ACHIEVED_MARKER);
		expect(result.endsWith("check the tests")).toBe(true);
	});

	it("leaves prompts alone when no goal is active", () => {
		expect(formatGoalPrompt(null, "check the tests")).toBe("check the tests");
		expect(formatGoalPrompt("  ", "check the tests")).toBe("check the tests");
	});

	it("does not inject twice", () => {
		const once = formatGoalPrompt("ship the fix", "check the tests");
		expect(formatGoalPrompt("other goal", once)).toBe(once);
	});
});

describe("hasGoalAchievedMarker", () => {
	it("detects the marker only when present", () => {
		expect(hasGoalAchievedMarker(`done ${GOAL_ACHIEVED_MARKER}`)).toBe(true);
		expect(hasGoalAchievedMarker("done")).toBe(false);
	});
});
