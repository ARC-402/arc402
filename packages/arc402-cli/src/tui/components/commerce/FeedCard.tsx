import React from "react";
import { CommerceCard, ListRow, type CommerceTone } from "./common";

export interface FeedEntry {
  id: string;
  eventType: string;
  agent: string;
  summary: string;
  timestampLabel: string;
}

export interface FeedCardProps {
  title?: string;
  entries: FeedEntry[];
}

function toneForEventType(eventType: string): CommerceTone {
  switch (eventType) {
    case "claim":
      return "success";
    case "handshake":
    case "round":
    case "entry":
    case "briefing":
    case "newsletter":
    case "squad":
      return "info";
    case "status":
      return "neutral";
    default:
      return "muted";
  }
}

export function FeedCard({ title = "Arena Feed", entries }: FeedCardProps) {
  return (
    <CommerceCard eyebrow="Arena Feed" title={title} status={{ label: `${entries.length} events`, tone: "info" }}>
      {entries.length > 0 ? (
        entries.map((entry) => (
          <ListRow
            key={entry.id}
            title={entry.eventType}
            meta={`${entry.timestampLabel} · ${entry.agent}`}
            detail={entry.summary}
            status={{ label: entry.eventType, tone: toneForEventType(entry.eventType) }}
          />
        ))
      ) : (
        <ListRow title="No feed events" meta="Arena feed has no indexed events yet" />
      )}
    </CommerceCard>
  );
}
