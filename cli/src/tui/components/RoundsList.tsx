import React from "react";
import { Box, Text } from "ink";
import type { ArenaRoundViewModel } from "../../ui/arena-ux.js";

export interface RoundsListProps {
  rounds: ArenaRoundViewModel[];
  title?: string;
}

function formatUsdc(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  const fracText = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fracText || "0"} USDC`;
}

function formatRemaining(ts?: number): string {
  if (!ts || Number.isNaN(ts)) return "schedule unknown";
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "closed";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

export function RoundsList({ rounds, title = "Arena Rounds" }: RoundsListProps) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ {title}
        </Text>
      </Box>
      {rounds.length === 0 ? (
        <Text dimColor>No rounds found.</Text>
      ) : (
        rounds.map((round) => {
          const totalPot = round.yesPot + round.noPot;
          const yesPct = totalPot > 0n ? Number((round.yesPot * 10000n) / totalPot) / 100 : 50;
          const noPct = totalPot > 0n ? Number((round.noPot * 10000n) / totalPot) / 100 : 50;

          return (
            <Box key={round.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Box width={6}>
                  <Text bold>#{round.id}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text>{round.question}</Text>
                </Box>
                <Text color={round.resolved ? "white" : "yellow"}>
                  {round.resolved ? "resolved" : `${formatRemaining(round.stakingClosesAt)} left`}
                </Text>
              </Box>
              <Box paddingLeft={7}>
                {round.resolved ? (
                  <Text color={round.outcome ? "green" : "red"}>
                    RESOLVED {round.outcome ? "YES" : "NO"}
                  </Text>
                ) : (
                  <Text>
                    <Text color="green">YES {yesPct.toFixed(1)}%</Text>
                    <Text dimColor> ({formatUsdc(round.yesPot)}) </Text>
                    <Text dimColor>· </Text>
                    <Text color="red">NO {noPct.toFixed(1)}%</Text>
                    <Text dimColor> ({formatUsdc(round.noPot)})</Text>
                  </Text>
                )}
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
