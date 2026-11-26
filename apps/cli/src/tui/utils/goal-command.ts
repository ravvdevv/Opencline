export const GOAL_MARKER = "<session_goal>";
export const GOAL_ACHIEVED_MARKER = "<<GOAL_ACHIEVED>>";

export function hasGoalAchievedMarker(text: string): boolean {
	return text.includes(GOAL_ACHIEVED_MARKER);
}

const GOAL_CLEAR_WORDS = new Set([
	"clear",
	"stop",
	"off",
	"reset",
	"none",
	"cancel",
]);

export type ParsedGoal =
	| { kind: "show" }
	| { kind: "clear" }
	| { kind: "set"; goal: string };

export function parseGoalArguments(args: string): ParsedGoal {
	const trimmed = args.trim();
	if (!trimmed) return { kind: "show" };
	if (GOAL_CLEAR_WORDS.has(trimmed.toLowerCase())) return { kind: "clear" };
	return { kind: "set", goal: trimmed };
}

export function formatGoalPrompt(goal: string | null, prompt: string): string {
	const trimmed = goal?.trim();
	if (!trimmed || prompt.includes(GOAL_MARKER)) return prompt;
	return [
		GOAL_MARKER,
		`Active goal: ${trimmed}`,
		"Continue working toward this goal across turns until it is met or cleared.",
		`When it is met, include ${GOAL_ACHIEVED_MARKER} in your reply so the CLI can clear it.`,
		"</session_goal>",
		"",
		prompt,
	].join("\n");
}
