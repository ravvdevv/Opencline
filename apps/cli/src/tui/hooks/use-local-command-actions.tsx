import { useTerminalDimensions } from "@opentui/react";
import type { ChoiceContext } from "@opentui-ui/dialog";
import { useDialog } from "@opentui-ui/dialog/react";
import { useCallback, useEffect, useRef } from "react";
import type { SlashCommandRegistry } from "../commands/slash-command-registry";
import { resolveSlashCommand } from "../commands/slash-command-registry";
import { ForkConfirmContent } from "../components/dialogs/fork-confirm";
import { HelpDialogContent } from "../components/dialogs/help-dialog";
import { withLoadingDialog } from "../components/dialogs/loading-dialog";
import { BtwInputContent } from "../components/dialogs/btw-input";
import { useSession } from "../contexts/session-context";
import type { AppView, TuiProps } from "../types";
import { hydrateSessionMessages } from "../utils/hydrate-messages";
import type { LocalSlashCommandInvocation } from "../utils/skill-command-input";
import { HistoryDialogContent } from "../views/history-view";
import { runLocalSlashCommandAction } from "./local-command-actions";
import type { OpenConfigOptions } from "./use-config-panel";
import {
	DEFAULT_LOOP_PROMPT,
	getSlashCommandArguments,
	parseLoopArguments,
	parseLoopControl,
} from "../utils/loop-command";

export function useLocalCommandActions(input: {
	slashCommandRegistry: SlashCommandRegistry;
	canForkSession: boolean;
	openAccount: () => void;
	openConfig: (options?: OpenConfigOptions) => void;
	openMcpManager: () => Promise<boolean>;
	openModelSelector: () => void;
	openSkills: (invocation?: LocalSlashCommandInvocation) => void;
	openThemePicker: () => void;
	refocusTextarea: () => void;
	setAppView: (view: AppView) => void;
	onClearConversation: () => Promise<void>;
	onResumeSession: TuiProps["onResumeSession"];
	onExportHistorySession: TuiProps["onExportHistorySession"];
	onDeleteHistorySession: TuiProps["onDeleteHistorySession"];
	onCompact: TuiProps["onCompact"];
	onFork: TuiProps["onFork"];
	onUndo: () => Promise<void>;
	onExit: TuiProps["onExit"];
	onSubmit: TuiProps["onSubmit"];
	submitText: (text: string, delivery?: "queue" | "steer") => Promise<void>;
}) {
	const dialog = useDialog();
	const session = useSession();
	const { height: termHeight } = useTerminalDimensions();
	const {
		slashCommandRegistry,
		canForkSession,
		openAccount,
		openConfig,
		openMcpManager,
		openModelSelector,
		openSkills,
		openThemePicker,
		refocusTextarea,
		setAppView,
		onClearConversation,
		onResumeSession,
		onExportHistorySession,
		onDeleteHistorySession,
		onCompact,
		onFork,
		onUndo,
		onExit,
		onSubmit,
		submitText,
	} = input;

	const openHistory = useCallback(async () => {
		const sessionId = await dialog.choice<string>({
			size: "large",
			style: { maxHeight: termHeight - 2 },
			content: (ctx: ChoiceContext<string>) => (
				<HistoryDialogContent
					{...ctx}
					onExport={onExportHistorySession}
					onDelete={onDeleteHistorySession}
				/>
			),
		});
		if (sessionId) {
			try {
				await withLoadingDialog(dialog, "Loading session...", async () => {
					const result = await onResumeSession(sessionId);
					const { messages } = result;
					const entries = hydrateSessionMessages(messages);
					if (entries.length === 0) {
						session.appendEntry({
							kind: "error",
							text: `Session ${sessionId} has no messages to resume.`,
						});
					} else {
						session.clearEntries();
						session.replaceEntries(entries);
						if (typeof result.currentContextSize === "number") {
							session.setLastTotalTokens(result.currentContextSize);
						}
						if (typeof result.totalCost === "number") {
							session.setLastTotalCost(result.totalCost);
						}
						session.setHasSubmitted(true);
						setAppView("chat");
					}
				});
			} catch (error) {
				session.appendEntry({
					kind: "error",
					text: `Failed to resume session: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}
		refocusTextarea();
	}, [
		dialog,
		onDeleteHistorySession,
		onExportHistorySession,
		onResumeSession,
		refocusTextarea,
		session,
		setAppView,
		termHeight,
	]);

	const openHelp = useCallback(async () => {
		await dialog.choice<void>({
			size: "large",
			style: { maxHeight: termHeight - 2 },
			content: (ctx: ChoiceContext<void>) => <HelpDialogContent {...ctx} />,
		});
		refocusTextarea();
	}, [dialog, refocusTextarea, termHeight]);

	const runCompact = useCallback(async () => {
		session.setIsRunning(true);
		session.appendEntry({
			kind: "compaction",
			compactionMode: "manual",
			status: "started",
		});
		try {
			const result = await onCompact();
			session.updateLastEntry((entry) =>
				entry.kind === "compaction" && entry.status === "started"
					? {
						...entry,
						status: result.compacted ? "completed" : "skipped",
						messagesBefore: result.messagesBefore,
						messagesAfter:
							result.workingContextMessagesAfter ?? result.messagesAfter,
						}
					: entry,
			);
		} catch (error) {
			const cancelled =
				error instanceof Error &&
				(error.name === "AbortError" || /abort/i.test(error.message));
			session.updateLastEntry((entry) =>
				entry.kind === "compaction" && entry.status === "started"
					? { ...entry, status: cancelled ? "cancelled" : "failed" }
					: entry,
			);
			if (!cancelled) {
				session.appendEntry({
					kind: "error",
					text: `Compaction failed: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		} finally {
			session.setIsRunning(false);
		}
	}, [onCompact, session]);

	const runFork = useCallback(async () => {
		if (!canForkSession) {
			session.appendEntry({
				kind: "status",
				text: "Fork is available after this session has messages.",
			});
			return;
		}
		const confirmed = await dialog.choice<boolean>({
			closeOnEscape: true,
			content: (ctx: ChoiceContext<boolean>) => <ForkConfirmContent {...ctx} />,
		});
		refocusTextarea();
		if (!confirmed) return;
		session.appendEntry({
			kind: "status",
			text: "Creating forked session...",
		});
		try {
			const result = await onFork();
			if (result) {
				session.updateLastEntry(() => ({
					kind: "status",
					text: `Forked into new session ${result.newSessionId}. This is now the active session. Use /history to switch sessions.`,
				}));
				if (result.carriedWorkingContext) {
					session.appendEntry({
						kind: "compaction",
						compactionMode: "inherited",
						status: "completed",
						messagesBefore: result.carriedWorkingContext.canonicalMessages,
						messagesAfter: result.carriedWorkingContext.workingContextMessages,
					});
				}
			} else {
				session.updateLastEntry(() => ({
					kind: "error",
					text: "Fork failed: could not read messages from the current session.",
				}));
			}
		} catch (error) {
			session.updateLastEntry(() => ({
				kind: "error",
				text: `Fork failed: ${error instanceof Error ? error.message : String(error)}`,
			}));
		}
	}, [canForkSession, dialog, onFork, refocusTextarea, session]);

	type ActiveLoop = {
		timer: ReturnType<typeof setInterval>;
		prompt: string;
		intervalLabel: string;
	};

	const activeLoopRef = useRef<ActiveLoop | null>(null);
	const loopTickInFlightRef = useRef(false);
	const lastPromptRef = useRef("");
	const sessionRef = useRef(session);
	sessionRef.current = session;
	const submitTextRef = useRef(submitText);
	submitTextRef.current = submitText;

	useEffect(
		() => () => {
			if (activeLoopRef.current) {
				clearInterval(activeLoopRef.current.timer);
				activeLoopRef.current = null;
			}
		},
		[],
	);

	const stopLoop = () => {
		const active = activeLoopRef.current;
		if (!active) return false;
		clearInterval(active.timer);
		activeLoopRef.current = null;
		return true;
	};

	const runBtw = useCallback(
		async (invocation?: LocalSlashCommandInvocation) => {
			if (!session.isRunning) {
				session.appendEntry({
					kind: "status",
					text: "/btw can only be used while a task is running.",
				});
				refocusTextarea();
				return true;
			}

			const inlineQuestion = getSlashCommandArguments(invocation?.text, "btw");
			if (inlineQuestion) {
				lastPromptRef.current = inlineQuestion;
				session.appendEntry({
					kind: "status",
					text: `Steering task: ${inlineQuestion}`,
				});
				try {
					await submitText(inlineQuestion, "steer");
				} catch (error) {
					session.appendEntry({
						kind: "error",
						text: `Failed to steer task: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
				refocusTextarea();
				return true;
			}

			while (sessionRef.current.isRunning) {
				const result = await dialog.choice<string | null>({
					size: "medium",
					content: (ctx: ChoiceContext<string | null>) => (
						<BtwInputContent
							{...ctx}
							placeholder="Ask a follow-up question (Escape to resume task)..."
						/>
					),
				});
				if (!result) break;

				lastPromptRef.current = result;
				session.appendEntry({
					kind: "status",
					text: `Steering task: ${result}`,
				});
				try {
					await submitText(result, "steer");
				} catch (error) {
					session.appendEntry({
						kind: "error",
						text: `Failed to steer task: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}

			refocusTextarea();
			return true;
		},
		[dialog, refocusTextarea, session, submitText],
	);

	const runLoopTick = useCallback(async (prompt: string) => {
		if (loopTickInFlightRef.current) return;
		loopTickInFlightRef.current = true;
		const currentSession = sessionRef.current;
		try {
			await submitTextRef.current(
				prompt,
				currentSession.isRunning ? "steer" : undefined,
			);
		} catch (error) {
			currentSession.appendEntry({
				kind: "error",
				text: `Loop prompt failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		} finally {
			loopTickInFlightRef.current = false;
		}
	}, []);

	const runLoop = useCallback(
		async (invocation?: LocalSlashCommandInvocation) => {
			const args = getSlashCommandArguments(invocation?.text, "loop");
			const control = parseLoopControl(args);

			if (control === "stop") {
				session.appendEntry({
					kind: "status",
					text: stopLoop()
						? "Loop stopped."
						: "No active loop in this session.",
				});
				refocusTextarea();
				return true;
			}

			if (control === "status") {
				const active = activeLoopRef.current;
				session.appendEntry({
					kind: "status",
					text: active
						? `Active loop: every ${active.intervalLabel} — "${active.prompt}". Use /loop stop to cancel.`
						: "No active loop in this session.",
				});
				refocusTextarea();
				return true;
			}

			stopLoop();
			const parsed = parseLoopArguments(
				args,
				lastPromptRef.current || DEFAULT_LOOP_PROMPT,
			);
			lastPromptRef.current = parsed.prompt;

			const timer = setInterval(() => {
				void runLoopTick(parsed.prompt);
			}, parsed.intervalMs);
			timer.unref?.();
			activeLoopRef.current = {
				timer,
				prompt: parsed.prompt,
				intervalLabel: parsed.intervalLabel,
			};

			session.appendEntry({
				kind: "status",
				text: `Loop started: every ${parsed.intervalLabel} — "${parsed.prompt}". Use /loop stop to cancel.`,
			});
			refocusTextarea();
			return true;
		},
		[refocusTextarea, runLoopTick, session],
	);

	const handleSlashCommand = useCallback(
		(command: string, invocation?: LocalSlashCommandInvocation) => {
			const resolved = resolveSlashCommand(slashCommandRegistry, command);
			if (!resolved || resolved.execution !== "local") {
				return false;
			}
			if (resolved.name === "btw") {
				return runBtw(invocation);
			}
			if (resolved.name === "loop") {
				return runLoop(invocation);
			}
			return runLocalSlashCommandAction({
				name: resolved.name,
				isRunning: session.isRunning,
				invocation,
				openAccount,
				openConfig,
				openMcpManager,
				openModelSelector,
				openSkills,
				openThemePicker,
				runCompact,
				runFork,
				runUndo: onUndo,
				clearConversation: onClearConversation,
				openHelp,
				openHistory,
				exitCline: onExit,
				onSubmit,
			});
		},
		[
			onClearConversation,
			onExit,
			onUndo,
			openAccount,
			openConfig,
			openMcpManager,
			openHelp,
			openHistory,
			openModelSelector,
			openSkills,
			openThemePicker,
			runCompact,
			runFork,
			runBtw,
			runLoop,
			session.isRunning,
			slashCommandRegistry,
			onSubmit,
		],
	);

	return { handleSlashCommand, openHistory };
}
