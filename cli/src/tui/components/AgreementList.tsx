import React from "react";
import { Box, Text } from "ink";

export type AgreementState =
  | "PROPOSED"
  | "ACCEPTED"
  | "PENDING_VERIFICATION"
  | "DELIVERED"
  | "FULFILLED"
  | "DISPUTED";

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
}

const STATE_STYLE: Record<
  AgreementState,
  { color: string; symbol: string }
> = {
  PROPOSED: { color: "yellow", symbol: "⚠" },
  ACCEPTED: { color: "cyan", symbol: "◈" },
  PENDING_VERIFICATION: { color: "yellow", symbol: "···" },
  DELIVERED: { color: "yellow", symbol: "⚠" },
  FULFILLED: { color: "green", symbol: "✓" },
  DISPUTED: { color: "red", symbol: "✗" },
};

function truncateAddress(addr: string): string {
  if (addr.startsWith("0x") && addr.length > 10) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
  return addr;
}

export function AgreementList({ agreements, title = "Your Agreements" }: AgreementListProps) {
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
    </Box>
  );
}
