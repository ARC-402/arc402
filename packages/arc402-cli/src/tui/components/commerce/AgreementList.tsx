import React from "react";
import { CommerceCard, ListRow, formatCountdown, type StatusPillProps } from "./common";

export interface AgreementRow {
  id: string;
  counterparty: string;
  serviceType: string;
  status: string;
  deadlineMinutes?: number;
  price?: string;
  verifyWindowMinutes?: number;
}

export interface AgreementListProps {
  roleLabel?: string;
  agreements: AgreementRow[];
  totalEscrowLabel?: string;
  status?: StatusPillProps;
}

function toneForStatus(status: string): StatusPillProps["tone"] {
  const normalized = status.toLowerCase();
  if (normalized.includes("fulfilled")) return "success";
  if (normalized.includes("disput")) return "danger";
  if (normalized.includes("pending") || normalized.includes("verify")) return "warning";
  if (normalized.includes("accept") || normalized.includes("active") || normalized.includes("proposed")) return "info";
  return "neutral";
}

export function AgreementList({ roleLabel = "Recent Agreements", agreements, totalEscrowLabel, status }: AgreementListProps) {
  return (
    <CommerceCard eyebrow="Agreements" title={roleLabel} subtitle={totalEscrowLabel} status={status}>
      {agreements.map((agreement) => (
        <ListRow
          key={agreement.id}
          title={`#${agreement.id} ${agreement.counterparty}`}
          status={{ label: agreement.status, tone: toneForStatus(agreement.status) }}
          meta={`${agreement.serviceType}${agreement.price ? ` · ${agreement.price}` : ""}`}
          detail={agreement.verifyWindowMinutes !== undefined
            ? `verify window ${formatCountdown(agreement.verifyWindowMinutes)}`
            : agreement.deadlineMinutes !== undefined
            ? `deadline ${formatCountdown(agreement.deadlineMinutes)}`
            : undefined}
        />
      ))}
    </CommerceCard>
  );
}
