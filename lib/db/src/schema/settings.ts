import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { supportOrganisationsTable } from "./organisations";

export const supportSettingsTable = pgTable(
  "support_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => supportOrganisationsTable.id, { onDelete: "cascade" }),
    supportDisplayName: text("support_display_name").notNull(),
    supportEmailFrom: text("support_email_from").notNull(),
    supportEmailReplyTo: text("support_email_reply_to").notNull(),
    defaultSenderName: text("default_sender_name").notNull(),
    defaultSenderRole: text("default_sender_role").notNull(),
    publicTicketTokenTtlMinutes: integer("public_ticket_token_ttl_minutes")
      .notNull()
      .default(30),
    allowPublicReplies: boolean("allow_public_replies").notNull().default(true),
    allowPublicAttachments: boolean("allow_public_attachments")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("support_settings_org_unique").on(t.organisationId),
  ],
);

export type SupportSettings = typeof supportSettingsTable.$inferSelect;
export type InsertSupportSettings = typeof supportSettingsTable.$inferInsert;
