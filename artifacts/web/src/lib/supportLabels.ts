import {
  CATEGORY_OPTIONS,
  REPORTER_TYPE_OPTIONS,
} from "./supportOptions";

export const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
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
export const PUBLIC_STATUS_LABELS = makeLookup(PUBLIC_STATUS_OPTIONS);
export const INTERNAL_STATUS_LABELS = makeLookup(INTERNAL_STATUS_OPTIONS);

export function humanLabel(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}
