import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organisationStatusEnum } from "./enums";

export const supportOrganisationsTable = pgTable(
  "support_organisations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationName: text("organisation_name").notNull(),
    organisationCode: text("organisation_code").notNull(),
    status: organisationStatusEnum("status").notNull().default("active"),
    plan: text("plan"),
    primaryContactName: text("primary_contact_name"),
    primaryContactEmail: text("primary_contact_email"),
    supportEmail: text("support_email"),
    logoUrl: text("logo_url"),
    brandColor: text("brand_color"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("support_organisations_code_unique").on(t.organisationCode)],
);

export const insertSupportOrganisationSchema = createInsertSchema(
  supportOrganisationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupportOrganisation = z.infer<
  typeof insertSupportOrganisationSchema
>;
export type SupportOrganisation = typeof supportOrganisationsTable.$inferSelect;
