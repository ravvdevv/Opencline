import type { AgentHooks } from "@cline/core";

type WorkflowMessage = {
	role?: string;
	content?: unknown;
	isError?: boolean;
};

type GateInput = {
	taskPrompt: string;
	messages: readonly WorkflowMessage[];
	toolName: string;
	input: unknown;
};

export type EngineeringWorkflowGateResult = {
	blocked: boolean;
	reason?: string;
};

const COMMAND_TOOL_PATTERN = /(run_commands|execute_command|shell|terminal|command)/i;
const MUTATING_TOOL_PATTERN =
	/(write|edit|patch|insert|replace|delete|remove|move|rename|create_file|run_commands|execute_command|shell|terminal|apply_diff|apply_patch)/i;

const CATASTROPHIC_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{
		pattern: /\bformat\s+[a-z]:|\bdiskpart\b[\s\S]*\bclean\b/i,
		reason: "Disk formatting or partition cleaning can destroy data.",
	},
	{
		pattern: /\b(?:rm|rmdir)\s+(?:-[a-z]*\s*)*(?:\/\s*$|\/\*|\/\s+|~\/?\s*$|\$HOME\/?\s*$)/i,
		reason: "The command targets a filesystem root or home directory.",
	},
	{
		pattern: /\bRemove-Item\b(?=[^\n]*(?:-Recurse|-Force))(?=[^\n]*(?:[A-Z]:\\(?:\s|$)|\$env:USERPROFILE|\$HOME|~(?:\s|$)))[^\n]*/i,
		reason: "Recursive deletion targets a drive root or home directory.",
	},
	{
		pattern: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f[a-z]*|push\s+[^\n]*--force(?:-with-lease)?)/i,
		reason: "This Git operation can discard local work or rewrite remote history.",
	},
	{
		pattern: /\bDROP\s+(?:DATABASE|SCHEMA)\b|\bTRUNCATE\s+TABLE\b/i,
		reason: "This database command can irreversibly remove large amounts of data.",
	},
];

const SECRET_EXFILTRATION_PATTERN =
	/\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|fetch|nc|ncat|scp|ftp)\b[\s\S]{0,500}(?:\.env(?:\.[\w.-]+)?|\.ssh[\\/]|id_rsa|credentials?\.json|secrets?\.(?:json|ya?ml)|(?:api[_-]?key|access[_-]?token|refresh[_-]?token))|(?:\.env(?:\.[\w.-]+)?|\.ssh[\\/]|id_rsa|credentials?\.json|secrets?\.(?:json|ya?ml))[\s\S]{0,500}\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|nc|ncat|scp|ftp)\b/i;

function collectCommands(value: unknown, depth = 0): string[] {
	if (depth > 5 || value === null || value === undefined || typeof value !== "object") return [];
	if (Array.isArray(value)) return value.flatMap((item) => collectCommands(item, depth + 1));

	const commands: string[] = [];
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (["command", "commands", "cmd", "script"].includes(key.toLowerCase())) {
			if (typeof child === "string") commands.push(child);
			else if (Array.isArray(child)) {
				commands.push(...child.filter((item): item is string => typeof item === "string"));
			}
		} else if (child && typeof child === "object") {
			commands.push(...collectCommands(child, depth + 1));
		}
	}
	return commands;
}

/**
 * Safety guard for tool execution. Normal implementation is autonomous; only
 * commands with clear destructive or secret-exfiltration signatures are blocked.
 * It does not require a spec or a synthetic failing-test cycle before editing.
 */
export function evaluateEngineeringWorkflowGate(
	input: GateInput,
): EngineeringWorkflowGateResult {
	if (!MUTATING_TOOL_PATTERN.test(input.toolName)) return { blocked: false };

	if (COMMAND_TOOL_PATTERN.test(input.toolName)) {
		const commands = collectCommands(input.input);
		for (const command of commands) {
			if (SECRET_EXFILTRATION_PATTERN.test(command)) {
				return {
					blocked: true,
					reason:
						"Safety guard: this command appears to send secrets or credential files to an external destination. Remove the secret-bearing input and retry.",
				};
			}
			for (const dangerous of CATASTROPHIC_COMMAND_PATTERNS) {
				if (dangerous.pattern.test(command)) {
					return {
						blocked: true,
						reason: `Safety guard: blocked a high-risk command. ${dangerous.reason} If this is genuinely intended, run the operation manually after checking the target and backups.`,
					};
				}
			}
		}
	}

	return { blocked: false };
}

export function createEngineeringWorkflowGuard(): NonNullable<AgentHooks["beforeTool"]> {
	return (ctx) => {
		const taskPrompt =
			[...ctx.snapshot.messages]
				.reverse()
				.filter((message) => message.role === "user")
				.map((message) =>
					message.content
						.filter((part) => part.type === "text")
						.map((part) => (part.type === "text" ? part.text : ""))
						.join("\n"),
				)[0] ?? "";

		const gate = evaluateEngineeringWorkflowGate({
			taskPrompt,
			messages: ctx.snapshot.messages,
			toolName: ctx.toolCall.toolName,
			input: ctx.input,
		});
		return gate.blocked
			? { skip: true, reason: gate.reason, appendContext: gate.reason }
			: undefined;
	};
}
