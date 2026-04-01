import React from "react";
import { Box, Text } from "ink";

export interface StatusCardProps {
  network?: string;
  wallet?: string;
  balance?: string;
  agreements?: number;
}

/**
 * Displays wallet + network + agreements + balance for the `arc402 status` command.
 */
export function StatusCard({ network, wallet, balance, agreements }: StatusCardProps) {
  const hasAny = network || wallet || balance || agreements !== undefined;

  if (!hasAny) {
    return (
      <Box paddingLeft={1}>
        <Text dimColor>No config found. Run 'config init' to get started.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ Status
        </Text>
      </Box>
      {network && (
        <Box>
          <Box width={12}>
            <Text dimColor>Network</Text>
          </Box>
          <Text color="white">{network}</Text>
        </Box>
      )}
      {wallet && (
        <Box>
          <Box width={12}>
            <Text dimColor>Wallet</Text>
          </Box>
          <Text color="white">{wallet}</Text>
        </Box>
      )}
      {balance && (
        <Box>
          <Box width={12}>
            <Text dimColor>Balance</Text>
          </Box>
          <Text color="white">{balance}</Text>
        </Box>
      )}
      {agreements !== undefined && (
        <Box>
          <Box width={12}>
            <Text dimColor>Agreements</Text>
          </Box>
          <Text color="white">{agreements}</Text>
        </Box>
      )}
    </Box>
  );
}
