import { normalize } from "node:path";
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

const LOW_RISK_TASK_PATTERN =
	/\b(typo|spelling|punctuation|formatting|format only|documentation only|docs only|comment only|fix a typo|correct a typo)\b/i;
const SUBSTANTIAL_TASK_PATTERN =
	/\b(implement|build|create|add|introduce|refactor|redesign|migrate|upgrade|replace|remove|delete|authentication|authorization|security|database|schema|api|architecture|feature|workflow|integration|performance|concurrency|data integrity|bug|regression|vulnerability|race condition|data loss)\b/i;
const MUTATING_TOOL_PATTERN =
	/(write|edit|patch|insert|replace|delete|remove|move|rename|create_file|run_commands|execute_command|shell|terminal|apply_diff|apply_patch)/i;
const TEST_PATH_PATTERN =
	/(^|[/\\])(__tests__|tests?)([/\\]|$)|\.(test|spec)\.[^/\\]+$/i;
const APPROVAL_PATTERN =
	/^(?:(?:okay|ok|yes)[,!\s]+(?:then\s+|and\s+)?)*(?:i\s+)?(?:approve(?:d)?(?:\s+(?:this|the|that)\s+(?:spec|specification|plan))?|confirm(?:ed)?(?:\s+(?:this|the|that)\s+(?:spec|specification|plan))?|proceed|go ahead|implement it|implement what you (?:recommend|recommended)|implement the (?:approved )?(?:spec|specification|plan)|looks good|lgtm)(?:[.!]\s*(?:proceed|go ahead|implement it)?[.!]?)?$/i;

function messageText(message: WorkflowMessage): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.map((part) => {
			if (typeof part === "string") return part;
			if (!part || typeof part !== "object") return "";
			const value = part as Record<string, unknown>;
			if (typeof value.text === "string") return value.text;
			if (typeof value.output === "string") return value.output;
			if (value.type === "tool-result") {
				try {
					return typeof value.output === "string"
						? value.output
						: JSON.stringify(value.output ?? "");
				} catch {
					return "";
				}
			}
			return "";
		})
		.join("\n");
}

function isSubstantialTask(prompt: string): boolean {
	const trimmed = prompt.trim();
	if (!trimmed) return false;
	if (
		LOW_RISK_TASK_PATTERN.test(trimmed) &&
		!SUBSTANTIAL_TASK_PATTERN.test(trimmed)
	) {
		return false;
	}
	return SUBSTANTIAL_TASK_PATTERN.test(trimmed) || trimmed.length >= 240;
}

function isTestPath(value: string): boolean {
	const normalized = normalize(value).replace(/\\/g, "/");
	return TEST_PATH_PATTERN.test(normalized);
}

function findPathValues(value: unknown, depth = 0): string[] {
	if (depth > 4 || value === null || value === undefined) return [];
	if (typeof value === "string") return [];
	if (Array.isArray(value)) {
		return value.flatMap((item) => findPathValues(item, depth + 1));
	}
	if (typeof value !== "object") return [];
	const record = value as Record<string, unknown>;
	const found: string[] = [];
	for (const [key, child] of Object.entries(record)) {
		if (
			["path", "filepath", "file_path", "target", "filename", "file"].includes(
				key.toLowerCase(),
			) &&
			typeof child === "string"
		) {
			found.push(child);
		} else if (child && typeof child === "object") {
			found.push(...findPathValues(child, depth + 1));
		}
	}
	return found;
}

function collectCommands(value: unknown, depth = 0): string[] {
	if (depth > 4 || value === null || value === undefined) return [];
	if (Array.isArray(value)) {
		return value.flatMap((item) => collectCommands(item, depth + 1));
	}
	if (typeof value !== "object") return [];
	const commands: string[] = [];
	for (const [key, child] of Object.entries(value)) {
		if (["command", "commands", "cmd", "script"].includes(key.toLowerCase())) {
			if (typeof child === "string") {
				commands.push(child);
			} else if (Array.isArray(child)) {
				commands.push(
					...child.filter((item): item is string => typeof item === "string"),
				);
			}
		} else if (child && typeof child === "object") {
			commands.push(...collectCommands(child, depth + 1));
		}
	}
	return commands;
}

function containsOnlyTestCommands(value: unknown): boolean {
	const commands = collectCommands(value);
	if (commands.length === 0) return false;
	return commands.every((command) => {
		if (/[;&|<>]/.test(command) || command.includes("$(")) return false;
		return /\b(vitest|jest|pytest)\b|\bbun\s+(?:run\s+)?[^\n]*\btest\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|\bcargo\s+test\b|\bgo\s+test\b|\bdotnet\s+test\b/i.test(command);
	});
}

function containsSpecificationSections(text: string): boolean {
	return (
		/\bobjective\b/i.test(text) &&
		/\b(architecture|design|interfaces)\b/i.test(text) &&
		/\bacceptance criteria\b/i.test(text) &&
		/\b(security boundaries|trust boundaries|security)\b/i.test(text)
	);
}

function hasApprovedCurrentSpec(messages: readonly WorkflowMessage[]): {
	approved: boolean;
	approvalIndex: number;
	specIndex: number;
} {
	let specIndex = -1;
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		if (containsSpecificationSections(messageText(message))) specIndex = index;
	}

	if (specIndex < 0) {
		return { approved: false, approvalIndex: -1, specIndex };
	}

	let approvalIndex = -1;
	let latestUserIndex = -1;
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (message?.role !== "user") continue;
		latestUserIndex = index;
		if (index <= specIndex) continue;
		const text = messageText(message).trim();
		if (APPROVAL_PATTERN.test(text)) approvalIndex = index;
	}

	// Any later user message means the approved scope may have changed.
	if (latestUserIndex > approvalIndex) {
		return { approved: false, approvalIndex, specIndex };
	}

	// A later spec revision invalidates earlier approval.
	const latestAssistantIndex = messages.reduce(
		(latest, message, index) =>
			message.role === "assistant" ? index : latest,
		-1,
	);
	if (latestAssistantIndex > approvalIndex) {
		const latestAssistantText = messageText(messages[latestAssistantIndex] ?? {});
		if (
			containsSpecificationSections(latestAssistantText) ||
			/(revised|updated) specification/i.test(latestAssistantText)
		) {
			return { approved: false, approvalIndex, specIndex };
		}
	}

	return {
		approved: approvalIndex > specIndex,
		approvalIndex,
		specIndex,
	};
}

function hasRedEvidence(
	messages: readonly WorkflowMessage[],
	afterIndex: number,
): boolean {
	return messages.slice(afterIndex + 1).some((message) => {
		const text = messageText(message);
		const failureText =
			/\b(fail(?:ed|ure)?|assertionerror|expected .{1,100} (?:received|got)|tests?\s+failed)\b/i.test(
				text,
			);
		return message.role === "tool" && (message.isError === true || failureText);
	});
}

/**
 * Runtime guard for implementation tools. It is intentionally conservative:
 * read-only investigation remains available, while implementation requires a
 * current approved spec and production edits require recorded RED evidence.
 */
export function evaluateEngineeringWorkflowGate(
	input: GateInput,
): EngineeringWorkflowGateResult {
	if (!MUTATING_TOOL_PATTERN.test(input.toolName)) {
		return { blocked: false };
	}
	if (!isSubstantialTask(input.taskPrompt)) {
		return { blocked: false };
	}

	const approval = hasApprovedCurrentSpec(input.messages);
	if (!approval.approved) {
		return {
			blocked: true,
			reason:
				"Engineering workflow gate: implementation is blocked until explicit user approval of a concise specification with objective, architecture/design, security boundaries, and acceptance criteria.",
		};
	}

	const paths = findPathValues(input.input);
	const isTestChange =
		paths.length > 0 && paths.every((path) => isTestPath(path));
	if (isTestChange) return { blocked: false };

	// Shell/command tools can modify arbitrary files. After spec approval they
	// are allowed to run the RED test, but cannot be used to implement production
	// changes until a failing test result is present in tool history.
	if (containsOnlyTestCommands(input.input)) return { blocked: false };

	if (!hasRedEvidence(input.messages, approval.approvalIndex)) {
		return {
			blocked: true,
			reason:
				"Engineering workflow gate: production edits are blocked until a focused RED test has run and its failing result is present in the tool history.",
		};
	}

	return { blocked: false };
}

export function createEngineeringWorkflowGuard(): NonNullable<
	AgentHooks["beforeTool"]
> {
	return (ctx) => {
		const userPrompts = ctx.snapshot.messages
			.filter((message) => message.role === "user")
			.map((message) =>
				message.content
					.filter((part) => part.type === "text")
					.map((part) => (part.type === "text" ? part.text : ""))
					.join("\\n"),
			);
		const taskPrompt =
			[...userPrompts].reverse().find(
				(prompt) =>
					!APPROVAL_PATTERN.test(prompt.trim()) && isSubstantialTask(prompt),
			) ??
			userPrompts.find((prompt) => !APPROVAL_PATTERN.test(prompt.trim())) ??
			"";
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
