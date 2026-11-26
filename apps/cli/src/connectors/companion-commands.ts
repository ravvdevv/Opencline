import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasGoalAchievedMarker, parseGoalArguments } from "../tui/utils/goal-command";
import {
	DEFAULT_LOOP_PROMPT,
	getSlashCommandArguments,
	parseLoopArguments,
	parseLoopControl,
	SELF_PACED_LOOP_LABEL,
	SELF_PACED_MIN_DELAY_MS,
} from "../tui/utils/loop-command";
import { normalizeCommandName } from "../utils/chat-commands";

type ActiveLoop = {
	id: number;
	prompt: string;
	intervalLabel: string;
	selfPaced: boolean;
	timer?: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>;
	inFlight: boolean;
};

const activeLoops = new Map<string, ActiveLoop>();
let loopSequence = 0;

export type ConnectorCompanionContext = {
	/** Stable per-thread key used to isolate loop state. */
	key: string;
	/** Raw incoming text, including any @bot address on the command token. */
	text: string;
	botUserName?: string;
	workspaceRoot: string;
	reply: (text: string) => Promise<void>;
	isRunning: () => boolean;
	/** Steer an active turn, or start a new one when idle. */
	submit: (prompt: string) => Promise<void>;
	getGoal: () => string | null;
	setGoal: (goal: string | null) => void;
};

function argumentsFor(text: string, commandName: string): string {
	const withoutBotAddress = text.trim().replace(/^(\S+?)@\S+/, "$1");
	return getSlashCommandArguments(withoutBotAddress, commandName);
}

function stopLoop(key: string): boolean {
	const active = activeLoops.get(key);
	if (!active) return false;
	clearInterval(active.timer);
	activeLoops.delete(key);
	return true;
}

/** Stop a connector's loop when its session is cleared or the connector exits. */
export function stopConnectorCompanionLoop(key: string): void {
	stopLoop(key);
}

async function readLoopDefault(workspaceRoot: string): Promise<string> {
	try {
		const custom = (
			await readFile(join(workspaceRoot, "loop.md"), "utf8")
		).trim();
		return custom || DEFAULT_LOOP_PROMPT;
	} catch {
		return DEFAULT_LOOP_PROMPT;
	}
}

async function runLoopTick(
	context: ConnectorCompanionContext,
	loop: ActiveLoop,
): Promise<void> {
	if (activeLoops.get(context.key)?.id !== loop.id || loop.inFlight) return;
	loop.inFlight = true;
	try {
		await context.submit(loop.prompt);
	} catch (error) {
		await context.reply(
			`Loop prompt failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		loop.inFlight = false;
		if (loop.selfPaced && activeLoops.get(context.key)?.id === loop.id) {
			const waitForIdle = () => {
				if (activeLoops.get(context.key)?.id !== loop.id) return;
				if (context.isRunning()) {
					const retry = setTimeout(waitForIdle, SELF_PACED_MIN_DELAY_MS);
					retry.unref?.();
					const current = activeLoops.get(context.key);
					if (current) current.timer = retry;
					return;
				}
				const timer = setTimeout(
					() => void runLoopTick(context, loop),
					SELF_PACED_MIN_DELAY_MS,
				);
				timer.unref?.();
				const current = activeLoops.get(context.key);
				if (current) current.timer = timer;
			};
			waitForIdle();
		}
	}
}

async function runLoop(
	context: ConnectorCompanionContext,
	args: string,
): Promise<void> {
	const control = parseLoopControl(args);
	if (control === "stop") {
		await context.reply(
			stopLoop(context.key)
				? "Loop stopped."
				: "No active loop in this thread.",
		);
		return;
	}
	if (control === "status") {
		const active = activeLoops.get(context.key);
		await context.reply(
			active
				? `Active loop: ${active.selfPaced ? SELF_PACED_LOOP_LABEL : `every ${active.intervalLabel}`} — "${active.prompt}". Use /loop stop to cancel.`
				: "No active loop in this thread.",
		);
		return;
	}

	const parsed = parseLoopArguments(
		args,
		activeLoops.get(context.key)?.prompt ||
			(await readLoopDefault(context.workspaceRoot)),
	);
	if (!parsed.ok) {
		await context.reply(parsed.error);
		return;
	}

	stopLoop(context.key);
	const loop: ActiveLoop = {
		id: ++loopSequence,
		prompt: parsed.loop.prompt,
		intervalLabel: parsed.loop.intervalLabel,
		selfPaced: parsed.loop.intervalMs === null,
		inFlight: false,
	};

	if (parsed.loop.intervalMs === null) {
		activeLoops.set(context.key, loop);
		void runLoopTick(context, loop);
	} else {
		const timer = setInterval(() => void runLoopTick(context, loop), parsed.loop.intervalMs);
		timer.unref?.();
		activeLoops.set(context.key, { ...loop, timer });
	}

	await context.reply(
		`Loop started: ${loop.selfPaced ? SELF_PACED_LOOP_LABEL : `every ${loop.intervalLabel}`} — "${loop.prompt}". Use /loop stop to cancel.`,
	);
}

async function runGoal(context: ConnectorCompanionContext, args: string) {
	const parsed = parseGoalArguments(args);
	if (parsed.kind === "show") {
		const goal = context.getGoal();
		await context.reply(
			goal
				? `Active goal: ${goal}. Use /goal clear to cancel.`
				: "No active goal. Set one with /goal <condition>.",
		);
		return;
	}
	if (parsed.kind === "clear") {
		context.setGoal(null);
		await context.reply("Goal cleared.");
		return;
	}
	context.setGoal(parsed.goal);
	await context.reply(
		`Goal set: ${parsed.goal}. It is included with every prompt until cleared.`,
	);
}

/**
 * Handles the TUI-equivalent companion commands for connectors. Returns true
 * when the message was consumed.
 */
export async function maybeHandleConnectorCompanionCommand(
	context: ConnectorCompanionContext,
): Promise<boolean> {
	const [commandToken = ""] = context.text.trim().split(/\s+/);
	const normalized = commandToken.startsWith("/")
		? normalizeCommandName(commandToken.toLowerCase(), context.botUserName)
		: undefined;
	const command = normalized?.replace(/^\//, "");

	if (command === "btw") {
		const question = argumentsFor(context.text, "btw");
		if (!question) {
			await context.reply("Usage: /btw <question>");
			return true;
		}
		if (!context.isRunning()) {
			await context.reply("/btw can only be used while a task is running.");
			return true;
		}
		await context.submit(question);
		await context.reply(`Side question sent: ${question}`);
		return true;
	}

	if (command === "loop" || command === "proactive") {
		const args = argumentsFor(context.text, command);
		await runLoop(context, args);
		return true;
	}

	if (command === "goal") {
		await runGoal(context, argumentsFor(context.text, "goal"));
		return true;
	}

	if (command === "clear" || command === "new" || command === "stop") {
		stopLoop(context.key);
		if (command !== "stop") context.setGoal(null);
	}

	return false;
}

/** Clears a goal when the agent emits the achieved marker in a final reply. */
export function clearGoalIfAchieved(
	context: Pick<ConnectorCompanionContext, "getGoal" | "setGoal">,
	text: string,
): void {
	if (context.getGoal() && hasGoalAchievedMarker(text)) {
		context.setGoal(null);
	}
}
