import React from "react";
import { Box, Text } from "../../renderer/index.js";

type RendererColor = "cyan" | "green" | "yellow" | "red" | "white" | "slate" | undefined;

type SegmentStyle = {
  color?: RendererColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
};

type Segment = SegmentStyle & { text: string };

const ANSI_PATTERN = /\u001B\[([0-9;]*)m/g;

function cloneStyle(style: SegmentStyle): SegmentStyle {
  return { ...style };
}

function resolveAnsiColor(code: number): RendererColor {
  switch (code) {
    case 36:
    case 96:
      return "cyan";
    case 32:
    case 92:
      return "green";
    case 33:
    case 93:
      return "yellow";
    case 31:
    case 91:
      return "red";
    case 37:
    case 97:
      return "white";
    case 90:
      return "slate";
    default:
      return undefined;
  }
}

function applyAnsiCode(style: SegmentStyle, code: number): SegmentStyle {
  switch (code) {
    case 0:
      return {};
    case 1:
      return { ...style, bold: true };
    case 2:
      return { ...style, dim: true };
    case 3:
      return { ...style, italic: true };
    case 4:
      return { ...style, underline: true };
    case 7:
      return { ...style, inverse: true };
    case 22:
      return { ...style, bold: false, dim: false };
    case 23:
      return { ...style, italic: false };
    case 24:
      return { ...style, underline: false };
    case 27:
      return { ...style, inverse: false };
    case 39:
      return { ...style, color: undefined };
    default: {
      const color = resolveAnsiColor(code);
      return color === undefined ? style : { ...style, color };
    }
  }
}

function parseAnsiSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let style: SegmentStyle = {};
  let cursor = 0;

  for (const match of line.matchAll(ANSI_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ text: line.slice(cursor, index), ...cloneStyle(style) });
    }

    const codes = (match[1] || "0")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value));

    style = codes.length === 0
      ? {}
      : codes.reduce((next, code) => applyAnsiCode(next, code), style);

    cursor = index + match[0].length;
  }

  if (cursor < line.length) {
    segments.push({ text: line.slice(cursor), ...cloneStyle(style) });
  }

  return segments.length > 0 ? segments : [{ text: line }];
}

export function AnsiTextLine({ line }: { line: string }) {
  const segments = parseAnsiSegments(line);
  return (
    <Box>
      {segments.map((segment, index) => (
        <Text
          key={`${index}:${segment.text}`}
          color={segment.color}
          bold={segment.bold}
          dimColor={segment.dim}
          italic={segment.italic}
          underline={segment.underline}
          inverse={segment.inverse}
        >
          {segment.text}
        </Text>
      ))}
    </Box>
  );
}
