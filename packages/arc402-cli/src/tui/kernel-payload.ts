/**
 * Typed structured payloads from the TUI kernel.
 * These are data-only — no Ink/React dependencies.
 * App.tsx maps them to Phase 2 Ink components.
 */

import type { StatusCardProps } from "./components/commerce/StatusCard";
import type { DiscoverListProps } from "./components/commerce/DiscoverList";
import type { AgreementListProps } from "./components/commerce/AgreementList";
import type { WorkroomCardProps } from "./components/commerce/WorkroomCard";
import type { SubscribeCardProps } from "./components/commerce/SubscribeCard";
import type { RoundsListProps } from "./components/commerce/RoundsList";
import type { SquadCardProps } from "./components/commerce/SquadCard";
import type { ComputeCardProps } from "./components/commerce/ComputeCard";
import type { FeedCardProps } from "./components/commerce/FeedCard";
import type { JobStatusCardProps } from "./components/commerce/JobStatusCard";
import type { ProfileCardProps } from "./components/commerce/ProfileCard";
import type { StandingsCardProps } from "./components/commerce/StandingsCard";

export type KernelPayload =
  | { type: "status"; props: StatusCardProps; guidance?: string[] }
  | { type: "discover"; props: DiscoverListProps }
  | { type: "agreements"; props: AgreementListProps }
  | { type: "workroom"; props: WorkroomCardProps }
  | { type: "subscribe"; props: SubscribeCardProps }
  | { type: "rounds"; props: RoundsListProps }
  | { type: "squad"; props: SquadCardProps }
  | { type: "squads"; cards: SquadCardProps[] }
  | { type: "compute"; props: ComputeCardProps }
  | { type: "computes"; cards: ComputeCardProps[] }
  | { type: "feed"; props: FeedCardProps }
  | { type: "job"; props: JobStatusCardProps }
  | { type: "profile"; props: ProfileCardProps }
  | { type: "standings"; props: StandingsCardProps }
  | { type: "not_found"; message: string }
  | { type: "error"; message: string };
