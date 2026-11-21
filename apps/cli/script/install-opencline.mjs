import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));

if (process.platform === "win32") {
	const script = resolve(scriptDir, "install-opencline.ps1");
	const result = spawnSync(
		"powershell",
		["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
		{ stdio: "inherit" },
	);
	process.exit(result.status ?? 1);
}

const script = resolve(scriptDir, "install-opencline.sh");
const result = spawnSync("bash", [script], { stdio: "inherit" });
process.exit(result.status ?? 1);
