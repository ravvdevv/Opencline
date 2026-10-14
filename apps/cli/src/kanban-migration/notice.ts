import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveClineDataDir } from "@cline/shared/storage";
import { getCliSubscriptionUrl } from "../utils/cline-pass-errors";

export const CLINE_PASS_NOTICE_ID = "cline-cli-cline-pass-intro";
const FORCE_NOTICE_ENV = "CLINE_FORCE_CLINE_PASS_NOTICE";
// Historically named for the ClinePass promo; disables every startup notice.
const DISABLE_NOTICE_ENV = "CLINE_DISABLE_CLINE_PASS_NOTICE";

export interface CliMigrationNotice {
	id: string;
	title: string;
	body: string;
	url: string;
	openLabel: string;
}

export interface CliMigrationNoticeOptions {
	activeProviderId?: string;
}

function getClinePassNotice(): CliMigrationNotice {
	return {
		id: CLINE_PASS_NOTICE_ID,
		title: "Try ClinePass",
		body: "ClinePass is a $9.99/month subscription plan to get access to the latest open-weight coding models with enough quota for day-to-day work, at a much lower cost than paying API costs directly.",
		url: getCliSubscriptionUrl(),
		openLabel: "Open ClinePass",
	};
}

interface CliNoticeState {
	shown: Record<string, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonRecord(filePath: string): Record<string, unknown> | undefined {
	if (!existsSync(filePath)) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function readNoticeState(filePath: string): CliNoticeState {
	const parsed = readJsonRecord(filePath);
	const shown: Record<string, boolean> = {};
	if (!parsed) {
		return { shown };
	}
	const rawShown = parsed.shown;
	if (!isRecord(rawShown)) {
		return { shown };
	}
	for (const [key, value] of Object.entries(rawShown)) {
		if (typeof value === "boolean") {
			shown[key] = value;
		}
	}
	return { shown };
}

function isForceNoticeEnabled(env: NodeJS.ProcessEnv): boolean {
	return env[FORCE_NOTICE_ENV]?.trim() === "1";
}

export function shouldSuppressClineCliMigrationNoticeForActiveProvider(
	activeProviderId: string | undefined,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return (
		activeProviderId?.trim() === "cline-pass" && !isForceNoticeEnabled(env)
	);
}

export function resolveCliNoticeStatePath(
	dataDir = resolveClineDataDir(),
): string {
	return join(dataDir, "settings", "cli-notices.json");
}

export function getClineCliMigrationNotice(
	dataDir = resolveClineDataDir(),
	env: NodeJS.ProcessEnv = process.env,
	options: CliMigrationNoticeOptions = {},
): CliMigrationNotice | undefined {
	const noticePath = resolveCliNoticeStatePath(dataDir);
	const noticeState = readNoticeState(noticePath);
	const forceNotice = isForceNoticeEnabled(env);
	const disableNotice = env[DISABLE_NOTICE_ENV]?.trim() === "1";
	if (disableNotice && !forceNotice) {
		return undefined;
	}
	// OpenCline does not promote the upstream desktop app.
	if (
		!shouldSuppressClineCliMigrationNoticeForActiveProvider(
			options.activeProviderId,
			env,
		) &&
		(forceNotice || !noticeState.shown[CLINE_PASS_NOTICE_ID])
	) {
		return getClinePassNotice();
	}
	return undefined;
}

export function markClineCliMigrationNoticeShown(
	dataDir = resolveClineDataDir(),
	noticeId = CLINE_PASS_NOTICE_ID,
): void {
	const noticePath = resolveCliNoticeStatePath(dataDir);
	const noticeState = readNoticeState(noticePath);
	const nextState: CliNoticeState = {
		shown: {
			...noticeState.shown,
			[noticeId]: true,
		},
	};
	mkdirSync(dirname(noticePath), { recursive: true, mode: 0o700 });
	writeFileSync(noticePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
}
