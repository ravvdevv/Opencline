import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

type PackageInfo = {
	root: string;
	name: string;
	scripts: Record<string, string>;
};

const repoRoot = path.resolve(import.meta.dir, "../..");
const sourceExtensions = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mts",
	".cts",
	".mjs",
	".cjs",
]);
const checkExtensions = new Set([...sourceExtensions, ".json"]);

function run(command: string[], cwd = repoRoot): boolean {
	console.log(`\n$ ${command.join(" ")}`);
	const result = spawnSync(command[0], command.slice(1), {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.error) {
		console.error(result.error.message);
		return false;
	}
	return result.status === 0;
}

function gitLines(args: string[]): string[] {
	const result = spawnSync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed: ${result.stderr || result.error?.message || "unknown error"}`,
		);
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function getChangedFiles(): string[] {
	const tracked = gitLines([
		"diff",
		"--name-only",
		"--diff-filter=ACMRD",
		"HEAD",
		"--",
	]);
	const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
	return [
		...new Set(
			[...tracked, ...untracked].map((file) => file.replaceAll("\\", "/")),
		),
	]
		.filter((file) => !file.startsWith("../") && !path.isAbsolute(file))
		.sort();
}

function packageForFile(file: string): PackageInfo | undefined {
	let directory = path.resolve(repoRoot, path.dirname(file));
	while (directory.startsWith(repoRoot)) {
		if (existsSync(path.join(directory, "package.json"))) {
			return {
				root: directory,
				name: path.relative(repoRoot, directory) || "root",
				scripts: {},
			};
		}
		if (directory === repoRoot) break;
		directory = path.dirname(directory);
	}
	return undefined;
}

async function loadPackage(root: string): Promise<PackageInfo> {
	const pkg = (await Bun.file(path.join(root, "package.json")).json()) as {
		name?: string;
		scripts?: Record<string, string>;
	};
	return {
		root,
		name: pkg.name ?? (path.relative(repoRoot, root) || "root"),
		scripts: pkg.scripts ?? {},
	};
}

function siblingTests(file: string): string[] {
	if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) {
		return [file];
	}
	const extension = path.posix.extname(file);
	if (!sourceExtensions.has(extension)) return [];
	const stem = file.slice(0, -extension.length);
	return [".test", ".spec"]
		.map((suffix) => `${stem}${suffix}${extension}`)
		.filter((candidate) => existsSync(path.join(repoRoot, candidate)));
}

async function main(): Promise<void> {
	const changedFiles = getChangedFiles();
	if (changedFiles.length === 0) {
		console.log("No changed files found. Nothing to verify.");
		return;
	}

	console.log("Changed files:");
	for (const file of changedFiles) console.log(`  ${file}`);

	const packageRoots = new Set<string>();
	for (const file of changedFiles) {
		const pkg = packageForFile(file);
		if (pkg) packageRoots.add(pkg.root);
	}
	const packages = await Promise.all([...packageRoots].map(loadPackage));
	const changedSdkSource = changedFiles.some(
		(file) =>
			file.startsWith("sdk/packages/") &&
			sourceExtensions.has(path.posix.extname(file)) &&
			!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file),
	);

	let failed = false;
	if (changedSdkSource) {
		console.log(
			"\nSDK source changed; rebuilding SDK packages before tests (repository requirement).",
		);
		if (!run(["bun", "run", "build:sdk"])) failed = true;
	}

	const testsByPackage = new Map<string, Set<string>>();
	for (const file of changedFiles) {
		const pkg = packageForFile(file);
		if (!pkg) continue;
		const tests = siblingTests(file);
		if (tests.length === 0) continue;
		const relativeTests = tests.map((test) =>
			path.relative(pkg.root, path.join(repoRoot, test)).replaceAll("\\", "/"),
		);
		const set = testsByPackage.get(pkg.root) ?? new Set<string>();
		for (const test of relativeTests) set.add(test);
		testsByPackage.set(pkg.root, set);
	}

	for (const pkg of packages) {
		const tests = [...(testsByPackage.get(pkg.root) ?? [])];
		if (tests.length === 0) continue;
		const testScript = pkg.scripts["test:unit"] ?? pkg.scripts.test;
		if (!testScript || !/vitest/.test(testScript)) {
			console.log(
				`\nSKIP focused tests for ${pkg.name}: no Vitest script is configured.`,
			);
			continue;
		}
		const config = existsSync(path.join(pkg.root, "vitest.config.ts"))
			? ["--config", "vitest.config.ts"]
			: [];
		if (!run(["bunx", "vitest", "run", ...config, ...tests], pkg.root)) {
			failed = true;
		}
	}

	const packagesNeedingTypecheck = packages.filter((pkg) =>
		changedFiles.some((file) => {
			const pkgRoot = path.relative(repoRoot, pkg.root).replaceAll("\\", "/");
			const belongsToPackage =
				pkgRoot === "" || file === pkgRoot || file.startsWith(`${pkgRoot}/`);
			return belongsToPackage && checkExtensions.has(path.posix.extname(file));
		}),
	);
	for (const pkg of packagesNeedingTypecheck) {
		if (pkg.scripts.typecheck && !run(["bun", "run", "typecheck"], pkg.root)) {
			failed = true;
		}
	}

	if (!run(["git", "diff", "--check"])) failed = true;
	if (failed) {
		console.error(
			"\nVerification failed. Review the first failing command, fix the cause, then rerun bun run verify:changes.",
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		"\nVerification checks completed successfully. Packages without a focused sibling test were not given a full test-suite run.",
	);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
