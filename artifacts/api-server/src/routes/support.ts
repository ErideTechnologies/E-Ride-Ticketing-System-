import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import {
  db,
  generateSupportTicketReference,
  supportOrganisationsTable,
  supportProductsTable,
  supportTicketsTable,
  type TicketCategory,
  type TicketPriority,
  type TicketSeverity,
} from "@workspace/db";
import {
  CreateSupportTicketBody,
  ListPublicSupportProductsResponse,
  ListSupportTicketsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const ERIDE_ORG_CODE = "ERIDE";

const PRIORITY_BY_CATEGORY: Partial<Record<TicketCategory, TicketPriority>> = {
  security_privacy_concern: "urgent",
  system_downtime: "urgent",
  payment_issue: "high",
  otp_verification_issue: "high",
  document_upload_issue: "high",
  technical_bug: "high",
  performance_issue: "medium",
  complaint: "medium",
};

const SEVERITY_BY_CATEGORY: Partial<Record<TicketCategory, TicketSeverity>> = {
  security_privacy_concern: "critical",
  system_downtime: "critical",
  payment_issue: "major",
  otp_verification_issue: "major",
  document_upload_issue: "major",
  technical_bug: "major",
  performance_issue: "moderate",
};

function suggestPriority(category: TicketCategory): TicketPriority {
  return PRIORITY_BY_CATEGORY[category] ?? "medium";
}

function suggestSeverity(category: TicketCategory): TicketSeverity {
  return SEVERITY_BY_CATEGORY[category] ?? "moderate";
}

async function getErideOrganisation() {
  return db.query.supportOrganisationsTable.findFirst({
    where: and(
      eq(supportOrganisationsTable.organisationCode, ERIDE_ORG_CODE),
      eq(supportOrganisationsTable.status, "active"),
    ),
  });
}

router.get("/support/products", async (req, res): Promise<void> => {
  const org = await getErideOrganisation();
  if (!org) {
    req.log.error({ orgCode: ERIDE_ORG_CODE }, "Eride organisation not found");
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }

  const products = await db
    .select({
      id: supportProductsTable.id,
      productCode: supportProductsTable.productCode,
      productName: supportProductsTable.productName,
      productDescription: supportProductsTable.productDescription,
    })
    .from(supportProductsTable)
    .where(
      and(
        eq(supportProductsTable.organisationId, org.id),
        eq(supportProductsTable.isActive, true),
        eq(supportProductsTable.isPublicVisible, true),
      ),
    )
    .orderBy(supportProductsTable.productName);

  res.json(ListPublicSupportProductsResponse.parse(products));
});

router.get("/support/tickets", async (req, res): Promise<void> => {
  const { createdFrom: rawFrom, createdTo: rawTo, ...rest } = req.query;
  const parsed = ListSupportTicketsQueryParams.omit({
    createdFrom: true,
    createdTo: true,
  }).safeParse(rest);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid filters" });
    return;
  }
  const q = parsed.data;

  function parseDate(value: unknown): Date | null {
    if (typeof value !== "string" || value.trim() === "") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const createdFrom = parseDate(rawFrom);
  const createdTo = parseDate(rawTo);
  if ((rawFrom && !createdFrom) || (rawTo && !createdTo)) {
    res.status(400).json({ error: "Invalid date filters" });
    return;
  }

  const org = await getErideOrganisation();
  if (!org) {
    req.log.error({ orgCode: ERIDE_ORG_CODE }, "Eride organisation not found");
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }

  const conditions: SQL[] = [eq(supportTicketsTable.organisationId, org.id)];

  if (q.productId) conditions.push(eq(supportTicketsTable.productId, q.productId));
  if (q.productCode)
    conditions.push(eq(supportProductsTable.productCode, q.productCode));
  if (q.category) conditions.push(eq(supportTicketsTable.category, q.category));
  if (q.publicStatus)
    conditions.push(eq(supportTicketsTable.publicStatus, q.publicStatus));
  if (q.internalStatus)
    conditions.push(eq(supportTicketsTable.internalStatus, q.internalStatus));
  if (q.priority) conditions.push(eq(supportTicketsTable.priority, q.priority));
  if (q.severity) conditions.push(eq(supportTicketsTable.severity, q.severity));
  if (q.source) conditions.push(eq(supportTicketsTable.source, q.source));
  if (q.reporterType)
    conditions.push(eq(supportTicketsTable.reporterType, q.reporterType));
  if (createdFrom) conditions.push(gte(supportTicketsTable.createdAt, createdFrom));
  if (createdTo) conditions.push(lte(supportTicketsTable.createdAt, createdTo));

  if (q.search && q.search.trim()) {
    const term = `%${q.search.trim()}%`;
    const searchCond = or(
      ilike(supportTicketsTable.ticketReference, term),
      ilike(supportTicketsTable.reporterName, term),
      ilike(supportTicketsTable.reporterEmail, term),
      ilike(supportTicketsTable.reporterWhatsapp, term),
      ilike(supportTicketsTable.issueSummary, term),
      ilike(supportTicketsTable.whatWentWrong, term),
      ilike(supportTicketsTable.applicationReference, term),
      ilike(supportTicketsTable.accountReference, term),
    );
    if (searchCond) conditions.push(searchCond);
  }

  const rows = await db
    .select({
      id: supportTicketsTable.id,
      ticketReference: supportTicketsTable.ticketReference,
      productName: supportProductsTable.productName,
      productCode: supportProductsTable.productCode,
      category: supportTicketsTable.category,
      publicStatus: supportTicketsTable.publicStatus,
      internalStatus: supportTicketsTable.internalStatus,
      priority: supportTicketsTable.priority,
      severity: supportTicketsTable.severity,
      reporterType: supportTicketsTable.reporterType,
      reporterName: supportTicketsTable.reporterName,
      reporterEmail: supportTicketsTable.reporterEmail,
      reporterWhatsapp: supportTicketsTable.reporterWhatsapp,
      issueSummary: supportTicketsTable.issueSummary,
      source: supportTicketsTable.source,
      environment: supportTicketsTable.environment,
      createdAt: supportTicketsTable.createdAt,
      updatedAt: supportTicketsTable.updatedAt,
    })
    .from(supportTicketsTable)
    .innerJoin(
      supportProductsTable,
      eq(supportProductsTable.id, supportTicketsTable.productId),
    )
    .where(and(...conditions))
    .orderBy(desc(supportTicketsTable.createdAt));

  res.json(
    rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
});

router.post("/support/tickets", async (req, res): Promise<void> => {
  const parsed = CreateSupportTicketBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      { errors: parsed.error.message },
      "Invalid support ticket submission",
    );
    res.status(400).json({ error: "Please check the form and try again." });
    return;
  }

  const body = parsed.data;

  const reporterEmail = body.reporterEmail?.trim() ?? "";
  const reporterWhatsapp = body.reporterWhatsapp?.trim() ?? "";
  if (!reporterEmail && !reporterWhatsapp) {
    res.status(400).json({
      error: "Provide either an email address or a WhatsApp number.",
    });
    return;
  }

  const org = await getErideOrganisation();
  if (!org) {
    req.log.error({ orgCode: ERIDE_ORG_CODE }, "Eride organisation not found");
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }

  const product = await db.query.supportProductsTable.findFirst({
    where: and(
      eq(supportProductsTable.id, body.productId),
      eq(supportProductsTable.organisationId, org.id),
      eq(supportProductsTable.isActive, true),
      eq(supportProductsTable.isPublicVisible, true),
    ),
  });
  if (!product) {
    res.status(404).json({ error: "Selected product is not available." });
    return;
  }

  const ticketReference = await generateSupportTicketReference(
    org.id,
    product.id,
  );

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      organisationId: org.id,
      productId: product.id,
      ticketReference,
      source: "public_form",
      category: body.category,
      publicStatus: "received",
      internalStatus: "triage_required",
      priority: suggestPriority(body.category),
      severity: suggestSeverity(body.category),
      reporterType: body.reporterType,
      reporterName: body.reporterName,
      reporterEmail: reporterEmail || "",
      reporterWhatsapp: reporterWhatsapp || null,
      pageOrStep: body.pageOrStep ?? null,
      applicationReference: body.applicationReference ?? null,
      accountReference: body.accountReference ?? null,
      issueSummary: body.issueSummary,
      whatWereYouTryingToDo: body.whatWereYouTryingToDo ?? null,
      whatWentWrong: body.whatWentWrong,
      environment: "production",
    })
    .returning();

  if (!ticket) {
    req.log.error({ ticketReference }, "Failed to insert ticket");
    res.status(500).json({ error: "Could not save the ticket." });
    return;
  }

  res.status(201).json({
    ticketReference: ticket.ticketReference,
    publicStatus: ticket.publicStatus,
    productName: product.productName,
    createdAt: ticket.createdAt.toISOString(),
  });
});

export default router;
