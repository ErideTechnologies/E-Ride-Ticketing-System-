import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { supportTicketsTable } from "./tickets";

export const supportTicketSentryLinksTable = pgTable(
  "support_ticket_sentry_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supportTicketId: uuid("support_ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    sentryIssueId: text("sentry_issue_id"),
    sentryEventId: text("sentry_event_id"),
    sentryProject: text("sentry_project"),
    sentryUrl: text("sentry_url"),
    environment: text("environment"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type SupportTicketSentryLink =
  typeof supportTicketSentryLinksTable.$inferSelect;
