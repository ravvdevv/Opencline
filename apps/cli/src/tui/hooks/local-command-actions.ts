import type { LocalSlashCommandInvocation } from "../utils/skill-command-input";
import type { OpenConfigOptions } from "./use-config-panel";
import type { AgentMode } from "@cline/core";
import type { UserInputAttachments } from "../types";

export interface LocalSlashCommandActionInput {
	name: string;
	isRunning: boolean;
	openAccount: () => void;
	openConfig: (options?: OpenConfigOptions) => void;
	openMcpManager: () => Promise<boolean>;
	openModelSelector: () => void;
	openSkills: (invocation?: LocalSlashCommandInvocation) => void;
	openThemePicker: () => void;
	invocation?: LocalSlashCommandInvocation;
	runCompact: () => void;
	runFork: () => void;
	runUndo: () => Promise<void>;
	clearConversation: () => Promise<void>;
	openHelp: () => void;
	openHistory: () => void;
	exitCline: () => void;
	onSubmit: (
		input: string,
		mode: AgentMode,
		delivery?: "queue" | "steer",
		attachments?: UserInputAttachments,
		onCommandOutput?: (text: string) => void,
	) => Promise<{ currentContextSize?: number }>;
	currentMode: AgentMode;
}

export async function runLocalSlashCommandAction(
	input: LocalSlashCommandActionInput,
): Promise<boolean> {
	const normalized = input.name;
	if (normalized === "config" || normalized === "settings") {
		input.openConfig();
		return true;
	}
	if (normalized === "plugins") {
		input.openConfig({ initialTab: "plugins" });
		return true;
	}
	if (normalized === "skills") {
		input.openSkills(input.invocation);
		return true;
	}
	if (normalized === "mcp") {
		return input.openMcpManager().then(() => true);
	}
	if (normalized === "account") {
		input.openAccount();
		return true;
	}
	if (normalized === "model") {
		input.openModelSelector();
		return true;
	}
	if (normalized === "theme") {
		input.openThemePicker();
		return true;
	}
	if (normalized === "compact") {
		// Autocomplete can invoke local commands while a turn is running. Keep
		// /compact handled, but do not let it take ownership of the active turn's
		// shared running state.
		if (!input.isRunning) {
			input.runCompact();
		}
		return true;
	}
	if (normalized === "fork") {
		input.runFork();
		return true;
	}
	if (normalized === "undo") {
		return input.runUndo().then(() => true);
	}
	if (normalized === "clear") {
		return input.clearConversation().then(() => true);
	}
	if (normalized === "help") {
		input.openHelp();
		return true;
	}
	if (normalized === "history") {
		input.openHistory();
		return true;
	}
	if (normalized === "quit") {
		setTimeout(input.exitCline, 0);
		return true;
	}
	if (normalized === "btw") {
		const invocation = input.invocation;
		if (!invocation) return true;

		// Extract query from "/btw <query>" or just "/btw" (will be empty)
		const fullText = invocation.text.trim();
		const match = fullText.match(/^\/btw\s+(.*)$/i);
		const query = match ? match[1].trim() : "";

		if (!query) {
			// No query provided - could show a prompt or just do nothing
			return true;
		}

		// Submit a prompt asking the agent to search the web
		const prompt = `Search the web for: ${query}`;
		await input.onSubmit(prompt, input.currentMode, "queue");
		return true;
	}
	return false;
}
