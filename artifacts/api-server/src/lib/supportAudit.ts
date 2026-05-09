import { db, supportTicketAuditLogTable } from "@workspace/db";
import { logger } from "./logger";
import type { SupportSessionUser } from "./supportAuth";

export type SupportAuditAction =
  | "ticket.create"
  | "ticket.update"
  | "ticket.workflow_action"
  | "ticket.note_added"
  | "ticket.message_recorded"
  | "ticket.email_sent"
  | "ticket.attachment_uploaded"
  | "ticket.attachment_deleted"
  | "ticket.linear_link_saved"
  | "ticket.linear_link_removed"
  | "ticket.linear_issue_created"
  | "ticket.sentry_link_added"
  | "ticket.sentry_link_removed"
  | "settings.updated"
  | "template.updated"
  | "auth.login"
  | "auth.logout"
  | "integration.email_test";

export async function recordSupportAuditLog(opts: {
  action: SupportAuditAction;
  supportTicketId?: string | null;
  actor?: SupportSessionUser | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(supportTicketAuditLogTable).values({
      action: opts.action,
      supportTicketId: opts.supportTicketId ?? null,
      actorName: opts.actor?.name ?? null,
      actorEmail: opts.actor?.email ?? null,
      actorRole: opts.actor?.role ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    // Audit log failures must never break the parent action.
    logger.error({ err, action: opts.action }, "Failed to record audit log");
  }
}
