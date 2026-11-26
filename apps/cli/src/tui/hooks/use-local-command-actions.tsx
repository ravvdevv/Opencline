import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { useTerminalDimensions } from "@opentui/react";
import type { ChoiceContext } from "@opentui-ui/dialog";
import { useDialog } from "@opentui-ui/dialog/react";
import { useCallback, useEffect, useRef } from "react";
import type { SlashCommandRegistry } from "../commands/slash-command-registry";
import { resolveSlashCommand } from "../commands/slash-command-registry";
import { ForkConfirmContent } from "../components/dialogs/fork-confirm";
import { HelpDialogContent } from "../components/dialogs/help-dialog";
import { withLoadingDialog } from "../components/dialogs/loading-dialog";
import { useSession } from "../contexts/session-context";
import type { AppView, TuiProps } from "../types";
import { hydrateSessionMessages } from "../utils/hydrate-messages";
import type { LocalSlashCommandInvocation } from "../utils/skill-command-input";
import { HistoryDialogContent } from "../views/history-view";
import { runLocalSlashCommandAction } from "./local-command-actions";
import type { OpenConfigOptions } from "./use-config-panel";
import {
	readSessionGoal,
	writeSessionGoal,
} from "../../utils/session-goal-store";
import { parseGoalArguments } from "../utils/goal-command";
import {
	DEFAULT_LOOP_PROMPT,
	getSlashCommandArguments,
	parseLoopArguments,
	parseLoopControl,
	SELF_PACED_LOOP_LABEL,
	SELF_PACED_MIN_DELAY_MS,
} from "../utils/loop-command";

export function useLocalCommandActions(input: {
	slashCommandRegistry: SlashCommandRegistry;
	workspaceRoot: string;
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
		workspaceRoot,
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

	const activeGoalRef = useRef<string | null>(null);
	const lastGoalRef = useRef<string | null>(null);

	useEffect(() => {
		activeGoalRef.current = readSessionGoal(workspaceRoot);
	}, [workspaceRoot]);

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
						activeGoalRef.current = null;
						writeSessionGoal(workspaceRoot, null);
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
		workspaceRoot,
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
		id: number;
		timer?: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>;
		prompt: string;
		intervalLabel: string;
		selfPaced: boolean;
	};

	const activeLoopRef = useRef<ActiveLoop | null>(null);
	const loopTickInFlightRef = useRef(false);
	const loopSequenceRef = useRef(0);
	const scheduleSelfPacedRef = useRef<(loop: ActiveLoop, delay: number) => void>(
		() => {},
	);
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

			const question = getSlashCommandArguments(invocation?.text, "btw");
			if (!question) {
				session.appendEntry({
					kind: "status",
					text: lastPromptRef.current
						? `Last side question: ${lastPromptRef.current}. Use /btw <question> to ask another.`
						: "Usage: /btw <question>",
				});
				refocusTextarea();
				return true;
			}

			lastPromptRef.current = question;
			session.appendEntry({
				kind: "status",
				text: `Side question: ${question}`,
			});
			try {
				await submitText(question, "steer");
			} catch (error) {
				session.appendEntry({
					kind: "error",
					text: `Failed to steer task: ${error instanceof Error ? error.message : String(error)}`,
				});
			}

			refocusTextarea();
			return true;
		},
		[refocusTextarea, session, submitText],
	);

	const runLoopTick = useCallback(async (loop: ActiveLoop) => {
		if (loopTickInFlightRef.current) return;
		if (activeLoopRef.current?.id !== loop.id) return;
		loopTickInFlightRef.current = true;
		const currentSession = sessionRef.current;
		try {
			await submitTextRef.current(
				loop.prompt,
				currentSession.isRunning ? "steer" : undefined,
			);
		} catch (error) {
			currentSession.appendEntry({
				kind: "error",
				text: `Loop prompt failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		} finally {
			loopTickInFlightRef.current = false;
			if (loop.selfPaced && activeLoopRef.current?.id === loop.id) {
				// A steered tick resolves as soon as it is queued. Wait for the
				// turn to finish before scheduling the next self-paced tick so
				// the loop follows the agent's pace instead of spinning.
				const waitForIdle = () => {
					if (activeLoopRef.current?.id !== loop.id) return;
					if (sessionRef.current.isRunning) {
						const retry = setTimeout(
							waitForIdle,
							SELF_PACED_MIN_DELAY_MS,
						);
						retry.unref?.();
						activeLoopRef.current = { ...loop, timer: retry };
						return;
					}
					scheduleSelfPacedRef.current(loop, SELF_PACED_MIN_DELAY_MS);
				};
				waitForIdle();
			}
		}
	}, []);

	const scheduleSelfPaced = useCallback(
		(loop: ActiveLoop, delay: number) => {
			if (activeLoopRef.current?.id !== loop.id) return;
			const timer = setTimeout(() => {
				void runLoopTick(loop);
			}, delay);
			timer.unref?.();
			activeLoopRef.current = { ...loop, timer };
		},
		[runLoopTick],
	);
	scheduleSelfPacedRef.current = scheduleSelfPaced;

	const runLoop = useCallback(
		async (invocation?: LocalSlashCommandInvocation, commandName = "loop") => {
			const args = getSlashCommandArguments(invocation?.text, commandName);
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
						? `Active loop: ${active.selfPaced ? "self-paced" : `every ${active.intervalLabel}`} — "${active.prompt}". Use /loop stop to cancel.`
						: "No active loop in this session.",
				});
				refocusTextarea();
				return true;
			}

			let fallbackPrompt = lastPromptRef.current || DEFAULT_LOOP_PROMPT;
			try {
				const custom = (
					await readFile(join(workspaceRoot, "loop.md"), "utf8")
				).trim();
				if (custom) fallbackPrompt = custom;
			} catch {
				// loop.md is optional.
			}

			const parsed = parseLoopArguments(args, fallbackPrompt);
			if (!parsed.ok) {
				session.appendEntry({ kind: "status", text: parsed.error });
				refocusTextarea();
				return true;
			}

			stopLoop();
			lastPromptRef.current = parsed.loop.prompt;
			const loop: ActiveLoop = {
				id: ++loopSequenceRef.current,
				prompt: parsed.loop.prompt,
				intervalLabel: parsed.loop.intervalLabel,
				selfPaced: parsed.loop.intervalMs === null,
			};

			if (parsed.loop.intervalMs === null) {
				activeLoopRef.current = loop;
				void runLoopTick(loop);
			} else {
				const timer = setInterval(() => {
					void runLoopTick(loop);
				}, parsed.loop.intervalMs);
				timer.unref?.();
				activeLoopRef.current = { ...loop, timer };
			}

			session.appendEntry({
				kind: "status",
				text: `Loop started: ${loop.selfPaced ? SELF_PACED_LOOP_LABEL : `every ${loop.intervalLabel}`} — "${loop.prompt}". Use /loop stop to cancel.`,
			});
			refocusTextarea();
			return true;
		},
		[refocusTextarea, runLoopTick, session, workspaceRoot],
	);

	const getActiveGoal = useCallback(() => activeGoalRef.current, []);

	const clearActiveGoal = useCallback(
		(reason?: "achieved") => {
			const goal = activeGoalRef.current;
			if (goal) lastGoalRef.current = goal;
			activeGoalRef.current = null;
			writeSessionGoal(workspaceRoot, null);
			session.appendEntry({
				kind: "status",
				text:
					reason === "achieved" && goal
						? `Goal achieved: ${goal}. Goal cleared.`
						: "Goal cleared.",
			});
		},
		[session, workspaceRoot],
	);

	const runGoal = useCallback(
		(invocation?: LocalSlashCommandInvocation) => {
			const parsed = parseGoalArguments(
				getSlashCommandArguments(invocation?.text, "goal"),
			);

			if (parsed.kind === "show") {
				session.appendEntry({
					kind: "status",
					text: activeGoalRef.current
						? `Active goal: ${activeGoalRef.current}. Use /goal clear to cancel.`
						: lastGoalRef.current
							? `Last goal: ${lastGoalRef.current}. Set a new one with /goal <condition>.`
							: "No active goal. Set one with /goal <condition>.",
				});
			} else if (parsed.kind === "clear") {
				clearActiveGoal();
			} else {
				activeGoalRef.current = parsed.goal;
				lastGoalRef.current = parsed.goal;
				writeSessionGoal(workspaceRoot, parsed.goal);
				session.appendEntry({
					kind: "status",
					text: `Goal set: ${parsed.goal}. It is included with every prompt until cleared; treat it as achieved when the condition is met.`,
				});
			}

			refocusTextarea();
			return true;
		},
		[clearActiveGoal, refocusTextarea, session, workspaceRoot],
	);

	const clearConversationWithGoal = useCallback(async () => {
		activeGoalRef.current = null;
		writeSessionGoal(workspaceRoot, null);
		await onClearConversation();
	}, [onClearConversation, workspaceRoot]);

	const handleSlashCommand = useCallback(
		(command: string, invocation?: LocalSlashCommandInvocation) => {
			const resolved = resolveSlashCommand(slashCommandRegistry, command);
			if (!resolved || resolved.execution !== "local") {
				return false;
			}
			if (resolved.name === "btw") {
				return runBtw(invocation);
			}
			if (resolved.name === "loop" || resolved.name === "proactive") {
				return runLoop(invocation, resolved.name);
			}
			if (resolved.name === "goal") {
				return runGoal(invocation);
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
				clearConversation: clearConversationWithGoal,
				openHelp,
				openHistory,
				exitCline: onExit,
				onSubmit,
			});
		},
		[
			clearConversationWithGoal,
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
			runGoal,
			session.isRunning,
			slashCommandRegistry,
			onSubmit,
		],
	);

	return { handleSlashCommand, openHistory, getActiveGoal, clearActiveGoal };
}
