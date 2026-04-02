import React from "react";
import { CommerceCard, ListRow, formatPercent, type StatusPillProps } from "./common";

export interface DiscoverAgent {
  rank: number;
  name: string;
  wallet: string;
  serviceType: string;
  trustScore: number;
  compositeScore?: number;
  endpointStatus?: "online" | "offline" | "unknown";
  capabilitySummary?: string;
  priceLabel?: string;
}

export interface DiscoverListProps {
  title?: string;
  agents: DiscoverAgent[];
  summary?: string;
  status?: StatusPillProps;
}

const endpointTone: Record<NonNullable<DiscoverAgent["endpointStatus"]>, StatusPillProps["tone"]> = {
  online: "success",
  offline: "danger",
  unknown: "muted",
};

export function DiscoverList({ title = "Discover Results", agents, summary, status }: DiscoverListProps) {
  return (
    <CommerceCard eyebrow="Discover" title={title} subtitle={summary} status={status} footer={`${agents.length} ranked result${agents.length === 1 ? "" : "s"}` }>
      {agents.map((agent) => (
        <ListRow
          key={`${agent.wallet}-${agent.rank}`}
          prefix={<></>}
          title={`#${agent.rank} ${agent.name}`}
          status={agent.endpointStatus ? { label: agent.endpointStatus, tone: endpointTone[agent.endpointStatus] } : undefined}
          meta={`${agent.wallet} · trust ${agent.trustScore}${agent.priceLabel ? ` · ${agent.priceLabel}` : ""}`}
          detail={`${agent.serviceType}${agent.capabilitySummary ? ` · ${agent.capabilitySummary}` : ""}${typeof agent.compositeScore === "number" ? ` · score ${formatPercent(agent.compositeScore * 100, 1)}` : ""}`}
        />
      ))}
    </CommerceCard>
  );
}
