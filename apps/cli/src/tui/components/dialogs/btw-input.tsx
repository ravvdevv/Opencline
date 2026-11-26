// @jsxImportSource @opentui/react
import type { ChoiceContext } from "@opentui-ui/dialog";
import { useDialogKeyboard } from "@opentui-ui/dialog/react";
import { useRef, useState } from "react";
import { useDialogPalette } from "../../hooks/use-theme";

export function BtwInputContent(
	props: ChoiceContext<string | null> & {
		placeholder?: string;
	},
) {
	const { resolve, dismiss, dialogId, placeholder } = props;
	const palette = useDialogPalette();
	const [input, setInput] = useState("");
	const inputRef = useRef("");

	useDialogKeyboard((key) => {
		if (key.name === "escape") {
			dismiss();
			return;
		}
		if (key.name === "return" || key.name === "enter") {
			if (inputRef.current.trim()) {
				resolve(inputRef.current.trim());
			} else {
				dismiss();
			}
			return;
		}
		if (key.name === "backspace") {
			setInput((prev) => prev.slice(0, -1));
			inputRef.current = inputRef.current.slice(0, -1);
			return;
		}
		if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
			setInput((prev) => prev + key.name);
			inputRef.current = inputRef.current + key.name;
			return;
		}
	}, dialogId);

	return (
		<box flexDirection="column" paddingX={1} gap={1}>
			<text selectable>
				{"Ask a question about the code (by the way...)"}
			</text>
			<box flexDirection="row" gap={1} backgroundColor={palette.surface} paddingX={1} paddingY={1}>
				<text>{input}</text>
				<text fg={palette.muted}>█</text>
			</box>
			<text fg={palette.muted}>
				{placeholder ?? "Press Enter to send, Escape to cancel"}
			</text>
		</box>
	);
}