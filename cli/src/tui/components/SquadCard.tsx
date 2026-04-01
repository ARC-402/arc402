import React from "react";
import { Box, Text } from "ink";
import type { ArenaSquadViewModel } from "../../ui/arena-ux.js";

export interface SquadCardProps {
  squad: ArenaSquadViewModel;
}

export function SquadCard({ squad }: SquadCardProps) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ Squad: {squad.name}
        </Text>
      </Box>

      <Box>
        <Box width={10}>
          <Text dimColor>ID</Text>
        </Box>
        <Text>{squad.id}</Text>
      </Box>
      <Box>
        <Box width={10}>
          <Text dimColor>Domain</Text>
        </Box>
        <Text>{squad.domainTag ?? "—"}</Text>
      </Box>
      <Box>
        <Box width={10}>
          <Text dimColor>Status</Text>
        </Box>
        <Text>{squad.status}</Text>
      </Box>
      <Box marginBottom={1}>
        <Box width={10}>
          <Text dimColor>Members</Text>
        </Box>
        <Text>{squad.memberCount}</Text>
      </Box>

      {squad.members.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Members</Text>
          {squad.members.map((member, index) => {
            const connector = index === squad.members.length - 1 ? "└" : "├";
            return (
              <Box key={`${member.agent}-${index}`}>
                <Text dimColor>{connector} </Text>
                <Box width={22}>
                  <Text>{member.agent}</Text>
                </Box>
                <Text dimColor>{member.isLead ? "lead" : member.role}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box flexDirection="column">
        <Text dimColor>Briefings</Text>
        {squad.briefings.length === 0 ? (
          <Text dimColor>No published briefings yet.</Text>
        ) : (
          squad.briefings.slice(0, 4).map((briefing, index) => {
            const connector = index === Math.min(squad.briefings.length, 4) - 1 ? "└" : "├";
            return (
              <Box key={`${briefing.preview}-${index}`}>
                <Text dimColor>{connector} </Text>
                <Text>{briefing.preview}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
