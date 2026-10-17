import { describe, expect, it } from "vitest";
import { evaluateEngineeringWorkflowGate } from "./engineering-workflow";

const approvedConversation = [
	{ role: "user", content: "Implement a new authentication feature with tests." },
	{
		role: "assistant",
		content:
			"Specification\nObjective: add authentication.\nArchitecture: use the existing auth service.\nBehavioral contract: reject invalid credentials.\nSecurity boundaries: never log secrets.\nAcceptance criteria: tests cover success and failure.",
	},
	{ role: "user", content: "I approve this spec. Proceed." },
];

describe("evaluateEngineeringWorkflowGate", () => {
	it("allows read-only tools before spec approval", () => {
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages: [],
				toolName: "read_files",
				input: { paths: ["src/auth.ts"] },
			}).blocked,
		).toBe(false);
	});

	it("blocks file mutations for substantial tasks until a spec is approved", () => {
		const result = evaluateEngineeringWorkflowGate({
			taskPrompt: "Implement a new authentication feature with tests.",
			messages: [
				{ role: "user", content: "Implement a new authentication feature with tests." },
			],
			toolName: "write_to_file",
			input: { path: "src/auth.ts", content: "..." },
		});

		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("specification");
	});

	it("allows low-risk typo and documentation fixes without a formal gate", () => {
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Fix a typo in the README.",
				messages: [{ role: "user", content: "Fix a typo in the README." }],
				toolName: "replace_in_file",
				input: { path: "README.md", diff: "teh -> the" },
			}).blocked,
		).toBe(false);
	});

	it("requires approval after a complete spec, not merely a spec-shaped assistant message", () => {
		const result = evaluateEngineeringWorkflowGate({
			taskPrompt: "Implement a new authentication feature with tests.",
			messages: approvedConversation.slice(0, 2),
			toolName: "write_to_file",
			input: { path: "src/auth.ts", content: "..." },
		});

		expect(result.blocked).toBe(true);
	});

	it("does not treat approval mixed with a scope change as approval", () => {
		const messages = [
			...approvedConversation.slice(0, 2),
			{ role: "user", content: "I approve this spec, but also add billing support." },
		];
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages,
				toolName: "write_to_file",
				input: { path: "src/auth.test.ts", content: "..." },
			}).blocked,
		).toBe(true);
	});

	it("invalidates approval when a new user request changes the scope", () => {
		const messages = [
			...approvedConversation,
			{ role: "user", content: "Also add billing support." },
		];
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages,
				toolName: "write_to_file",
				input: { path: "src/auth.ts", content: "..." },
			}).blocked,
		).toBe(true);
	});

	it("recognizes explicit approval phrasing used in normal conversation", () => {
		const messages = [
			...approvedConversation.slice(0, 2),
			{ role: "user", content: "Okay then implement what you recommend." },
		];
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages,
				toolName: "write_to_file",
				input: { path: "src/auth.test.ts", content: "..." },
			}).blocked,
		).toBe(false);
	});

	it("rejects stale approval when the spec changes after approval", () => {
		const messages = [
			...approvedConversation,
			{
				role: "assistant",
				content:
					"Revised specification\nObjective: add authentication and billing.\nArchitecture: new billing service.\nBehavioral contract: reject invalid credentials.\nSecurity boundaries: never log secrets.\nAcceptance criteria: tests cover both features.",
			},
		];
		const result = evaluateEngineeringWorkflowGate({
			taskPrompt: "Implement a new authentication feature with tests.",
			messages,
			toolName: "write_to_file",
			input: { path: "src/auth.ts", content: "..." },
		});

		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("approval");
	});

	it("requires RED evidence before production source edits", () => {
		const result = evaluateEngineeringWorkflowGate({
			taskPrompt: "Implement a new authentication feature with tests.",
			messages: approvedConversation,
			toolName: "replace_in_file",
			input: { path: "src/auth.ts", diff: "..." },
		});

		expect(result.blocked).toBe(true);
		expect(result.reason).toContain("RED");
	});

	it("allows writing a test after spec approval but before RED evidence", () => {
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages: approvedConversation,
				toolName: "write_to_file",
				input: { path: "src/auth.test.ts", content: "..." },
			}).blocked,
		).toBe(false);
	});

	it("allows isolated test commands after spec approval", () => {
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages: approvedConversation,
				toolName: "run_commands",
				input: { commands: ["bun run test:unit -- src/auth.test.ts"] },
			}).blocked,
		).toBe(false);
	});

	it("does not allow shell chaining to bypass the RED gate", () => {
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages: approvedConversation,
				toolName: "run_commands",
				input: { commands: ["bun run test:unit && rm -rf src"] },
			}).blocked,
		).toBe(true);
	});

	it("allows production edits after a failing test result is recorded", () => {
		const messages = [
			...approvedConversation,
			{
				role: "tool",
				content: "FAIL src/auth.test.ts: expected 401, received 200",
				isError: true,
			},
		];
		expect(
			evaluateEngineeringWorkflowGate({
				taskPrompt: "Implement a new authentication feature with tests.",
				messages,
				toolName: "replace_in_file",
				input: { path: "src/auth.ts", diff: "..." },
			}).blocked,
		).toBe(false);
	});
});
