import type { KeyboardEvent } from "react";

const DEFAULT_INDENT = "  ";

function unindentLine(line: string, indent: string): { line: string; removed: number } {
  if (line.startsWith(indent)) {
    return { line: line.slice(indent.length), removed: indent.length };
  }

  if (line.startsWith("\t")) {
    return { line: line.slice(1), removed: 1 };
  }

  return { line, removed: 0 };
}

export function handleTextareaTabKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  onValueChange: (value: string) => void,
  indent: string = DEFAULT_INDENT
) {
  if (event.key !== "Tab") {
    return;
  }

  event.preventDefault();

  const textarea = event.currentTarget;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const hasSelection = start !== end;
  let nextValue = value;
  let nextStart = start;
  let nextEnd = end;

  if (event.shiftKey) {
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const blockEnd = hasSelection ? end : value.indexOf("\n", start);
    const lineEnd = blockEnd === -1 ? value.length : blockEnd;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    let removedBeforeStart = 0;
    let removedTotal = 0;
    let offset = lineStart;

    const nextBlock = lines
      .map((line) => {
        const result = unindentLine(line, indent);
        if (result.removed > 0) {
          removedTotal += result.removed;
          if (offset < start) {
            removedBeforeStart += Math.min(result.removed, start - offset);
          }
        }
        offset += line.length + 1;
        return result.line;
      })
      .join("\n");

    nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`;
    nextStart = Math.max(lineStart, start - removedBeforeStart);
    nextEnd = Math.max(nextStart, end - removedTotal);
  } else if (hasSelection) {
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const selectedBlock = value.slice(lineStart, end);
    const lines = selectedBlock.split("\n");
    const nextBlock = lines.map((line) => `${indent}${line}`).join("\n");

    nextValue = `${value.slice(0, lineStart)}${nextBlock}${value.slice(end)}`;
    nextStart = start + indent.length;
    nextEnd = end + indent.length * lines.length;
  } else {
    nextValue = `${value.slice(0, start)}${indent}${value.slice(end)}`;
    nextStart = start + indent.length;
    nextEnd = nextStart;
  }

  onValueChange(nextValue);

  window.requestAnimationFrame(() => {
    textarea.setSelectionRange(nextStart, nextEnd);
  });
}
