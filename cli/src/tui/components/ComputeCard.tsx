import React from "react";
import { Box, Text } from "ink";

export interface ComputeMetric {
  label: string;
  value: string;
}

export interface ComputeUsageSummary {
  consumed: string;
  cost: string;
  remaining: string;
  escrowCeiling?: string;
  percentUsed?: number;
}

export interface ComputeCardProps {
  title?: string;
  sessionId: string;
  provider: string;
  gpuSpec?: string;
  rate: string;
  started?: string;
  status?: string;
  usage?: ComputeUsageSummary;
  metrics?: ComputeMetric[];
  footerHints?: string[];
}

function renderProgressBar(percentUsed = 0): string {
  const clamped = Math.max(0, Math.min(100, percentUsed));
  const filled = Math.round((clamped / 100) * 32);
  return `${"█".repeat(filled)}${"░".repeat(32 - filled)} ${clamped.toFixed(1)}%`;
}

export function ComputeCard({
  title = "Compute Session",
  sessionId,
  provider,
  gpuSpec,
  rate,
  started,
  status,
  usage,
  metrics = [],
  footerHints = [],
}: ComputeCardProps) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ {title}
        </Text>
      </Box>
      <Box>
        <Box width={12}>
          <Text dimColor>Session</Text>
        </Box>
        <Text color="white">{sessionId}</Text>
      </Box>
      <Box>
        <Box width={12}>
          <Text dimColor>Provider</Text>
        </Box>
        <Text color="white">{provider}</Text>
      </Box>
      {gpuSpec && (
        <Box>
          <Box width={12}>
            <Text dimColor>GPU</Text>
          </Box>
          <Text color="white">{gpuSpec}</Text>
        </Box>
      )}
      <Box>
        <Box width={12}>
          <Text dimColor>Rate</Text>
        </Box>
        <Text color="white">{rate}</Text>
      </Box>
      {started && (
        <Box>
          <Box width={12}>
            <Text dimColor>Started</Text>
          </Box>
          <Text color="white">{started}</Text>
        </Box>
      )}
      {status && (
        <Box>
          <Box width={12}>
            <Text dimColor>Status</Text>
          </Box>
          <Text color="white">{status}</Text>
        </Box>
      )}
      {usage && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Usage</Text>
          <Box>
            <Text dimColor>├ </Text>
            <Box width={12}>
              <Text dimColor>Consumed</Text>
            </Box>
            <Text color="white">{usage.consumed}</Text>
          </Box>
          <Box>
            <Text dimColor>├ </Text>
            <Box width={12}>
              <Text dimColor>Cost so far</Text>
            </Box>
            <Text color="white">{usage.cost}</Text>
          </Box>
          <Box>
            <Text dimColor>└ </Text>
            <Box width={12}>
              <Text dimColor>Remaining</Text>
            </Box>
            <Text color="white">
              {usage.remaining}
              {usage.escrowCeiling ? ` (${usage.escrowCeiling})` : ""}
            </Text>
          </Box>
          {usage.percentUsed !== undefined && (
            <Box marginTop={1}>
              <Text color="cyan">{renderProgressBar(usage.percentUsed)}</Text>
            </Box>
          )}
        </Box>
      )}
      {metrics.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Current Metrics</Text>
          {metrics.map((metric, index) => {
            const branch = index === metrics.length - 1 ? "└" : "├";
            return (
              <Box key={`${metric.label}-${index}`}>
                <Text dimColor>{branch} </Text>
                <Box width={12}>
                  <Text dimColor>{metric.label}</Text>
                </Box>
                <Text color="white">{metric.value}</Text>
              </Box>
            );
          })}
        </Box>
      )}
      {footerHints.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {footerHints.map((hint) => (
            <Text key={hint} dimColor>
              {hint}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
