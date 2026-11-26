export const DEFAULT_LOOP_PROMPT =
	"Check the current task status and briefly report anything that needs attention.";
export const SELF_PACED_LOOP_LABEL = "self-paced";
/** Small gap between self-paced iterations so a queued steer cannot spin. */
export const SELF_PACED_MIN_DELAY_MS = 1_000;

export interface ParsedInterval {
	intervalMs: number;
	intervalLabel: string;
	prompt: string;
}

export interface ParsedLoop {
	intervalMs: number | null;
	intervalLabel: string;
	prompt: string;
}

export type ParseLoopResult =
	| { ok: true; loop: ParsedLoop }
	| { ok: false; error: string };

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

export function parseLoopInterval(text: string): ParsedInterval | undefined {
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
	const intervalLabel = `${match[1]} ${unitName}${value === 1 ? "" : "s"}`;
	return { intervalMs, intervalLabel, prompt: match[3].trim() };
}

export function parseLoopArguments(
	args: string,
	fallbackPrompt: string,
): ParseLoopResult {
	const trimmed = args.trim();
	const fallback = fallbackPrompt.trim() || DEFAULT_LOOP_PROMPT;

	if (!trimmed) {
		return {
			ok: true,
			loop: {
				intervalMs: null,
				intervalLabel: SELF_PACED_LOOP_LABEL,
				prompt: fallback,
			},
		};
	}

	const parsed = parseLoopInterval(trimmed);
	if (parsed) {
		return {
			ok: true,
			loop: {
				intervalMs: parsed.intervalMs,
				intervalLabel: parsed.intervalLabel,
				prompt: parsed.prompt || fallback,
			},
		};
	}

	// A leading number means the user intended an interval. Reject malformed
	// durations instead of silently treating them as prompt text.
	if (/^\d/.test(trimmed)) {
		return {
			ok: false,
			error:
				"Invalid loop interval. Use /loop [interval] [prompt], e.g. /loop 5m check deploy.",
		};
	}

	return {
		ok: true,
		loop: {
			intervalMs: null,
			intervalLabel: SELF_PACED_LOOP_LABEL,
			prompt: trimmed,
		},
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
