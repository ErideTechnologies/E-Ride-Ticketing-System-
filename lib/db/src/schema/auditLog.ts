import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { supportTicketsTable } from "./tickets";

export const supportTicketAuditLogTable = pgTable(
  "support_ticket_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supportTicketId: uuid("support_ticket_id").references(
      () => supportTicketsTable.id,
      { onDelete: "cascade" },
    ),
    action: text("action").notNull(),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    actorRole: text("actor_role"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type SupportTicketAuditLog =
  typeof supportTicketAuditLogTable.$inferSelect;
