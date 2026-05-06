import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportOrganisationsTable } from "./organisations";

export const supportProductsTable = pgTable(
  "support_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => supportOrganisationsTable.id, { onDelete: "cascade" }),
    productCode: text("product_code").notNull(),
    productName: text("product_name").notNull(),
    productDescription: text("product_description"),
    isActive: boolean("is_active").notNull().default(true),
    isPublicVisible: boolean("is_public_visible").notNull().default(false),
    defaultSupportOwnerId: uuid("default_support_owner_id"),
    defaultProductOwnerId: uuid("default_product_owner_id"),
    linearTeamKey: text("linear_team_key"),
    sentryProjectId: text("sentry_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("support_products_org_code_unique").on(
      t.organisationId,
      t.productCode,
    ),
  ],
);

export const insertSupportProductSchema = createInsertSchema(
  supportProductsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupportProduct = z.infer<typeof insertSupportProductSchema>;
export type SupportProduct = typeof supportProductsTable.$inferSelect;
