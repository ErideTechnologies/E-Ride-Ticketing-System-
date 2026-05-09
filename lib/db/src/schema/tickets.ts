import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { supportOrganisationsTable } from "./organisations";
import { supportProductsTable } from "./products";
import {
  internalTicketStatusEnum,
  publicTicketStatusEnum,
  ticketCategoryEnum,
  ticketPriorityEnum,
  ticketSeverityEnum,
} from "./enums";

export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => supportOrganisationsTable.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => supportProductsTable.id, { onDelete: "restrict" }),
    ticketReference: text("ticket_reference").notNull(),
    source: text("source").notNull(),
    category: ticketCategoryEnum("category").notNull(),
    publicStatus: publicTicketStatusEnum("public_status")
      .notNull()
      .default("received"),
    internalStatus: internalTicketStatusEnum("internal_status")
      .notNull()
      .default("new"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    severity: ticketSeverityEnum("severity").notNull().default("moderate"),
    reporterType: text("reporter_type").notNull(),
    reporterName: text("reporter_name").notNull(),
    reporterEmail: text("reporter_email").notNull(),
    reporterWhatsapp: text("reporter_whatsapp"),
    userId: uuid("user_id"),
    companyId: uuid("company_id"),
    firmId: uuid("firm_id"),
    partnerId: uuid("partner_id"),
    applicationReference: text("application_reference"),
    accountReference: text("account_reference"),
    pageOrStep: text("page_or_step"),
    issueSummary: text("issue_summary").notNull(),
    whatWereYouTryingToDo: text("what_were_you_trying_to_do"),
    whatWentWrong: text("what_went_wrong").notNull(),
    environment: text("environment"),
    assignedSupportUserId: uuid("assigned_support_user_id"),
    assignedProductOwnerId: uuid("assigned_product_owner_id"),
    assignedDeveloperId: uuid("assigned_developer_id"),
    assignedQaVerifierId: uuid("assigned_qa_verifier_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
    consentIp: text("consent_ip"),
    deviceInfo: jsonb("device_info"),
  },
  (t) => [
    uniqueIndex("support_tickets_reference_unique").on(t.ticketReference),
  ],
);

export const insertSupportTicketSchema = createInsertSchema(
  supportTicketsTable,
).omit({
  id: true,
  ticketReference: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;

/**
 * Tracks the next ticket sequence number scoped to organisation + product + year.
 * Used by `generateSupportTicketReference` to atomically allocate references like
 * `EMA-SUP-2026-000001`.
 */
export const supportTicketSequencesTable = pgTable(
  "support_ticket_sequences",
  {
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => supportOrganisationsTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => supportProductsTable.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    lastSequence: integer("last_sequence").notNull().default(0),
  },
  (t) => [
    uniqueIndex("support_ticket_sequences_scope_unique").on(
      t.organisationId,
      t.productId,
      t.year,
    ),
  ],
);
