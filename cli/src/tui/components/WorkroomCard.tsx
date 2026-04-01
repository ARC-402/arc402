import React from "react";
import { Box, Text } from "ink";

export interface WorkroomJob {
  id: string | number;
  status: string;
  description?: string;
}

export interface WorkroomPolicy {
  label: string;
  value: string;
}

export interface WorkroomCardProps {
  jobs?: WorkroomJob[];
  harnessName?: string;
  harnessVersion?: string;
  policies?: WorkroomPolicy[];
}

const JOB_STATUS_COLORS: Record<string, string> = {
  running: "cyan",
  completed: "green",
  failed: "red",
  pending: "yellow",
  idle: "white",
};

/**
 * Displays jobs, harness info, and policy details for the workroom.
 */
export function WorkroomCard({
  jobs = [],
  harnessName,
  harnessVersion,
  policies = [],
}: WorkroomCardProps) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ Workroom
        </Text>
      </Box>

      {/* Harness info */}
      {(harnessName || harnessVersion) && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Box width={12}>
              <Text dimColor>Harness</Text>
            </Box>
            <Text color="white">
              {harnessName ?? "unknown"}
              {harnessVersion ? ` v${harnessVersion}` : ""}
            </Text>
          </Box>
        </Box>
      )}

      {/* Jobs */}
      {jobs.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text dimColor>Jobs ({jobs.length})</Text>
          </Box>
          {jobs.map((job, i) => {
            const isLast = i === jobs.length - 1;
            const connector = isLast ? "└" : "├";
            const statusColor =
              JOB_STATUS_COLORS[job.status.toLowerCase()] ?? "white";
            return (
              <Box key={job.id}>
                <Text dimColor>{connector} </Text>
                <Box width={8}>
                  <Text dimColor>#{job.id}</Text>
                </Box>
                <Box width={12}>
                  <Text color={statusColor}>{job.status}</Text>
                </Box>
                {job.description && (
                  <Text dimColor>{job.description}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {jobs.length === 0 && (
        <Box marginBottom={1}>
          <Text dimColor>No active jobs.</Text>
        </Box>
      )}

      {/* Policies */}
      {policies.length > 0 && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text dimColor>Policy</Text>
          </Box>
          {policies.map((policy, i) => {
            const isLast = i === policies.length - 1;
            const connector = isLast ? "└" : "├";
            return (
              <Box key={i}>
                <Text dimColor>{connector} </Text>
                <Box width={16}>
                  <Text dimColor>{policy.label}</Text>
                </Box>
                <Text color="white">{policy.value}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
