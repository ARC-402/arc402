import React from "react";
import { Box } from "../../../renderer/index.js";
import { ThemedText } from "../../../renderer/ThemedText.js";
import { CommerceCard, DetailRow, Section, type StatusPillProps } from "./common";

export interface JobStatusCardProps {
  agreementId: string;
  capability: string;
  status: StatusPillProps;
  harness?: string;
  jobDir?: string;
  pid?: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: string;
  deliverableHash?: string;
  error?: string;
  logTail?: string[];
}

export function JobStatusCard(props: JobStatusCardProps) {
  return (
    <CommerceCard eyebrow="Job Status" title={`Agreement #${props.agreementId}`} status={props.status} subtitle={props.capability}>
      <DetailRow label="harness" value={props.harness ?? "n/a"} />
      <DetailRow label="pid" value={props.pid ?? "n/a"} />
      <DetailRow label="job dir" value={props.jobDir ?? "n/a"} />
      <DetailRow label="started" value={props.startedAt ?? "n/a"} />
      <DetailRow label="completed" value={props.completedAt ?? "n/a"} />
      <DetailRow label="exit" value={props.exitCode ?? "n/a"} />
      <DetailRow label="root hash" value={props.deliverableHash ?? "n/a"} />
      {props.error ? <DetailRow label="error" value={props.error} tone="danger" /> : null}
      {props.logTail && props.logTail.length > 0 ? (
        <Section title="log tail">
          <Box flexDirection="column">
            {props.logTail.map((line, index) => (
              <ThemedText key={`${index}:${line}`} themeColor="dim">{line}</ThemedText>
            ))}
          </Box>
        </Section>
      ) : null}
    </CommerceCard>
  );
}
