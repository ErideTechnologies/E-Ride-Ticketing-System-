import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { supportOrganisationsTable } from "./schema/organisations";
import { supportProductsTable } from "./schema/products";
import { supportSettingsTable } from "./schema/settings";
import {
  supportMessageTemplatesTable,
  type InsertSupportMessageTemplate,
} from "./schema/templates";

const ERIDE_DEFAULT_SETTINGS = {
  supportDisplayName: "Eride Support",
  supportEmailFrom: "Eride Support <support@eridetech.africa>",
  supportEmailReplyTo: "support@eridetech.africa",
  defaultSenderName: "Eride Support",
  defaultSenderRole: "support",
  publicTicketTokenTtlMinutes: 30,
  allowPublicReplies: true,
  allowPublicAttachments: true,
};

type SeedTemplate = Omit<InsertSupportMessageTemplate, "organisationId">;

const ERIDE_DEFAULT_TEMPLATES: SeedTemplate[] = [
  // ── Email templates ──────────────────────────────────────────────────────
  {
    templateKey: "ticket_received",
    templateName: "Ticket received (email)",
    channel: "email",
    subject: "[{{ticketReference}}] We have received your support request",
    bodyText:
      "Hi {{reporterName}},\n\nThank you for contacting {{supportDisplayName}}. We have received your request for {{productName}} and will review it shortly.\n\nWe will keep you updated as soon as there is news on your ticket.\n\nTicket reference: {{ticketReference}}\nStatus: {{publicStatus}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "under_review",
    templateName: "Under review (email)",
    channel: "email",
    subject: "[{{ticketReference}}] Your support ticket is under review",
    bodyText:
      "Hi {{reporterName}},\n\nOur support team is now actively reviewing your ticket about {{productName}}.\n\nWe will follow up as soon as we have more information for you.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "more_info_needed",
    templateName: "More info needed (email)",
    channel: "email",
    subject:
      "[{{ticketReference}}] We need a little more information about your support ticket",
    bodyText:
      "Hi {{reporterName}},\n\nTo help us resolve your issue with {{productName}}, we need a bit more information from you.\n\nPlease reply to this email ({{supportEmailReplyTo}}) with any extra details that may help us understand the problem — a screenshot, the page you were on, and what you clicked before the issue appeared.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "escalated_to_engineering",
    templateName: "Escalated to engineering (email)",
    channel: "email",
    subject: "[{{ticketReference}}] Your support ticket has been escalated",
    bodyText:
      "Hi {{reporterName}},\n\nYour support ticket about {{productName}} has been escalated to our engineering team for further investigation.\n\nWe will let you know as soon as we have an update.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "fixed",
    templateName: "Fixed (email)",
    channel: "email",
    subject: "[{{ticketReference}}] An update on your support ticket",
    bodyText:
      "Hi {{reporterName}},\n\nWe believe the issue you reported with {{productName}} has now been addressed.\n\nPlease try again at your convenience and let us know if you continue to experience the problem.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "resolved",
    templateName: "Resolved (email)",
    channel: "email",
    subject: "[{{ticketReference}}] Your support ticket has been resolved",
    bodyText:
      "Hi {{reporterName}},\n\nWe have marked your support ticket as resolved.\n\nIf the issue returns or you have any further questions, please reply to {{supportEmailReplyTo}} and we will reopen it.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "closed",
    templateName: "Closed (email)",
    channel: "email",
    subject: "[{{ticketReference}}] Your support ticket has been closed",
    bodyText:
      "Hi {{reporterName}},\n\nYour support ticket has been closed.\n\nIf you need further assistance, please reply to {{supportEmailReplyTo}} or submit a new request.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "reopened",
    templateName: "Reopened (email)",
    channel: "email",
    subject: "[{{ticketReference}}] Your support ticket has been reopened",
    bodyText:
      "Hi {{reporterName}},\n\nWe have reopened your support ticket about {{productName}} and are looking into it again.\n\nWe will follow up as soon as there is an update.\n\nTicket reference: {{ticketReference}}\n\n— {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },

  // ── Manual templates (for copy-and-send via WhatsApp/SMS/etc.) ─────────────
  {
    templateKey: "more_info_needed",
    templateName: "More info needed (manual)",
    channel: "manual",
    subject: null,
    bodyText:
      "Hi {{reporterName}}, this is {{supportDisplayName}} regarding your ticket {{ticketReference}} on {{productName}}. We need a little more information — please send a screenshot, the page where the issue happened, and what you clicked before it appeared.",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "escalated_to_engineering",
    templateName: "Escalated to engineering (manual)",
    channel: "manual",
    subject: null,
    bodyText:
      "Hi {{reporterName}}, your issue ({{ticketReference}}) on {{productName}} has been escalated to our technical team. You do not need to report it again — we will update you once it has been resolved. — {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "fixed",
    templateName: "Fixed (manual)",
    channel: "manual",
    subject: null,
    bodyText:
      "Hi {{reporterName}}, the issue you reported ({{ticketReference}}) on {{productName}} has been fixed. Please try again. If it still happens, reply to this message and we will reopen it. — {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
  {
    templateKey: "closed",
    templateName: "Closed (manual)",
    channel: "manual",
    subject: null,
    bodyText:
      "Hi {{reporterName}}, we are closing your support ticket {{ticketReference}} on {{productName}} because the issue has been resolved. If the same issue happens again, please create a new ticket. — {{supportDisplayName}}",
    bodyHtml: null,
    isActive: true,
  },
];

async function seed() {
  console.log("Seeding support organisations and products...");

  const [eride] = await db
    .insert(supportOrganisationsTable)
    .values({
      organisationName: "Eride Technologies",
      organisationCode: "ERIDE",
      status: "active",
      supportEmail: "support@eridetech.africa",
    })
    .onConflictDoNothing({
      target: supportOrganisationsTable.organisationCode,
    })
    .returning();

  const organisation =
    eride ??
    (await db.query.supportOrganisationsTable.findFirst({
      where: eq(supportOrganisationsTable.organisationCode, "ERIDE"),
    }));

  if (!organisation) throw new Error("Failed to seed Eride organisation");

  const products = [
    { productCode: "EMA", productName: "E-Migration Assist", isActive: true, isPublicVisible: true },
    { productCode: "8BT", productName: "8Beauty", isActive: true, isPublicVisible: true },
    { productCode: "ERD", productName: "Eride General Support", isActive: true, isPublicVisible: true },
  ];

  for (const p of products) {
    await db
      .insert(supportProductsTable)
      .values({ ...p, organisationId: organisation.id })
      .onConflictDoNothing({
        target: [
          supportProductsTable.organisationId,
          supportProductsTable.productCode,
        ],
      });
  }

  console.log("Seeding support settings...");
  await db
    .insert(supportSettingsTable)
    .values({ organisationId: organisation.id, ...ERIDE_DEFAULT_SETTINGS })
    .onConflictDoNothing({ target: supportSettingsTable.organisationId });

  console.log("Seeding support message templates...");
  for (const t of ERIDE_DEFAULT_TEMPLATES) {
    await db
      .insert(supportMessageTemplatesTable)
      .values({ ...t, organisationId: organisation.id })
      .onConflictDoNothing({
        target: [
          supportMessageTemplatesTable.organisationId,
          supportMessageTemplatesTable.templateKey,
          supportMessageTemplatesTable.channel,
        ],
      });
  }

  console.log(
    `Seeded organisation ${organisation.organisationCode}, ${products.length} products, settings, and ${ERIDE_DEFAULT_TEMPLATES.length} templates.`,
  );
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
