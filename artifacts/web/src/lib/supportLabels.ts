import {
  CATEGORY_OPTIONS,
  REPORTER_TYPE_OPTIONS,
} from "./supportOptions";

export const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "major", label: "Major" },
  { value: "moderate", label: "Moderate" },
  { value: "minor", label: "Minor" },
  { value: "cosmetic", label: "Cosmetic" },
] as const;

export const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const MESSAGE_DIRECTION_OPTIONS = [
  { value: "outbound", label: "Outbound (to user)" },
  { value: "inbound", label: "Inbound (from user)" },
  { value: "internal", label: "Internal" },
] as const;

export const MESSAGE_CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "in_app", label: "In-app" },
  { value: "manual", label: "Manual" },
  { value: "internal_note", label: "Internal note" },
] as const;

export const MESSAGE_TYPE_OPTIONS = [
  { value: "ticket_received", label: "Ticket received" },
  { value: "under_review", label: "Under review" },
  { value: "more_info_needed", label: "More info needed" },
  { value: "escalated_to_engineering", label: "Escalated to engineering" },
  { value: "fixed", label: "Fixed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "reopened", label: "Reopened" },
  { value: "custom", label: "Custom" },
  { value: "user_reply", label: "User reply" },
  { value: "internal_update", label: "Internal update" },
] as const;

export const MESSAGE_DELIVERY_STATUS_OPTIONS = [
  { value: "drafted", label: "Drafted" },
  { value: "copied", label: "Copied" },
  { value: "sent_manual", label: "Sent (manual)" },
  { value: "received", label: "Received" },
  { value: "failed", label: "Failed" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

export const PUBLIC_STATUS_OPTIONS = [
  { value: "received", label: "Received" },
  { value: "under_review", label: "Under review" },
  { value: "more_info_needed", label: "More info needed" },
  { value: "being_fixed", label: "Being fixed" },
  { value: "fixed", label: "Fixed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

export const INTERNAL_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "triage_required", label: "Triage required" },
  { value: "support_review", label: "Support review" },
  { value: "needs_user_info", label: "Needs user info" },
  { value: "engineering_escalation_required", label: "Engineering escalation required" },
  { value: "linear_created", label: "Linear created" },
  { value: "in_engineering", label: "In engineering" },
  { value: "in_review", label: "In review" },
  { value: "in_qa_verification", label: "In QA verification" },
  { value: "fixed_waiting_user_notification", label: "Fixed (awaiting notification)" },
  { value: "user_notified", label: "User notified" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "not_a_bug", label: "Not a bug" },
  { value: "deferred", label: "Deferred" },
  { value: "spam", label: "Spam" },
] as const;

function makeLookup<T extends readonly { value: string; label: string }[]>(
  options: T,
): Record<string, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label]));
}

export const CATEGORY_LABELS = makeLookup(CATEGORY_OPTIONS);
export const REPORTER_TYPE_LABELS = makeLookup(REPORTER_TYPE_OPTIONS);
export const PRIORITY_LABELS = makeLookup(PRIORITY_OPTIONS);
export const SEVERITY_LABELS = makeLookup(SEVERITY_OPTIONS);
export const PUBLIC_STATUS_LABELS = makeLookup(PUBLIC_STATUS_OPTIONS);
export const INTERNAL_STATUS_LABELS = makeLookup(INTERNAL_STATUS_OPTIONS);
export const MESSAGE_DIRECTION_LABELS = makeLookup(MESSAGE_DIRECTION_OPTIONS);
export const MESSAGE_CHANNEL_LABELS = makeLookup(MESSAGE_CHANNEL_OPTIONS);
export const MESSAGE_TYPE_LABELS = makeLookup(MESSAGE_TYPE_OPTIONS);
export const MESSAGE_DELIVERY_STATUS_LABELS = makeLookup(
  MESSAGE_DELIVERY_STATUS_OPTIONS,
);

export function humanLabel(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export const SLA_STATUS_LABELS: Record<string, string> = {
  on_track: "On track",
  approaching: "Due soon",
  breached: "Overdue",
  paused: "Paused",
  completed: "Met",
  not_started: "Not started",
};

export const SLA_PHASE_LABELS: Record<string, string> = {
  support_review: "Support review",
  engineering_fix: "Engineering fix",
  none: "—",
};

export function slaStatusBadgeClass(status: string): string {
  switch (status) {
    case "breached":
      return "bg-red-600 text-white border-transparent";
    case "approaching":
      return "bg-amber-500 text-white border-transparent";
    case "on_track":
      return "bg-emerald-600 text-white border-transparent";
    case "paused":
      return "bg-slate-400 text-white border-transparent";
    case "completed":
      return "bg-slate-200 text-slate-700 border-transparent";
    default:
      return "bg-muted text-muted-foreground border-transparent";
  }
}

export function formatSlaDuration(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH === 0 ? `${d}d` : `${d}d ${remH}h`;
}
