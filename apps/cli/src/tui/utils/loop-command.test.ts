import { describe, expect, it } from "vitest";
import {
	getSlashCommandArguments,
	parseLoopArguments,
	parseLoopControl,
	parseLoopInterval,
	SELF_PACED_LOOP_LABEL,
} from "./loop-command";

describe("getSlashCommandArguments", () => {
	it("extracts inline arguments after the command token", () => {
		expect(getSlashCommandArguments("/btw what changed?", "btw")).toBe(
			"what changed?",
		);
	});

	it("keeps multiline prompts and ignores leading whitespace", () => {
		expect(
			getSlashCommandArguments("  /loop 5m check build\nthen run tests", "loop"),
		).toBe("5m check build\nthen run tests");
	});

	it("returns an empty string for unrelated commands", () => {
		expect(getSlashCommandArguments("/status", "loop")).toBe("");
		expect(getSlashCommandArguments(undefined, "loop")).toBe("");
	});
});

describe("parseLoopInterval", () => {
	it.each([
		["30s", 30_000, "30 seconds"],
		["5m", 300_000, "5 minutes"],
		["1 hour", 3_600_000, "1 hour"],
		["2 min check deploy", 120_000, "2 minutes"],
	])("parses %s", (input, intervalMs, intervalLabel) => {
		expect(parseLoopInterval(input)).toMatchObject({
			intervalMs,
			intervalLabel,
		});
	});

	it("rejects non-interval input", () => {
		expect(parseLoopInterval("check build")).toBeUndefined();
		expect(parseLoopInterval("0m check build")).toBeUndefined();
	});
});

describe("parseLoopArguments", () => {
	it("uses self-paced mode when only a prompt is given", () => {
		expect(parseLoopArguments("check build", "fallback")).toEqual({
			ok: true,
			loop: {
				intervalMs: null,
				intervalLabel: SELF_PACED_LOOP_LABEL,
				prompt: "check build",
			},
		});
	});

	it("uses self-paced mode with no arguments", () => {
		expect(parseLoopArguments("", "fallback")).toEqual({
			ok: true,
			loop: {
				intervalMs: null,
				intervalLabel: SELF_PACED_LOOP_LABEL,
				prompt: "fallback",
			},
		});
	});

	it("uses the fallback prompt when only an interval is given", () => {
		expect(parseLoopArguments("10m", "fallback")).toEqual({
			ok: true,
			loop: {
				intervalMs: 600_000,
				intervalLabel: "10 minutes",
				prompt: "fallback",
			},
		});
	});

	it("rejects malformed intervals", () => {
		expect(parseLoopArguments("0m check build", "fallback")).toEqual({
			ok: false,
			error: expect.stringContaining("Invalid loop interval"),
		});
	});
});

describe("parseLoopControl", () => {
	it("recognizes stop and status case-insensitively", () => {
		expect(parseLoopControl("STOP")).toBe("stop");
		expect(parseLoopControl(" status ")).toBe("status");
		expect(parseLoopControl("5m check build")).toBeUndefined();
	});
});
