import type {
  TicketPriority,
  PublicTicketStatus,
  InternalTicketStatus,
} from "@workspace/db";

export const SLA_STATUSES = [
  "on_track",
  "approaching",
  "breached",
  "paused",
  "completed",
  "not_started",
] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export type SlaPhase = "support_review" | "engineering_fix" | null;

const MINUTES = 60_000;
const HOURS = 60 * MINUTES;

const SUPPORT_REVIEW_SLA_MS: Record<TicketPriority, number> = {
  urgent: 30 * MINUTES,
  high: 2 * HOURS,
  medium: 8 * HOURS,
  low: 48 * HOURS,
};

const ENGINEERING_FIX_SLA_MS: Record<TicketPriority, number> = {
  urgent: 4 * HOURS,
  high: 24 * HOURS,
  medium: 168 * HOURS,
  low: 336 * HOURS,
};

const SUPPORT_REVIEW_OPEN_INTERNAL_STATUSES = new Set<InternalTicketStatus>([
  "new",
  "triage_required",
  "support_review",
]);

const ENGINEERING_FIX_OPEN_INTERNAL_STATUSES = new Set<InternalTicketStatus>([
  "engineering_escalation_required",
  "linear_created",
  "in_engineering",
  "in_review",
  "in_qa_verification",
]);

const PAUSED_INTERNAL_STATUSES = new Set<InternalTicketStatus>([
  "needs_user_info",
  "deferred",
]);

const COMPLETED_INTERNAL_STATUSES = new Set<InternalTicketStatus>([
  "fixed_waiting_user_notification",
  "user_notified",
  "resolved",
  "closed",
  "duplicate",
  "not_a_bug",
  "spam",
]);

export type SlaInput = {
  priority: TicketPriority;
  publicStatus: PublicTicketStatus;
  internalStatus: InternalTicketStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  /** First time the ticket transitioned into an engineering-fix status. */
  engineeringStartedAt: Date | null;
  /** "now" — pass in to keep tests deterministic. */
  now?: Date;
};

export type SlaResult = {
  slaStatus: SlaStatus;
  slaPhase: SlaPhase;
  slaLabel: string;
  /** When the active SLA is due, ISO. Null if no active SLA. */
  slaDueAt: string | null;
  /**
   * Moment the SLA was breached (== slaDueAt when status is breached). Null
   * otherwise. Computed dynamically — not persisted.
   */
  slaBreachedAt: string | null;
  /** Positive = time remaining; negative = overdue. Null if no active SLA. */
  minutesUntilDue: number | null;
  /** Minutes overdue (positive) when breached, else null. */
  overdueMinutes: number | null;
  /** Target SLA duration in minutes for the active phase. Null if none. */
  targetMinutes: number | null;
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function approachingThresholdMs(targetMs: number): number {
  // Within 25% of remaining time OR last 15 minutes for very tight SLAs.
  return Math.max(15 * MINUTES, Math.floor(targetMs * 0.25));
}

export function calculateTicketSla(input: SlaInput): SlaResult {
  const now = input.now ?? new Date();
  const priorityLabel = PRIORITY_LABEL[input.priority];

  if (
    COMPLETED_INTERNAL_STATUSES.has(input.internalStatus) ||
    input.resolvedAt != null ||
    input.closedAt != null
  ) {
    return {
      slaStatus: "completed",
      slaPhase: null,
      slaLabel: "SLA complete",
      slaDueAt: null,
      slaBreachedAt: null,
      minutesUntilDue: null,
      overdueMinutes: null,
      targetMinutes: null,
    };
  }

  if (
    PAUSED_INTERNAL_STATUSES.has(input.internalStatus) ||
    input.publicStatus === "more_info_needed"
  ) {
    return {
      slaStatus: "paused",
      slaPhase: null,
      slaLabel: "SLA paused (waiting on user)",
      slaDueAt: null,
      slaBreachedAt: null,
      minutesUntilDue: null,
      overdueMinutes: null,
      targetMinutes: null,
    };
  }

  let phase: SlaPhase = null;
  let startAt: Date | null = null;
  let targetMs = 0;
  let label = "";

  if (SUPPORT_REVIEW_OPEN_INTERNAL_STATUSES.has(input.internalStatus)) {
    phase = "support_review";
    startAt = input.createdAt;
    targetMs = SUPPORT_REVIEW_SLA_MS[input.priority];
    label = `${priorityLabel} support review`;
  } else if (ENGINEERING_FIX_OPEN_INTERNAL_STATUSES.has(input.internalStatus)) {
    phase = "engineering_fix";
    startAt = input.engineeringStartedAt ?? input.createdAt;
    targetMs = ENGINEERING_FIX_SLA_MS[input.priority];
    label = `${priorityLabel} engineering fix`;
  }

  if (!phase || !startAt) {
    return {
      slaStatus: "not_started",
      slaPhase: null,
      slaLabel: "SLA not active",
      slaDueAt: null,
      slaBreachedAt: null,
      minutesUntilDue: null,
      overdueMinutes: null,
      targetMinutes: null,
    };
  }

  const dueAt = new Date(startAt.getTime() + targetMs);
  const remainingMs = dueAt.getTime() - now.getTime();
  const minutesUntilDue = Math.round(remainingMs / MINUTES);
  const targetMinutes = Math.round(targetMs / MINUTES);

  if (remainingMs <= 0) {
    return {
      slaStatus: "breached",
      slaPhase: phase,
      slaLabel: `${label} overdue`,
      slaDueAt: dueAt.toISOString(),
      slaBreachedAt: dueAt.toISOString(),
      minutesUntilDue,
      overdueMinutes: Math.max(1, Math.round(-remainingMs / MINUTES)),
      targetMinutes,
    };
  }

  const approachThreshold = approachingThresholdMs(targetMs);
  if (remainingMs <= approachThreshold) {
    return {
      slaStatus: "approaching",
      slaPhase: phase,
      slaLabel: `${label} due soon`,
      slaDueAt: dueAt.toISOString(),
      slaBreachedAt: null,
      minutesUntilDue,
      overdueMinutes: null,
      targetMinutes,
    };
  }

  return {
    slaStatus: "on_track",
    slaPhase: phase,
    slaLabel: `${label} on track`,
    slaDueAt: dueAt.toISOString(),
    slaBreachedAt: null,
    minutesUntilDue,
    overdueMinutes: null,
    targetMinutes,
  };
}

/**
 * Returns true if the internal status indicates the ticket is currently in
 * the engineering-fix phase. Used to decide which status_history rows mark
 * the engineering-start moment.
 */
export const ENGINEERING_FIX_STATUSES: ReadonlySet<InternalTicketStatus> =
  ENGINEERING_FIX_OPEN_INTERNAL_STATUSES;
