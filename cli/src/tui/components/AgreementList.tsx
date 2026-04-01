import React from "react";
import { Box, Text } from "ink";

export type AgreementState =
  | "ACTIVE"
  | "PROPOSED"
  | "ACCEPTED"
  | "PENDING_VERIFICATION"
  | "DELIVERED"
  | "FULFILLED"
  | "DISPUTED"
  | "UNKNOWN";

export interface Agreement {
  id: number | string;
  state: AgreementState;
  value: string;
  counterparty: string;
  timestamp?: string;
}

export interface AgreementListProps {
  agreements: Agreement[];
  title?: string;
  summary?: string;
  actionHints?: string[];
}

const STATE_STYLE: Record<
  AgreementState,
  { color: string; symbol: string }
> = {
  ACTIVE: { color: "cyan", symbol: "◉" },
  PROPOSED: { color: "yellow", symbol: "⚠" },
  ACCEPTED: { color: "cyan", symbol: "◈" },
  PENDING_VERIFICATION: { color: "yellow", symbol: "···" },
  DELIVERED: { color: "yellow", symbol: "⚠" },
  FULFILLED: { color: "green", symbol: "✓" },
  DISPUTED: { color: "red", symbol: "✗" },
  UNKNOWN: { color: "white", symbol: "─" },
};

function truncateAddress(addr: string): string {
  if (addr.startsWith("0x") && addr.length > 10) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
  return addr;
}

export function AgreementList({
  agreements,
  title = "Your Agreements",
  summary,
  actionHints = [],
}: AgreementListProps) {
  if (agreements.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            ◈ {title}
          </Text>
        </Box>
        <Text dimColor>No agreements found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ {title}
        </Text>
      </Box>
      {agreements.map((ag) => {
        const style = STATE_STYLE[ag.state] ?? { color: "white", symbol: "─" };
        return (
          <Box key={ag.id}>
            <Box width={5}>
              <Text dimColor>#{ag.id}</Text>
            </Box>
            <Box width={3}>
              <Text color={style.color}>{style.symbol}</Text>
            </Box>
            <Box width={22}>
              <Text color={style.color}>{ag.state}</Text>
            </Box>
            <Box width={14}>
              <Text color="white">{ag.value}</Text>
            </Box>
            <Box width={16}>
              <Text dimColor>{truncateAddress(ag.counterparty)}</Text>
            </Box>
            {ag.timestamp && (
              <Text dimColor>{ag.timestamp}</Text>
            )}
          </Box>
        );
      })}
      {summary && (
        <Box marginTop={1}>
          <Text dimColor>{summary}</Text>
        </Box>
      )}
      {actionHints.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {actionHints.map((hint) => (
            <Text key={hint} dimColor>
              {hint}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
