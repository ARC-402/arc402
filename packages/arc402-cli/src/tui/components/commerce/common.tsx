import React from "react";
import { Box, useTerminalSize } from "../../../renderer/index.js";
import { ThemedText } from "../../../renderer/ThemedText.js";
import type { Theme } from "../../../renderer/theme.js";

export type CommerceTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

const TONE_THEME_COLOR: Record<CommerceTone, keyof Theme["colors"]> = {
  neutral: "white",
  info: "primary",
  success: "success",
  warning: "warning",
  danger: "danger",
  muted: "secondary",
};

const TONE_ICON: Record<CommerceTone, string> = {
  neutral: "•",
  info: "◈",
  success: "✓",
  warning: "⚠",
  danger: "✗",
  muted: "·",
};

export interface StatusPillProps {
  label: string;
  tone?: CommerceTone;
}

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return (
    <ThemedText themeColor={TONE_THEME_COLOR[tone]} bold>
      {TONE_ICON[tone]} {label}
    </ThemedText>
  );
}

export interface CommerceCardProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  status?: StatusPillProps;
  footer?: string;
  children: React.ReactNode;
}

/**
 * Shared visual language for Spec 46 Phase 2 renderers:
 * - cyan eyebrow/title for ARC-402 identity
 * - concise boxed sections instead of free-form console dumps
 * - status semantics always flow through StatusPill tones
 * - muted metadata, white primary values, deliberate spacing between blocks
 */
export function CommerceCard({ eyebrow, title, subtitle, status, footer, children }: CommerceCardProps) {
  const { columns } = useTerminalSize();
  const ruleWidth = Math.max(16, Math.min(60, columns - 4));

  return (
    <Box flexDirection="column">
      {eyebrow ? (
        <ThemedText variant="header">
          ◈ {eyebrow}
        </ThemedText>
      ) : null}
      <ThemedText themeColor="white" bold>
        {title}
        {status ? <ThemedText>  </ThemedText> : null}
        {status ? <StatusPill {...status} /> : null}
      </ThemedText>
      {subtitle ? <ThemedText themeColor="dim">{subtitle}</ThemedText> : null}
      <ThemedText variant="separator">{"─".repeat(ruleWidth)}</ThemedText>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
      {footer ? (
        <Box marginTop={1}>
          <ThemedText themeColor="dim">{footer}</ThemedText>
        </Box>
      ) : null}
    </Box>
  );
}

export interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  tone?: CommerceTone;
}

export function DetailRow({ label, value, tone = "neutral" }: DetailRowProps) {
  const { columns } = useTerminalSize();
  const labelWidth = columns < 72 ? 12 : 16;

  return (
    <Box>
      <Box width={labelWidth} flexShrink={0}>
        <ThemedText variant="label">{label}</ThemedText>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        {typeof value === "string" ? <ThemedText themeColor={TONE_THEME_COLOR[tone]}>{value}</ThemedText> : value}
      </Box>
    </Box>
  );
}

export interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <ThemedText themeColor="white" bold>{title}</ThemedText>
      <Box flexDirection="column" marginLeft={2}>
        {children}
      </Box>
    </Box>
  );
}

export interface MeterProps {
  label?: string;
  value: number;
  width?: number;
  tone?: CommerceTone;
  suffix?: string;
}

export function Meter({ label, value, width = 28, tone = "info", suffix = "%" }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  return (
    <Box flexDirection="column">
      {label ? <ThemedText themeColor="dim">{label}</ThemedText> : null}
      <ThemedText themeColor={TONE_THEME_COLOR[tone]}>
        {"█".repeat(filled)}
        <ThemedText themeColor="dim">{"░".repeat(empty)}</ThemedText>
        <ThemedText> {clamped.toFixed(1)}{suffix}</ThemedText>
      </ThemedText>
    </Box>
  );
}

export interface ListRowProps {
  prefix?: React.ReactNode;
  title: string;
  meta?: string;
  detail?: string;
  status?: StatusPillProps;
}

export function ListRow({ prefix, title, meta, detail, status }: ListRowProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <ThemedText>{prefix ?? "  "}</ThemedText>
        <ThemedText themeColor="white" bold>{title}</ThemedText>
        {status ? <ThemedText>  </ThemedText> : null}
        {status ? <StatusPill {...status} /> : null}
      </Box>
      {meta ? <ThemedText themeColor="dim">{meta}</ThemedText> : null}
      {detail ? <ThemedText>{detail}</ThemedText> : null}
    </Box>
  );
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

export function formatCountdown(minutes?: number): string {
  if (minutes === undefined || minutes === null || !Number.isFinite(minutes)) return "n/a";
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}
