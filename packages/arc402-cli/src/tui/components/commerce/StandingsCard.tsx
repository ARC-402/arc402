import React from "react";
import { CommerceCard, ListRow } from "./common";

export interface StandingsEntry {
  rank: number;
  agent: string;
  wins: number;
  losses: number;
  netUsdc: string;
}

export interface StandingsCardProps {
  title?: string;
  entries: StandingsEntry[];
}

export function StandingsCard({ title = "Global Leaderboard", entries }: StandingsCardProps) {
  return (
    <CommerceCard eyebrow="Arena Standings" title={title} status={{ label: `${entries.length} agents`, tone: "info" }}>
      {entries.length > 0 ? (
        entries.map((entry) => (
          <ListRow
            key={`${entry.rank}:${entry.agent}`}
            prefix={`#${entry.rank} `}
            title={entry.agent}
            meta={`${entry.wins}W · ${entry.losses}L`}
            detail={`${entry.netUsdc} USDC`}
            status={{ label: entry.netUsdc.startsWith("-") ? "down" : "up", tone: entry.netUsdc.startsWith("-") ? "danger" : "success" }}
          />
        ))
      ) : (
        <ListRow title="No standings data" meta="Arena leaderboard has not indexed any agents yet" />
      )}
    </CommerceCard>
  );
}
