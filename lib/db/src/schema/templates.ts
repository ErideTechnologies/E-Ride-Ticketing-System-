import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { supportOrganisationsTable } from "./organisations";
import { messageChannelEnum, messageTypeEnum } from "./enums";

export const supportMessageTemplatesTable = pgTable(
  "support_message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => supportOrganisationsTable.id, { onDelete: "cascade" }),
    templateKey: messageTypeEnum("template_key").notNull(),
    templateName: text("template_name").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    subject: text("subject"),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("support_message_templates_org_key_channel_unique").on(
      t.organisationId,
      t.templateKey,
      t.channel,
    ),
  ],
);

export type SupportMessageTemplate =
  typeof supportMessageTemplatesTable.$inferSelect;
export type InsertSupportMessageTemplate =
  typeof supportMessageTemplatesTable.$inferInsert;
