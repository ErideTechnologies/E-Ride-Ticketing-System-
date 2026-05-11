import { createHmac } from "node:crypto";
import { logger } from "./logger";

/**
 * Outbound webhook to the Hermes agent.
 *
 * Phase 1 only: Eride Support PUSHES safe ticket-lifecycle metadata to
 * Hermes. Hermes has NO write access to this system in Phase 1 — it can only
 * receive events. The payload is intentionally narrow:
 *
 *   - event type
 *   - ticket id, reference, product code
 *   - subject (the public `issueSummary`)
 *   - category, priority, severity
 *   - publicStatus, internalStatus
 *   - actor (name/email/role of the support user, or null for public)
 *   - timestamp
 *
 * Explicitly NOT sent: reporter email, reporter phone, full message bodies,
 * attachments, document contents, internal notes, audit trail, IP addresses,
 * device info. Adding any of those here is a privacy regression — gate it
 * behind a separate Phase 2+ change with explicit reviewer sign-off.
 *
 * Delivery is fire-and-forget: failures NEVER block the originating action.
 * The most recent delivery outcome is held in process memory and surfaced on
 * the admin Integrations dashboard.
 */

export type HermesEventType =
  | "ticket.created"
  | "ticket.assigned"
  | "ticket.status_changed"
  | "ticket.escalated"
  | "ticket.resolved"
  | "ticket.closed";

export type HermesTicketSnapshot = {
  id: string;
  ticketReference: string;
  productCode: string;
  subject: string;
  category: string;
  priority: string;
  severity: string;
  publicStatus: string;
  internalStatus: string;
};

export type HermesActor = {
  name: string | null;
  email: string | null;
  role: string | null;
};

export type HermesLastDelivery = {
  at: string;
  event: HermesEventType;
  ok: boolean;
  status: number | null;
  error: string | null;
};

let lastDelivery: HermesLastDelivery | null = null;

function envTrim(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isHermesConfigured(): boolean {
  return envTrim("HERMES_WEBHOOK_URL") !== "" && envTrim("HERMES_WEBHOOK_SECRET") !== "";
}

export function isHermesEnabled(): boolean {
  return isHermesConfigured() && envTrim("HERMES_WEBHOOK_ENABLED") === "true";
}

export function getHermesLastDelivery(): HermesLastDelivery | null {
  return lastDelivery;
}

/**
 * Build the safe ticket snapshot. Pure function — no DB, no I/O. Pulls only
 * fields explicitly allowed by the Phase 1 contract.
 */
export function buildHermesTicketSnapshot(
  ticket: {
    id: string;
    ticketReference: string;
    category: string;
    priority: string;
    severity: string;
    publicStatus: string;
    internalStatus: string;
    issueSummary: string;
  },
  productCode: string,
): HermesTicketSnapshot {
  return {
    id: ticket.id,
    ticketReference: ticket.ticketReference,
    productCode,
    subject: ticket.issueSummary,
    category: ticket.category,
    priority: ticket.priority,
    severity: ticket.severity,
    publicStatus: ticket.publicStatus,
    internalStatus: ticket.internalStatus,
  };
}

/**
 * Fire-and-forget delivery. Resolves once the request finishes (success OR
 * failure) so callers that care can `void` it. Updates `lastDelivery` so the
 * admin dashboard reflects the most recent attempt.
 */
export async function sendHermesEvent(opts: {
  event: HermesEventType;
  ticket: HermesTicketSnapshot;
  actor: HermesActor | null;
}): Promise<void> {
  if (!isHermesEnabled()) return;

  const url = envTrim("HERMES_WEBHOOK_URL");
  const secret = envTrim("HERMES_WEBHOOK_SECRET");
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    event: opts.event,
    timestamp,
    ticket: opts.ticket,
    actor: opts.actor,
  });
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  let ok = false;
  let status: number | null = null;
  let error: string | null = null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Source": "eride-support",
        "X-Hermes-Event": opts.event,
        "X-Hermes-Signature": `sha256=${signature}`,
        // Send both header names so receivers expecting either work. The
        // Hermes receiver currently looks for `X-Hermes-Timestamp`; the
        // longer name is kept for backward compatibility.
        "X-Hermes-Timestamp": timestamp,
        "X-Hermes-Delivery-Timestamp": timestamp,
      },
      body,
      signal: controller.signal,
    });
    status = r.status;
    ok = r.ok;
    if (!r.ok) error = `HTTP ${r.status}`;
  } catch (err) {
    error =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Request timed out after 5s"
          : err.message
        : String(err);
    logger.warn(
      { err, event: opts.event, ticketReference: opts.ticket.ticketReference },
      "Hermes webhook delivery failed",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  lastDelivery = {
    at: timestamp,
    event: opts.event,
    ok,
    status,
    error,
  };
}
