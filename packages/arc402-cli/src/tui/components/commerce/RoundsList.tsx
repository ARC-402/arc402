import React from "react";
import { CommerceCard, ListRow, type StatusPillProps } from "./common";

export interface RoundRow {
  id: string;
  question: string;
  category?: string;
  yesLabel: string;
  noLabel: string;
  timingLabel: string;
  resolved?: boolean;
  outcomeLabel?: string;
}

export interface RoundsListProps {
  rounds: RoundRow[];
  title?: string;
  status?: StatusPillProps;
}

export function RoundsList({ rounds, title = "Arena Rounds", status }: RoundsListProps) {
  return (
    <CommerceCard eyebrow="Arena" title={title} status={status} footer="Built for round boards and live resolution views.">
      {rounds.map((round) => (
        <ListRow
          key={round.id}
          title={`#${round.id} ${round.question}`}
          status={round.resolved ? { label: round.outcomeLabel ?? "resolved", tone: "success" } : { label: "open", tone: "warning" }}
          meta={`${round.category ?? "uncategorized"} · ${round.timingLabel}`}
          detail={`YES ${round.yesLabel} · NO ${round.noLabel}`}
        />
      ))}
    </CommerceCard>
  );
}
