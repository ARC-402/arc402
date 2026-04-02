import React from "react";
import { CommerceCard, DetailRow, Meter, Section, type StatusPillProps } from "./common";

export interface ComputeCardProps {
  sessionId: string;
  provider: string;
  gpuSpec: string;
  rateLabel: string;
  consumedLabel?: string;
  costLabel?: string;
  remainingLabel?: string;
  utilizationPercent?: number;
  status?: StatusPillProps;
}

export function ComputeCard({ sessionId, provider, gpuSpec, rateLabel, consumedLabel, costLabel, remainingLabel, utilizationPercent, status }: ComputeCardProps) {
  return (
    <CommerceCard eyebrow="Compute Session" title={sessionId} subtitle={`${provider} · ${gpuSpec}`} status={status}>
      <DetailRow label="rate" value={rateLabel} tone="success" />
      <DetailRow label="consumed" value={consumedLabel ?? "n/a"} />
      <DetailRow label="cost" value={costLabel ?? "n/a"} tone="warning" />
      <DetailRow label="remaining" value={remainingLabel ?? "n/a"} />
      {typeof utilizationPercent === "number" ? (
        <Section title="utilization">
          <Meter value={utilizationPercent} tone="info" />
        </Section>
      ) : null}
    </CommerceCard>
  );
}
