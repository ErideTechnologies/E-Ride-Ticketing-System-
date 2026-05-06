import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { supportTicketsTable } from "./tickets";
import {
  internalTicketStatusEnum,
  publicTicketStatusEnum,
} from "./enums";

export const supportTicketInternalNotesTable = pgTable(
  "support_ticket_internal_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supportTicketId: uuid("support_ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type SupportTicketInternalNote =
  typeof supportTicketInternalNotesTable.$inferSelect;

export const supportTicketStatusHistoryTable = pgTable(
  "support_ticket_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supportTicketId: uuid("support_ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    oldPublicStatus: publicTicketStatusEnum("old_public_status"),
    newPublicStatus: publicTicketStatusEnum("new_public_status"),
    oldInternalStatus: internalTicketStatusEnum("old_internal_status"),
    newInternalStatus: internalTicketStatusEnum("new_internal_status"),
    changedByName: text("changed_by_name"),
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type SupportTicketStatusHistory =
  typeof supportTicketStatusHistoryTable.$inferSelect;
