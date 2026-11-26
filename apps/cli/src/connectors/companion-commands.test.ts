import { afterEach, describe, expect, it, vi } from "vitest";
import { GOAL_ACHIEVED_MARKER } from "../tui/utils/goal-command";
import {
	clearGoalIfAchieved,
	maybeHandleConnectorCompanionCommand,
	stopConnectorCompanionLoop,
	type ConnectorCompanionContext,
} from "./companion-commands";

let counter = 0;

function makeContext(
	text: string,
	overrides: Partial<ConnectorCompanionContext> = {},
) {
	const key = `companion-test-${++counter}`;
	const replies: string[] = [];
	const submitted: string[] = [];
	let goal: string | null = null;
	const context: ConnectorCompanionContext = {
		key,
		text,
		workspaceRoot: "/workspace",
		reply: async (message) => {
			replies.push(message);
		},
		isRunning: () => true,
		submit: async (prompt) => {
			submitted.push(prompt);
		},
		getGoal: () => goal,
		setGoal: (next) => {
			goal = next;
		},
		...overrides,
	};
	return { context, key, replies, submitted, getGoal: () => goal };
}

afterEach(() => {
	vi.useRealTimers();
});

describe("connector companion commands", () => {
	it("steers a side question with /btw", async () => {
		const test = makeContext("/btw what changed?");

		expect(await maybeHandleConnectorCompanionCommand(test.context)).toBe(true);
		expect(test.submitted).toEqual(["what changed?"]);
		expect(test.replies[0]).toContain("Side question sent");
	});

	it("rejects /btw without an argument or active task", async () => {
		const noArgs = makeContext("/btw");
		expect(await maybeHandleConnectorCompanionCommand(noArgs.context)).toBe(true);
		expect(noArgs.replies[0]).toContain("Usage:");

		const idle = makeContext("/btw what changed?", {
			isRunning: () => false,
		});
		expect(await maybeHandleConnectorCompanionCommand(idle.context)).toBe(true);
		expect(idle.replies[0]).toContain("only be used while a task is running");
		expect(idle.submitted).toEqual([]);
	});

	it("sets, shows, and clears a goal", async () => {
		const set = makeContext("/goal ship the fix");
		await maybeHandleConnectorCompanionCommand(set.context);
		expect(set.getGoal()).toBe("ship the fix");

		const show = makeContext("/goal", {
			getGoal: set.getGoal,
			setGoal: set.context.setGoal,
		});
		await maybeHandleConnectorCompanionCommand(show.context);
		expect(show.replies[0]).toContain("ship the fix");

		const clear = makeContext("/goal clear", {
			getGoal: set.getGoal,
			setGoal: set.context.setGoal,
		});
		await maybeHandleConnectorCompanionCommand(clear.context);
		expect(set.getGoal()).toBeNull();
	});

	it("repeats a prompt on an interval and stops it", async () => {
		vi.useFakeTimers();
		const test = makeContext("/loop 5m check deploy");

		expect(await maybeHandleConnectorCompanionCommand(test.context)).toBe(true);
		expect(test.replies[0]).toContain("Loop started");

		await vi.advanceTimersByTimeAsync(300_000);
		expect(test.submitted).toEqual(["check deploy"]);

		const stop = makeContext("/loop stop", { key: test.key });
		expect(await maybeHandleConnectorCompanionCommand(stop.context)).toBe(true);
		expect(stop.replies[0]).toBe("Loop stopped.");

		await vi.advanceTimersByTimeAsync(300_000);
		expect(test.submitted).toEqual(["check deploy"]);
	});

	it("supports /proactive and loop status", async () => {
		vi.useFakeTimers();
		const start = makeContext("/proactive watch build");
		await maybeHandleConnectorCompanionCommand(start.context);

		const status = makeContext("/loop status", { key: start.key });
		await maybeHandleConnectorCompanionCommand(status.context);
		expect(status.replies[0]).toContain("watch build");

		stopConnectorCompanionLoop(start.key);
	});

	it("clears the goal when a final reply reports it achieved", () => {
		const goal = makeContext("/goal ship it");
		goal.context.setGoal("ship it");

		clearGoalIfAchieved(goal.context, `done ${GOAL_ACHIEVED_MARKER}`);
		expect(goal.getGoal()).toBeNull();
	});

	it("clears loop and goal on /clear but leaves it to the normal handler", async () => {
		vi.useFakeTimers();
		const goal = makeContext("/goal ship it");
		await maybeHandleConnectorCompanionCommand(goal.context);

		const loop = makeContext("/loop 1h watch", { key: goal.key });
		await maybeHandleConnectorCompanionCommand(loop.context);

		const clear = makeContext("/clear", {
			key: goal.key,
			getGoal: goal.getGoal,
			setGoal: goal.context.setGoal,
		});
		expect(await maybeHandleConnectorCompanionCommand(clear.context)).toBe(false);
		expect(goal.getGoal()).toBeNull();

		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(loop.submitted).toEqual([]);
	});
});
