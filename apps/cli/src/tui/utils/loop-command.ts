export const DEFAULT_LOOP_INTERVAL_MS = 5 * 60_000;
export const DEFAULT_LOOP_PROMPT =
	"Check the current task status and briefly report anything that needs attention.";

export interface ParsedLoop {
	intervalMs: number;
	intervalLabel: string;
	prompt: string;
}

const INTERVAL_PATTERN =
	/^(\d+(?:\.\d+)?)\s*(ms|millisecond|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b\s*([\s\S]*)$/i;

const UNIT_TO_MS: Record<string, number> = {
	ms: 1,
	millisecond: 1,
	milliseconds: 1,
	s: 1_000,
	sec: 1_000,
	secs: 1_000,
	second: 1_000,
	seconds: 1_000,
	m: 60_000,
	min: 60_000,
	mins: 60_000,
	minute: 60_000,
	minutes: 60_000,
	h: 3_600_000,
	hr: 3_600_000,
	hrs: 3_600_000,
	hour: 3_600_000,
	hours: 3_600_000,
};

function singularUnit(unit: string): string {
	const normalized = unit.toLowerCase();
	if (normalized === "ms" || normalized.startsWith("millisecond")) {
		return "millisecond";
	}
	if (normalized.startsWith("s")) return "second";
	if (normalized.startsWith("m")) return "minute";
	return "hour";
}

export function getSlashCommandArguments(
	text: string | undefined,
	commandName: string,
): string {
	if (!text) return "";
	const escaped = commandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(
		`^\\s*/${escaped}\\b[ \\t]*([\\s\\S]*)$`,
		"i",
	).exec(text);
	return (match?.[1] ?? "").trim();
}

export function parseLoopInterval(text: string): ParsedLoop | undefined {
	const match = INTERVAL_PATTERN.exec(text.trim());
	if (!match) return undefined;

	const value = Number(match[1]);
	const unit = match[2];
	const multiplier = UNIT_TO_MS[unit.toLowerCase()];
	if (!Number.isFinite(value) || value <= 0 || multiplier === undefined) {
		return undefined;
	}

	const intervalMs = value * multiplier;
	if (!Number.isFinite(intervalMs) || intervalMs < 1) return undefined;

	const unitName = singularUnit(unit);
	const label = `${match[1]} ${unitName}${value === 1 ? "" : "s"}`;
	return { intervalMs, intervalLabel: label, prompt: match[3].trim() };
}

export function parseLoopArguments(
	args: string,
	fallbackPrompt: string,
): ParsedLoop {
	const fallback = fallbackPrompt.trim() || DEFAULT_LOOP_PROMPT;
	const parsed = parseLoopInterval(args);
	if (!parsed) {
		return {
			intervalMs: DEFAULT_LOOP_INTERVAL_MS,
			intervalLabel: "5 minutes",
			prompt: args.trim() || fallback,
		};
	}
	return {
		...parsed,
		prompt: parsed.prompt || fallback,
	};
}

export function parseLoopControl(
	args: string,
): "stop" | "status" | undefined {
	const normalized = args.trim().toLowerCase();
	if (normalized === "stop") return "stop";
	if (normalized === "status") return "status";
	return undefined;
}
