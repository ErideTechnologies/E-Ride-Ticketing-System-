import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { supportTicketsTable } from "./tickets";

export const supportTicketLinearLinksTable = pgTable(
  "support_ticket_linear_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supportTicketId: uuid("support_ticket_id")
      .notNull()
      .unique()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    linearIssueId: text("linear_issue_id"),
    linearIssueKey: text("linear_issue_key"),
    linearIssueUrl: text("linear_issue_url"),
    linearTeamKey: text("linear_team_key"),
    linearStatus: text("linear_status"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
);

export type SupportTicketLinearLink =
  typeof supportTicketLinearLinksTable.$inferSelect;
