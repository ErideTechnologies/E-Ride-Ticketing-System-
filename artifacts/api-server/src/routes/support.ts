import { Router, type IRouter } from "express";
import multer from "multer";
import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import {
  db,
  generateSupportTicketReference,
  supportOrganisationsTable,
  supportProductsTable,
  supportTicketAttachmentsTable,
  supportTicketInternalNotesTable,
  supportTicketLinearLinksTable,
  supportTicketSentryLinksTable,
  supportTicketMessagesTable,
  supportTicketStatusHistoryTable,
  supportTicketsTable,
  type SupportTicket,
  type SupportTicketAttachment,
  type SupportTicketMessage,
  type TicketCategory,
  type TicketPriority,
  type TicketSeverity,
} from "@workspace/db";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildStoragePath,
  ensureStorageReady,
  removeStored,
  statStored,
  streamStored,
  validateAttachment,
  validateAttachmentContent,
} from "../lib/attachmentStorage";
import { writeFile } from "node:fs/promises";
import {
  ApplySupportTicketWorkflowActionBody,
  CreateSupportTicketBody,
  CreateSupportTicketMessageBody,
  CreateSupportTicketNoteBody,
  ListPublicSupportProductsResponse,
  ListSupportTicketsQueryParams,
  UpdateSupportTicketBody,
  UpsertSupportTicketLinearLinkBody,
  CreateSupportTicketSentryLinkBody,
  SendSupportTicketEmailBody,
} from "@workspace/api-zod";
import * as Sentry from "@sentry/node";
import {
  isSupportEmailEnabled,
  sendSupportEmail,
} from "../lib/supportEmail";
import {
  renderCustomEmailHtml,
  renderSupportEmailTemplate,
  SUPPORT_EMAIL_TEMPLATE_KEYS,
  type SupportEmailTemplateKey,
} from "../lib/supportEmailTemplates";
import {
  signPublicTicketToken,
  verifyPublicTicketToken,
} from "../lib/publicTicketToken";

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

const OPEN_INTERNAL_STATUS_EXCLUDE = new Set([
  "closed",
  "resolved",
  "spam",
  "duplicate",
  "not_a_bug",
]);

router.get("/support/wallboard", async (req, res): Promise<void> => {
  const org = await getErideOrganisation();
  if (!org) {
    req.log.error({ orgCode: ERIDE_ORG_CODE }, "Eride organisation not found");
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }

  const products = await db
    .select({
      id: supportProductsTable.id,
      productName: supportProductsTable.productName,
      productCode: supportProductsTable.productCode,
    })
    .from(supportProductsTable)
    .where(
      and(
        eq(supportProductsTable.organisationId, org.id),
        eq(supportProductsTable.isActive, true),
      ),
    )
    .orderBy(supportProductsTable.productName);

  const rows = await db
    .select({
      id: supportTicketsTable.id,
      ticketReference: supportTicketsTable.ticketReference,
      productId: supportTicketsTable.productId,
      productName: supportProductsTable.productName,
      productCode: supportProductsTable.productCode,
      issueSummary: supportTicketsTable.issueSummary,
      priority: supportTicketsTable.priority,
      severity: supportTicketsTable.severity,
      publicStatus: supportTicketsTable.publicStatus,
      internalStatus: supportTicketsTable.internalStatus,
      reporterType: supportTicketsTable.reporterType,
      createdAt: supportTicketsTable.createdAt,
      updatedAt: supportTicketsTable.updatedAt,
      resolvedAt: supportTicketsTable.resolvedAt,
      closedAt: supportTicketsTable.closedAt,
    })
    .from(supportTicketsTable)
    .innerJoin(
      supportProductsTable,
      eq(supportProductsTable.id, supportTicketsTable.productId),
    )
    .where(eq(supportTicketsTable.organisationId, org.id))
    .orderBy(desc(supportTicketsTable.createdAt));

  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);

  const isOpen = (s: string): boolean =>
    !OPEN_INTERNAL_STATUS_EXCLUDE.has(s);
  const isAwaitingTriage = (s: string): boolean =>
    s === "triage_required" || s === "new";
  const isToday = (d: Date | null): boolean =>
    d != null && d.getTime() >= startOfTodayUtc.getTime();

  const summary = {
    totalOpenTickets: 0,
    urgentTickets: 0,
    highPriorityTickets: 0,
    awaitingTriage: 0,
    needsUserInfo: 0,
    engineeringEscalationRequired: 0,
    inEngineering: 0,
    inQaVerification: 0,
    fixedWaitingUserNotification: 0,
    slaBreachedPlaceholder: 0,
    closedToday: 0,
    resolvedToday: 0,
  };

  const productAgg = new Map<
    string,
    {
      productId: string;
      productName: string;
      productCode: string;
      openTickets: number;
      urgentTickets: number;
      highPriorityTickets: number;
      awaitingTriage: number;
      resolvedToday: number;
    }
  >();
  for (const p of products) {
    productAgg.set(p.id, {
      productId: p.id,
      productName: p.productName,
      productCode: p.productCode,
      openTickets: 0,
      urgentTickets: 0,
      highPriorityTickets: 0,
      awaitingTriage: 0,
      resolvedToday: 0,
    });
  }

  for (const t of rows) {
    const open = isOpen(t.internalStatus);
    if (open) {
      summary.totalOpenTickets++;
      if (t.priority === "urgent") summary.urgentTickets++;
      if (t.priority === "high") summary.highPriorityTickets++;
    }
    if (isAwaitingTriage(t.internalStatus)) summary.awaitingTriage++;
    if (t.internalStatus === "needs_user_info") summary.needsUserInfo++;
    if (t.internalStatus === "engineering_escalation_required")
      summary.engineeringEscalationRequired++;
    if (t.internalStatus === "in_engineering") summary.inEngineering++;
    if (t.internalStatus === "in_qa_verification") summary.inQaVerification++;
    if (t.internalStatus === "fixed_waiting_user_notification")
      summary.fixedWaitingUserNotification++;
    if (isToday(t.closedAt)) summary.closedToday++;
    if (isToday(t.resolvedAt)) summary.resolvedToday++;

    const agg = productAgg.get(t.productId);
    if (agg) {
      if (open) {
        agg.openTickets++;
        if (t.priority === "urgent") agg.urgentTickets++;
        if (t.priority === "high") agg.highPriorityTickets++;
      }
      if (isAwaitingTriage(t.internalStatus)) agg.awaitingTriage++;
      if (isToday(t.resolvedAt)) agg.resolvedToday++;
    }
  }

  const toWallboardTicket = (t: (typeof rows)[number]) => ({
    id: t.id,
    ticketReference: t.ticketReference,
    productName: t.productName,
    productCode: t.productCode,
    issueSummary: t.issueSummary,
    priority: t.priority,
    severity: t.severity,
    publicStatus: t.publicStatus,
    internalStatus: t.internalStatus,
    reporterType: t.reporterType,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  });

  const urgentHighTickets = rows
    .filter(
      (t) =>
        (t.priority === "urgent" || t.priority === "high") &&
        isOpen(t.internalStatus),
    )
    .slice(0, 10)
    .map(toWallboardTicket);

  const awaitingTriageTickets = rows
    .filter((t) => isAwaitingTriage(t.internalStatus))
    .slice(0, 10)
    .map(toWallboardTicket);

  const waitingUserNotificationTickets = rows
    .filter((t) => t.internalStatus === "fixed_waiting_user_notification")
    .slice(0, 10)
    .map(toWallboardTicket);

  res.json({
    summary,
    productBreakdown: Array.from(productAgg.values()),
    urgentHighTickets,
    awaitingTriageTickets,
    waitingUserNotificationTickets,
    lastUpdated: new Date().toISOString(),
  });
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

  // Fire-and-forget: attempt to send a "ticket received" email.
  // Never block ticket creation on email outcome.
  sendTicketReceivedEmailIfPossible(ticket, product.productName).catch(
    (err) => {
      req.log.warn({ err }, "Failed to send ticket_received email");
    },
  );

  res.status(201).json({
    id: ticket.id,
    ticketReference: ticket.ticketReference,
    publicStatus: ticket.publicStatus,
    productName: product.productName,
    createdAt: ticket.createdAt.toISOString(),
  });
});

type DetailRow = {
  ticket: SupportTicket;
  productName: string;
  productCode: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadErideTicket(id: string): Promise<DetailRow | null> {
  if (!UUID_RE.test(id)) return null;
  const org = await getErideOrganisation();
  if (!org) return null;

  const row = await db
    .select({
      ticket: supportTicketsTable,
      productName: supportProductsTable.productName,
      productCode: supportProductsTable.productCode,
    })
    .from(supportTicketsTable)
    .innerJoin(
      supportProductsTable,
      eq(supportProductsTable.id, supportTicketsTable.productId),
    )
    .where(
      and(
        eq(supportTicketsTable.id, id),
        eq(supportTicketsTable.organisationId, org.id),
      ),
    )
    .limit(1);

  return row[0] ?? null;
}

function serializeTicketDetail(row: DetailRow) {
  const t = row.ticket;
  return {
    id: t.id,
    ticketReference: t.ticketReference,
    productId: t.productId,
    productName: row.productName,
    productCode: row.productCode,
    category: t.category,
    publicStatus: t.publicStatus,
    internalStatus: t.internalStatus,
    priority: t.priority,
    severity: t.severity,
    source: t.source,
    environment: t.environment,
    reporterType: t.reporterType,
    reporterName: t.reporterName,
    reporterEmail: t.reporterEmail,
    reporterWhatsapp: t.reporterWhatsapp,
    userId: t.userId,
    companyId: t.companyId,
    firmId: t.firmId,
    partnerId: t.partnerId,
    applicationReference: t.applicationReference,
    accountReference: t.accountReference,
    pageOrStep: t.pageOrStep,
    issueSummary: t.issueSummary,
    whatWereYouTryingToDo: t.whatWereYouTryingToDo,
    whatWentWrong: t.whatWentWrong,
    assignedSupportUserId: t.assignedSupportUserId,
    assignedProductOwnerId: t.assignedProductOwnerId,
    assignedDeveloperId: t.assignedDeveloperId,
    assignedQaVerifierId: t.assignedQaVerifierId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
  };
}

router.get("/support/tickets/:id", async (req, res): Promise<void> => {
  const row = await loadErideTicket(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json(serializeTicketDetail(row));
});

router.patch("/support/tickets/:id", async (req, res): Promise<void> => {
  const parsed = UpdateSupportTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update" });
    return;
  }
  const body = parsed.data;

  const existing = await loadErideTicket(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { changedByName, changeReason, ...rawUpdates } = body;
  const updates: Partial<typeof supportTicketsTable.$inferInsert> = {};
  for (const [k, v] of Object.entries(rawUpdates)) {
    if (v !== undefined) {
      (updates as Record<string, unknown>)[k] = v;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.json(serializeTicketDetail(existing));
    return;
  }

  updates.updatedAt = new Date();
  const isResolved = (s: unknown) => s === "resolved";
  const isClosed = (s: unknown) => s === "closed";
  const wasResolved =
    isResolved(existing.ticket.publicStatus) ||
    isResolved(existing.ticket.internalStatus);
  const wasClosed =
    isClosed(existing.ticket.publicStatus) ||
    isClosed(existing.ticket.internalStatus);
  const nowResolved =
    isResolved(updates.publicStatus ?? existing.ticket.publicStatus) ||
    isResolved(updates.internalStatus ?? existing.ticket.internalStatus);
  const nowClosed =
    isClosed(updates.publicStatus ?? existing.ticket.publicStatus) ||
    isClosed(updates.internalStatus ?? existing.ticket.internalStatus);
  if (nowResolved && !wasResolved && !existing.ticket.resolvedAt) {
    updates.resolvedAt = new Date();
  }
  if (nowClosed && !wasClosed && !existing.ticket.closedAt) {
    updates.closedAt = new Date();
  }

  const [updated] = await db
    .update(supportTicketsTable)
    .set(updates)
    .where(eq(supportTicketsTable.id, existing.ticket.id))
    .returning();

  if (!updated) {
    res.status(500).json({ error: "Could not update ticket" });
    return;
  }

  const publicChanged =
    updates.publicStatus !== undefined &&
    updates.publicStatus !== existing.ticket.publicStatus;
  const internalChanged =
    updates.internalStatus !== undefined &&
    updates.internalStatus !== existing.ticket.internalStatus;

  if (publicChanged || internalChanged) {
    await db.insert(supportTicketStatusHistoryTable).values({
      supportTicketId: existing.ticket.id,
      oldPublicStatus: publicChanged ? existing.ticket.publicStatus : null,
      newPublicStatus: publicChanged ? updated.publicStatus : null,
      oldInternalStatus: internalChanged ? existing.ticket.internalStatus : null,
      newInternalStatus: internalChanged ? updated.internalStatus : null,
      changedByName: changedByName ?? null,
      changeReason: changeReason ?? null,
    });
  }

  res.json(
    serializeTicketDetail({
      ticket: updated,
      productName: existing.productName,
      productCode: existing.productCode,
    }),
  );
});

type WorkflowAction =
  | "start_review"
  | "request_more_info"
  | "escalate_to_engineering"
  | "mark_in_engineering"
  | "send_to_qa"
  | "mark_fixed_waiting_notification"
  | "mark_user_notified"
  | "resolve_ticket"
  | "close_ticket"
  | "reopen_ticket"
  | "mark_duplicate"
  | "mark_not_a_bug"
  | "defer_ticket"
  | "mark_spam";

const WORKFLOW_ACTION_MAP: Record<
  WorkflowAction,
  {
    publicStatus: SupportTicket["publicStatus"];
    internalStatus: SupportTicket["internalStatus"];
  }
> = {
  start_review: { publicStatus: "under_review", internalStatus: "support_review" },
  request_more_info: {
    publicStatus: "more_info_needed",
    internalStatus: "needs_user_info",
  },
  escalate_to_engineering: {
    publicStatus: "being_fixed",
    internalStatus: "engineering_escalation_required",
  },
  mark_in_engineering: {
    publicStatus: "being_fixed",
    internalStatus: "in_engineering",
  },
  send_to_qa: { publicStatus: "being_fixed", internalStatus: "in_qa_verification" },
  mark_fixed_waiting_notification: {
    publicStatus: "fixed",
    internalStatus: "fixed_waiting_user_notification",
  },
  mark_user_notified: { publicStatus: "fixed", internalStatus: "user_notified" },
  resolve_ticket: { publicStatus: "resolved", internalStatus: "resolved" },
  close_ticket: { publicStatus: "closed", internalStatus: "closed" },
  reopen_ticket: { publicStatus: "under_review", internalStatus: "support_review" },
  mark_duplicate: { publicStatus: "closed", internalStatus: "duplicate" },
  mark_not_a_bug: { publicStatus: "resolved", internalStatus: "not_a_bug" },
  defer_ticket: { publicStatus: "under_review", internalStatus: "deferred" },
  mark_spam: { publicStatus: "closed", internalStatus: "spam" },
};

const CLOSED_INTERNAL_STATUSES = new Set(["closed", "duplicate", "spam"]);
const RESOLVED_INTERNAL_STATUSES = new Set(["resolved"]);

router.post(
  "/support/tickets/:id/workflow-action",
  async (req, res): Promise<void> => {
    const parsed = ApplySupportTicketWorkflowActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid workflow action" });
      return;
    }
    const { action, changedByName, reason } = parsed.data;
    const mapping = WORKFLOW_ACTION_MAP[action as WorkflowAction];
    if (!mapping) {
      res.status(400).json({ error: "Unknown workflow action" });
      return;
    }

    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const t = existing.ticket;

    const updates: Partial<typeof supportTicketsTable.$inferInsert> = {
      publicStatus: mapping.publicStatus,
      internalStatus: mapping.internalStatus,
      updatedAt: new Date(),
    };

    const becomesClosed =
      mapping.publicStatus === "closed" ||
      CLOSED_INTERNAL_STATUSES.has(mapping.internalStatus);
    const becomesResolved =
      mapping.publicStatus === "resolved" ||
      RESOLVED_INTERNAL_STATUSES.has(mapping.internalStatus);

    if (action === "reopen_ticket") {
      updates.closedAt = null;
    } else {
      if (becomesClosed && !t.closedAt) updates.closedAt = new Date();
      if (becomesResolved && !t.resolvedAt) updates.resolvedAt = new Date();
    }

    const [updated] = await db
      .update(supportTicketsTable)
      .set(updates)
      .where(eq(supportTicketsTable.id, t.id))
      .returning();

    if (!updated) {
      res.status(500).json({ error: "Could not update ticket" });
      return;
    }

    const publicChanged = updated.publicStatus !== t.publicStatus;
    const internalChanged = updated.internalStatus !== t.internalStatus;

    // Per spec: every workflow action must write a history row, even if the
    // action re-applies the current status. Always record the action.
    await db.insert(supportTicketStatusHistoryTable).values({
      supportTicketId: t.id,
      oldPublicStatus: publicChanged ? t.publicStatus : null,
      newPublicStatus: publicChanged ? updated.publicStatus : null,
      oldInternalStatus: internalChanged ? t.internalStatus : null,
      newInternalStatus: internalChanged ? updated.internalStatus : null,
      changedByName: changedByName?.trim() || null,
      changeReason:
        reason?.trim() ? `[${action}] ${reason.trim()}` : `[${action}]`,
    });

    res.json(
      serializeTicketDetail({
        ticket: updated,
        productName: existing.productName,
        productCode: existing.productCode,
      }),
    );
  },
);

function serializeLinearLink(
  l: typeof supportTicketLinearLinksTable.$inferSelect,
) {
  return {
    id: l.id,
    supportTicketId: l.supportTicketId,
    linearIssueId: l.linearIssueId,
    linearIssueKey: l.linearIssueKey,
    linearIssueUrl: l.linearIssueUrl,
    linearTeamKey: l.linearTeamKey,
    linearStatus: l.linearStatus,
    createdByName: l.createdByName,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    lastSyncedAt: l.lastSyncedAt ? l.lastSyncedAt.toISOString() : null,
  };
}

router.get(
  "/support/tickets/:id/linear-link",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const [link] = await db
      .select()
      .from(supportTicketLinearLinksTable)
      .where(
        eq(supportTicketLinearLinksTable.supportTicketId, existing.ticket.id),
      )
      .limit(1);
    res.json(link ? serializeLinearLink(link) : null);
  },
);

router.post(
  "/support/tickets/:id/linear-link",
  async (req, res): Promise<void> => {
    const parsed = UpsertSupportTicketLinearLinkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Linear link" });
      return;
    }
    const body = parsed.data;
    if (!body.linearIssueKey.trim()) {
      res.status(400).json({ error: "Linear issue key is required" });
      return;
    }
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const values = {
      linearIssueId: body.linearIssueId?.trim() || null,
      linearIssueKey: body.linearIssueKey.trim(),
      linearIssueUrl: body.linearIssueUrl?.trim() || null,
      linearTeamKey: body.linearTeamKey?.trim() || null,
      linearStatus: body.linearStatus?.trim() || null,
      createdByName: body.createdByName?.trim() || null,
    };

    const [saved] = await db
      .insert(supportTicketLinearLinksTable)
      .values({
        supportTicketId: existing.ticket.id,
        ...values,
      })
      .onConflictDoUpdate({
        target: supportTicketLinearLinksTable.supportTicketId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    if (!saved) {
      res.status(500).json({ error: "Could not save Linear link" });
      return;
    }
    res.json(serializeLinearLink(saved));
  },
);

function serializeSentryLink(
  l: typeof supportTicketSentryLinksTable.$inferSelect,
) {
  return {
    id: l.id,
    supportTicketId: l.supportTicketId,
    sentryIssueId: l.sentryIssueId,
    sentryEventId: l.sentryEventId,
    sentryProject: l.sentryProject,
    sentryUrl: l.sentryUrl,
    environment: l.environment,
    createdByName: l.createdByName,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

router.get(
  "/support/tickets/:id/sentry-links",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const rows = await db
      .select()
      .from(supportTicketSentryLinksTable)
      .where(
        eq(supportTicketSentryLinksTable.supportTicketId, existing.ticket.id),
      )
      .orderBy(desc(supportTicketSentryLinksTable.createdAt));
    res.json(rows.map(serializeSentryLink));
  },
);

router.post(
  "/support/tickets/:id/sentry-links",
  async (req, res): Promise<void> => {
    const parsed = CreateSupportTicketSentryLinkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Sentry link" });
      return;
    }
    const body = parsed.data;
    const issueId = body.sentryIssueId?.trim() || null;
    const eventId = body.sentryEventId?.trim() || null;
    const url = body.sentryUrl?.trim() || null;
    if (!issueId && !eventId && !url) {
      res.status(400).json({
        error:
          "At least one of sentryIssueId, sentryEventId, or sentryUrl is required",
      });
      return;
    }
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const [saved] = await db
      .insert(supportTicketSentryLinksTable)
      .values({
        supportTicketId: existing.ticket.id,
        sentryIssueId: issueId,
        sentryEventId: eventId,
        sentryProject: body.sentryProject?.trim() || null,
        sentryUrl: url,
        environment: body.environment?.trim() || null,
        createdByName: body.createdByName?.trim() || null,
      })
      .returning();
    if (!saved) {
      res.status(500).json({ error: "Could not save Sentry link" });
      return;
    }
    res.json(serializeSentryLink(saved));
  },
);

router.delete(
  "/support/tickets/:id/sentry-links/:sentryLinkId",
  async (req, res): Promise<void> => {
    const sentryLinkId = req.params.sentryLinkId;
    if (!UUID_RE.test(sentryLinkId)) {
      res.status(404).json({ error: "Sentry link not found" });
      return;
    }
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const [link] = await db
      .select()
      .from(supportTicketSentryLinksTable)
      .where(
        and(
          eq(supportTicketSentryLinksTable.id, sentryLinkId),
          eq(supportTicketSentryLinksTable.supportTicketId, existing.ticket.id),
        ),
      )
      .limit(1);
    if (!link) {
      res.status(404).json({ error: "Sentry link not found" });
      return;
    }
    await db
      .delete(supportTicketSentryLinksTable)
      .where(eq(supportTicketSentryLinksTable.id, sentryLinkId));
    res.status(204).end();
  },
);

// SMOKE TEST ENDPOINT — Step 10. WARNING: disable or remove after verifying
// Sentry capture in production. Only throws when NODE_ENV !== "production"
// or ENABLE_SENTRY_TEST_ENDPOINT === "true".
router.get("/_sentry-test", (_req, res): void => {
  const enabled =
    process.env["NODE_ENV"] !== "production" ||
    process.env["ENABLE_SENTRY_TEST_ENDPOINT"] === "true";
  if (!enabled) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  Sentry.setTag("route", "/_sentry-test");
  throw new Error("Sentry smoke test error — safe to ignore");
});

router.delete(
  "/support/tickets/:id/linear-link",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    await db
      .delete(supportTicketLinearLinksTable)
      .where(
        eq(supportTicketLinearLinksTable.supportTicketId, existing.ticket.id),
      );
    res.status(204).end();
  },
);

router.get("/support/tickets/:id/notes", async (req, res): Promise<void> => {
  const existing = await loadErideTicket(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const notes = await db
    .select()
    .from(supportTicketInternalNotesTable)
    .where(eq(supportTicketInternalNotesTable.supportTicketId, existing.ticket.id))
    .orderBy(desc(supportTicketInternalNotesTable.createdAt));
  res.json(
    notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  );
});

router.post("/support/tickets/:id/notes", async (req, res): Promise<void> => {
  const parsed = CreateSupportTicketNoteBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.note.trim()) {
    res.status(400).json({ error: "Note is required" });
    return;
  }

  const existing = await loadErideTicket(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const [note] = await db
    .insert(supportTicketInternalNotesTable)
    .values({
      supportTicketId: existing.ticket.id,
      note: parsed.data.note.trim(),
      createdByName: parsed.data.createdByName?.trim() || null,
    })
    .returning();

  if (!note) {
    res.status(500).json({ error: "Could not save note" });
    return;
  }

  res.status(201).json({ ...note, createdAt: note.createdAt.toISOString() });
});

router.get(
  "/support/tickets/:id/status-history",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const rows = await db
      .select()
      .from(supportTicketStatusHistoryTable)
      .where(
        eq(supportTicketStatusHistoryTable.supportTicketId, existing.ticket.id),
      )
      .orderBy(desc(supportTicketStatusHistoryTable.createdAt));
    res.json(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    );
  },
);

// ─── Messages ───────────────────────────────────────────────────────────────

function serializeMessage(m: SupportTicketMessage) {
  return { ...m, createdAt: m.createdAt.toISOString() };
}

router.get(
  "/support/tickets/:id/messages",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const rows = await db
      .select()
      .from(supportTicketMessagesTable)
      .where(
        eq(supportTicketMessagesTable.supportTicketId, existing.ticket.id),
      )
      .orderBy(desc(supportTicketMessagesTable.createdAt));
    res.json(rows.map(serializeMessage));
  },
);

router.post(
  "/support/tickets/:id/messages",
  async (req, res): Promise<void> => {
    const parsed = CreateSupportTicketMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid message" });
      return;
    }
    const data = parsed.data;
    if (!data.messageBody.trim()) {
      res.status(400).json({ error: "Message body is required" });
      return;
    }

    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const [row] = await db
      .insert(supportTicketMessagesTable)
      .values({
        supportTicketId: existing.ticket.id,
        direction: data.direction,
        channel: data.channel,
        messageType: data.messageType,
        senderName: data.senderName?.trim() || null,
        senderRole: data.senderRole?.trim() || null,
        recipientName: data.recipientName?.trim() || null,
        recipientEmail: data.recipientEmail?.trim() || null,
        recipientWhatsapp: data.recipientWhatsapp?.trim() || null,
        messageBody: data.messageBody.trim(),
        deliveryStatus: data.deliveryStatus,
        relatedPublicStatus: data.relatedPublicStatus ?? null,
        relatedInternalStatus: data.relatedInternalStatus ?? null,
      })
      .returning();

    if (!row) {
      res.status(500).json({ error: "Could not save message" });
      return;
    }
    res.status(201).json(serializeMessage(row));
  },
);

// ─── Email sending ──────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isTemplateKey(v: string): v is SupportEmailTemplateKey {
  return (SUPPORT_EMAIL_TEMPLATE_KEYS as readonly string[]).includes(v);
}

async function insertPendingOutboundEmail(opts: {
  ticketId: string;
  publicStatus: SupportTicket["publicStatus"];
  internalStatus: SupportTicket["internalStatus"];
  messageType: SupportTicketMessage["messageType"];
  senderName: string;
  recipientName: string | null;
  recipientEmail: string;
  recipientWhatsapp: string | null;
  messageBody: string;
}) {
  const [row] = await db
    .insert(supportTicketMessagesTable)
    .values({
      supportTicketId: opts.ticketId,
      direction: "outbound",
      channel: "email",
      messageType: opts.messageType,
      senderName: opts.senderName,
      senderRole: "support",
      recipientName: opts.recipientName,
      recipientEmail: opts.recipientEmail,
      recipientWhatsapp: opts.recipientWhatsapp,
      messageBody: opts.messageBody,
      deliveryStatus: "drafted",
      relatedPublicStatus: opts.publicStatus,
      relatedInternalStatus: opts.internalStatus,
      providerMessageId: null,
      errorMessage: null,
    })
    .returning();
  return row ?? null;
}

async function finalizeOutboundEmail(
  id: string,
  patch: {
    deliveryStatus: SupportTicketMessage["deliveryStatus"];
    providerMessageId: string | null;
    errorMessage: string | null;
  },
) {
  const [row] = await db
    .update(supportTicketMessagesTable)
    .set(patch)
    .where(eq(supportTicketMessagesTable.id, id))
    .returning();
  return row ?? null;
}

function deliveryStatusFor(sendResult: {
  success: boolean;
  disabled: boolean;
}): SupportTicketMessage["deliveryStatus"] {
  if (sendResult.disabled) return "drafted";
  if (sendResult.success) return "sent_manual";
  return "failed";
}

export async function sendTicketReceivedEmailIfPossible(
  ticket: SupportTicket,
  productName: string,
): Promise<void> {
  const recipient = ticket.reporterEmail?.trim();
  if (!recipient || !EMAIL_RE.test(recipient)) return;

  const rendered = renderSupportEmailTemplate("ticket_received", {
    ticket,
    productName,
  });

  // Always create the audit row first so we never send without a record.
  let pending: SupportTicketMessage | null = null;
  try {
    pending = await insertPendingOutboundEmail({
      ticketId: ticket.id,
      publicStatus: ticket.publicStatus,
      internalStatus: ticket.internalStatus,
      messageType: "ticket_received",
      senderName: "Eride Support",
      recipientName: ticket.reporterName ?? null,
      recipientEmail: recipient,
      recipientWhatsapp: ticket.reporterWhatsapp ?? null,
      messageBody: rendered.text,
    });
  } catch (err) {
    Sentry.captureException(err);
    return; // refuse to send without an audit row
  }
  if (!pending) return;

  const sendResult = await sendSupportEmail({
    to: recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  try {
    await finalizeOutboundEmail(pending.id, {
      deliveryStatus: deliveryStatusFor(sendResult),
      providerMessageId: sendResult.providerMessageId ?? null,
      errorMessage: sendResult.errorMessage ?? null,
    });
  } catch (err) {
    Sentry.captureException(err);
  }
}

router.post(
  "/support/tickets/:id/send-email",
  async (req, res): Promise<void> => {
    const parsed = SendSupportTicketEmailBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email send request" });
      return;
    }
    const data = parsed.data;

    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const t = existing.ticket;

    const recipient = (data.to?.trim() || t.reporterEmail?.trim() || "")
      .trim();
    if (!recipient) {
      res.status(400).json({
        error: "No recipient email address available for this ticket.",
      });
      return;
    }
    if (!EMAIL_RE.test(recipient)) {
      res.status(400).json({ error: "Recipient email address is not valid." });
      return;
    }

    const sendMode = data.sendMode ?? "template";
    let subject: string;
    let text: string;
    let html: string;
    const messageType = data.messageType;

    if (sendMode === "custom" || messageType === "custom") {
      const customSubject = data.subject?.trim();
      const customBody = data.bodyText?.trim();
      if (!customSubject || !customBody) {
        res.status(400).json({
          error: "Custom emails require a subject and a message body.",
        });
        return;
      }
      subject = customSubject;
      text = customBody;
      // Always render custom HTML server-side from bodyText so escaping,
      // ticket-context header, and footer warning are always applied.
      html = renderCustomEmailHtml({
        ticketReference: t.ticketReference,
        productName: existing.productName,
        publicStatus: t.publicStatus,
        reporterName: t.reporterName ?? null,
        bodyText: customBody,
      });
    } else {
      if (!isTemplateKey(messageType)) {
        res.status(400).json({
          error: `Template emails are not supported for messageType "${messageType}".`,
        });
        return;
      }
      const rendered = renderSupportEmailTemplate(messageType, {
        ticket: t,
        productName: existing.productName,
      });
      subject = rendered.subject;
      text = rendered.text;
      html = rendered.html;
    }

    const senderName = data.senderName?.trim() || "Eride Support";

    // 1) Create the audit row up front (delivery_status=drafted) so we
    //    never call the provider without a recorded row to update.
    const pending = await insertPendingOutboundEmail({
      ticketId: t.id,
      publicStatus: t.publicStatus,
      internalStatus: t.internalStatus,
      messageType,
      senderName,
      recipientName: t.reporterName ?? null,
      recipientEmail: recipient,
      recipientWhatsapp: t.reporterWhatsapp ?? null,
      messageBody: text,
    });
    if (!pending) {
      res.status(500).json({ error: "Could not record outbound email." });
      return;
    }

    // 2) Send via provider (or skip when disabled).
    const sendResult = await sendSupportEmail({
      to: recipient,
      subject,
      html,
      text,
    });
    const deliveryStatus = deliveryStatusFor(sendResult);

    // 3) Update the audit row with the outcome. If this update fails,
    //    we still keep the drafted row but surface a 500 so callers retry.
    let finalRow: SupportTicketMessage | null;
    try {
      finalRow = await finalizeOutboundEmail(pending.id, {
        deliveryStatus,
        providerMessageId: sendResult.providerMessageId ?? null,
        errorMessage: sendResult.errorMessage ?? null,
      });
    } catch (err) {
      req.log.error(
        { err, messageId: pending.id },
        "Failed to finalize outbound email row",
      );
      res.status(500).json({
        error:
          "Email send completed but the audit row could not be updated. Please refresh.",
      });
      return;
    }

    const row = finalRow ?? pending;
    res.json({
      success: sendResult.success,
      disabled: sendResult.disabled,
      deliveryStatus,
      providerMessageId: sendResult.providerMessageId ?? null,
      errorMessage: sendResult.errorMessage ?? null,
      message: serializeMessage(row),
    });
  },
);

// silence unused-import warnings if email helper is never directly hit
void isSupportEmailEnabled;

// ─── Attachments ────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
});

void ensureStorageReady().catch(() => {
  /* will retry per-upload */
});

function attachmentViewUrl(
  ticketId: string,
  attachmentId: string,
): string {
  return `/api/support/tickets/${ticketId}/attachments/${attachmentId}`;
}

function serializeAttachment(a: SupportTicketAttachment) {
  return {
    id: a.id,
    supportTicketId: a.supportTicketId,
    fileName: a.fileName,
    originalFileName: a.originalFileName,
    fileType: a.fileType,
    mimeType: a.mimeType,
    fileSize: a.fileSize,
    uploadedByName: a.uploadedByName,
    uploadedByEmail: a.uploadedByEmail,
    uploadedByRole: a.uploadedByRole,
    createdAt: a.createdAt.toISOString(),
    viewUrl: attachmentViewUrl(a.supportTicketId, a.id),
  };
}

router.get(
  "/support/tickets/:id/attachments",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const rows = await db
      .select()
      .from(supportTicketAttachmentsTable)
      .where(
        eq(supportTicketAttachmentsTable.supportTicketId, existing.ticket.id),
      )
      .orderBy(desc(supportTicketAttachmentsTable.createdAt));
    res.json(rows.map(serializeAttachment));
  },
);

router.post(
  "/support/tickets/:id/attachments",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const ticketId = String(req.params.id ?? "");
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error:
          "No file accepted. Use PNG, JPG, WEBP, PDF, MP4, or MOV under the size limit.",
      });
      return;
    }
    const validation = validateAttachment({
      mimeType: file.mimetype,
      originalFileName: file.originalname,
      size: file.size,
    });
    if (!validation.ok) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    const contentCheck = validateAttachmentContent({
      declaredMimeType: validation.allowed.mimeType,
      buffer: file.buffer,
    });
    if (!contentCheck.ok) {
      res.status(400).json({ error: contentCheck.reason });
      return;
    }

    const existing = await loadErideTicket(ticketId);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    await ensureStorageReady();
    const stored = await buildStoragePath(
      existing.ticket.id,
      validation.allowed.extension,
    );

    const body = (req.body ?? {}) as Record<string, unknown>;
    const trimmed = (k: string): string | null => {
      const v = body[k];
      if (typeof v !== "string") return null;
      const t = v.trim();
      return t.length === 0 ? null : t.slice(0, 200);
    };

    let wroteFile = false;
    try {
      await writeFile(stored.storagePath, file.buffer);
      wroteFile = true;

      const [row] = await db
        .insert(supportTicketAttachmentsTable)
        .values({
          supportTicketId: existing.ticket.id,
          fileName: stored.fileName,
          originalFileName: file.originalname.slice(0, 255),
          fileType: validation.allowed.fileType,
          mimeType: validation.allowed.mimeType,
          fileSize: file.size,
          storagePath: stored.storagePath,
          uploadedByName: trimmed("uploadedByName"),
          uploadedByEmail: trimmed("uploadedByEmail"),
          uploadedByRole: trimmed("uploadedByRole"),
        })
        .returning();

      if (!row) {
        await removeStored(stored.storagePath);
        res.status(500).json({ error: "Could not save attachment" });
        return;
      }

      res.status(201).json(serializeAttachment(row));
    } catch (err) {
      if (wroteFile) await removeStored(stored.storagePath);
      req.log.error({ err }, "Failed to save attachment");
      res.status(500).json({ error: "Could not save attachment" });
    }
  },
);

router.get(
  "/support/tickets/:id/attachments/:attachmentId",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const attachmentId = req.params.attachmentId;
    if (!UUID_RE.test(attachmentId)) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    const att = await db.query.supportTicketAttachmentsTable.findFirst({
      where: and(
        eq(supportTicketAttachmentsTable.id, attachmentId),
        eq(supportTicketAttachmentsTable.supportTicketId, existing.ticket.id),
      ),
    });
    if (!att) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    const stat = await statStored(att.storagePath);
    if (!stat) {
      res.status(404).json({ error: "Attachment file missing" });
      return;
    }
    res.setHeader("Content-Type", att.mimeType);
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Cache-Control", "private, max-age=300");
    const disposition = req.query["download"] === "1" ? "attachment" : "inline";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${att.originalFileName.replace(/"/g, "")}"`,
    );
    streamStored(att.storagePath).on("error", () => res.end()).pipe(res);
  },
);

router.delete(
  "/support/tickets/:id/attachments/:attachmentId",
  async (req, res): Promise<void> => {
    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const attachmentId = req.params.attachmentId;
    if (!UUID_RE.test(attachmentId)) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    const att = await db.query.supportTicketAttachmentsTable.findFirst({
      where: and(
        eq(supportTicketAttachmentsTable.id, attachmentId),
        eq(supportTicketAttachmentsTable.supportTicketId, existing.ticket.id),
      ),
    });
    if (!att) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    await db
      .delete(supportTicketAttachmentsTable)
      .where(eq(supportTicketAttachmentsTable.id, attachmentId));
    await removeStored(att.storagePath);
    res.status(204).end();
  },
);

// ─── Public ticket tracking (token-gated, public-safe fields only) ─────────

const PUBLIC_TICKET_REFERENCE_RE = /^[A-Z0-9_-]{1,64}$/i;

function normaliseEmail(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}
function normaliseWhatsapp(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/[^\d+]/g, "");
}

async function loadEridePublicTicket(
  ticketReference: string,
): Promise<DetailRow | null> {
  if (!PUBLIC_TICKET_REFERENCE_RE.test(ticketReference)) return null;
  const org = await getErideOrganisation();
  if (!org) return null;

  const row = await db
    .select({
      ticket: supportTicketsTable,
      productName: supportProductsTable.productName,
      productCode: supportProductsTable.productCode,
    })
    .from(supportTicketsTable)
    .innerJoin(
      supportProductsTable,
      eq(supportProductsTable.id, supportTicketsTable.productId),
    )
    .where(
      and(
        ilike(supportTicketsTable.ticketReference, ticketReference),
        eq(supportTicketsTable.organisationId, org.id),
      ),
    )
    .limit(1);

  return row[0] ?? null;
}

function getPublicTicketAccessToken(req: import("express").Request): string {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  const q = req.query["token"];
  if (typeof q === "string") return q.trim();
  return "";
}

/** Verifies token AND that the token's ticketId matches the loaded ticket. */
async function authorisedPublicTicket(
  req: import("express").Request,
  ticketReference: string,
): Promise<DetailRow | null> {
  const token = getPublicTicketAccessToken(req);
  if (!token) return null;
  const payload = verifyPublicTicketToken(token);
  if (!payload) return null;
  const row = await loadEridePublicTicket(ticketReference);
  if (!row) return null;
  if (row.ticket.id !== payload.ticketId) return null;
  return row;
}

function serializePublicTicket(row: DetailRow) {
  const t = row.ticket;
  return {
    ticketReference: t.ticketReference,
    productName: row.productName,
    productCode: row.productCode,
    publicStatus: t.publicStatus,
    category: t.category,
    priority: t.priority,
    issueSummary: t.issueSummary,
    pageOrStep: t.pageOrStep,
    reporterName: t.reporterName,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
  };
}

const PUBLIC_MESSAGE_CHANNELS = new Set<SupportTicketMessage["channel"]>([
  "email",
  "whatsapp",
  "phone",
  "in_app",
  "manual",
]);

function serializePublicMessage(m: SupportTicketMessage) {
  return {
    id: m.id,
    direction: m.direction,
    channel: m.channel,
    messageType: m.messageType,
    senderName: m.senderName,
    messageBody: m.messageBody,
    createdAt: m.createdAt.toISOString(),
  };
}

router.post(
  "/support/public/verify-ticket",
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const ticketReference =
      typeof body["ticketReference"] === "string"
        ? body["ticketReference"].trim()
        : "";
    const contactEmail =
      typeof body["contactEmail"] === "string"
        ? body["contactEmail"].trim()
        : "";
    const contactWhatsapp =
      typeof body["contactWhatsapp"] === "string"
        ? body["contactWhatsapp"].trim()
        : "";

    if (!ticketReference) {
      res.status(400).json({
        error: "Please provide a ticket reference.",
      });
      return;
    }
    if (!contactEmail && !contactWhatsapp) {
      res.status(400).json({
        error:
          "Please provide the email or WhatsApp number you used when you submitted this ticket.",
      });
      return;
    }

    const row = await loadEridePublicTicket(ticketReference);
    if (!row) {
      // Do not reveal whether the ticket exists.
      res.json({ success: false });
      return;
    }

    const reporterEmail = normaliseEmail(row.ticket.reporterEmail);
    const reporterWhatsapp = normaliseWhatsapp(row.ticket.reporterWhatsapp);
    const inputEmail = normaliseEmail(contactEmail);
    const inputWhatsapp = normaliseWhatsapp(contactWhatsapp);

    const emailMatch =
      inputEmail.length > 0 && reporterEmail.length > 0 &&
      inputEmail === reporterEmail;
    const whatsappMatch =
      inputWhatsapp.length > 0 && reporterWhatsapp.length > 0 &&
      inputWhatsapp === reporterWhatsapp;

    if (!emailMatch && !whatsappMatch) {
      res.json({ success: false });
      return;
    }

    const { token, expiresAt } = signPublicTicketToken(row.ticket.id);
    res.json({
      success: true,
      ticketReference: row.ticket.ticketReference,
      accessToken: token,
      expiresAt: expiresAt.toISOString(),
    });
  },
);

router.get(
  "/support/public/tickets/:ticketReference",
  async (req, res): Promise<void> => {
    const row = await authorisedPublicTicket(req, String(req.params.ticketReference ?? ""));
    if (!row) {
      res.status(401).json({ error: "Access link expired or invalid." });
      return;
    }
    res.json(serializePublicTicket(row));
  },
);

router.get(
  "/support/public/tickets/:ticketReference/messages",
  async (req, res): Promise<void> => {
    const row = await authorisedPublicTicket(req, String(req.params.ticketReference ?? ""));
    if (!row) {
      res.status(401).json({ error: "Access link expired or invalid." });
      return;
    }
    const messages = await db
      .select()
      .from(supportTicketMessagesTable)
      .where(eq(supportTicketMessagesTable.supportTicketId, row.ticket.id))
      .orderBy(desc(supportTicketMessagesTable.createdAt));

    const visible = messages.filter((m) => {
      if (m.direction === "internal") return false;
      if (!PUBLIC_MESSAGE_CHANNELS.has(m.channel)) return false;
      // Hide drafted/failed outbound messages — user should only see what the
      // team actually sent or what they themselves submitted.
      if (
        m.direction === "outbound" &&
        m.deliveryStatus !== "sent_manual" &&
        m.deliveryStatus !== "received"
      ) {
        return false;
      }
      return true;
    });

    res.json(visible.map(serializePublicMessage));
  },
);

router.post(
  "/support/public/tickets/:ticketReference/reply",
  async (req, res): Promise<void> => {
    const row = await authorisedPublicTicket(req, String(req.params.ticketReference ?? ""));
    if (!row) {
      res.status(401).json({ error: "Access link expired or invalid." });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const messageBody =
      typeof body["messageBody"] === "string" ? body["messageBody"].trim() : "";
    const contactName =
      typeof body["contactName"] === "string"
        ? body["contactName"].trim().slice(0, 200)
        : "";
    if (!messageBody) {
      res.status(400).json({ error: "Please write a message." });
      return;
    }
    if (messageBody.length > 10000) {
      res.status(400).json({ error: "Message is too long." });
      return;
    }

    const senderName =
      contactName.length > 0
        ? contactName
        : (row.ticket.reporterName ?? "Reporter");

    const [inserted] = await db
      .insert(supportTicketMessagesTable)
      .values({
        supportTicketId: row.ticket.id,
        direction: "inbound",
        channel: "in_app",
        messageType: "user_reply",
        deliveryStatus: "received",
        senderName,
        senderRole: "public_user",
        recipientName: "Eride Support",
        messageBody,
        relatedPublicStatus: row.ticket.publicStatus,
        relatedInternalStatus: row.ticket.internalStatus,
      })
      .returning();

    if (!inserted) {
      res.status(500).json({ error: "Could not save your reply." });
      return;
    }

    // Auto-reopen if the ticket was already closed/fixed/resolved.
    const REOPEN_FROM = new Set<SupportTicket["publicStatus"]>([
      "fixed",
      "resolved",
      "closed",
    ]);
    if (REOPEN_FROM.has(row.ticket.publicStatus)) {
      const oldPublic = row.ticket.publicStatus;
      const oldInternal = row.ticket.internalStatus;
      const [updated] = await db
        .update(supportTicketsTable)
        .set({
          publicStatus: "under_review",
          internalStatus: "support_review",
          updatedAt: new Date(),
        })
        .where(eq(supportTicketsTable.id, row.ticket.id))
        .returning();
      if (updated) {
        await db.insert(supportTicketStatusHistoryTable).values({
          supportTicketId: row.ticket.id,
          oldPublicStatus: oldPublic,
          newPublicStatus: "under_review",
          oldInternalStatus: oldInternal,
          newInternalStatus: "support_review",
          changedByName: senderName,
          changeReason: "[public_reply] Reopened by user reply",
        });
      }
    }

    res.status(201).json(serializePublicMessage(inserted));
  },
);

router.post(
  "/support/public/tickets/:ticketReference/attachments",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const row = await authorisedPublicTicket(req, String(req.params.ticketReference ?? ""));
    if (!row) {
      res.status(401).json({ error: "Access link expired or invalid." });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error:
          "No file accepted. Use PNG, JPG, WEBP, PDF, MP4, or MOV under the size limit.",
      });
      return;
    }
    const validation = validateAttachment({
      mimeType: file.mimetype,
      originalFileName: file.originalname,
      size: file.size,
    });
    if (!validation.ok) {
      res.status(400).json({ error: validation.reason });
      return;
    }
    const contentCheck = validateAttachmentContent({
      declaredMimeType: validation.allowed.mimeType,
      buffer: file.buffer,
    });
    if (!contentCheck.ok) {
      res.status(400).json({ error: contentCheck.reason });
      return;
    }

    await ensureStorageReady();
    const stored = await buildStoragePath(
      row.ticket.id,
      validation.allowed.extension,
    );

    let wroteFile = false;
    try {
      await writeFile(stored.storagePath, file.buffer);
      wroteFile = true;

      const [att] = await db
        .insert(supportTicketAttachmentsTable)
        .values({
          supportTicketId: row.ticket.id,
          fileName: stored.fileName,
          originalFileName: file.originalname.slice(0, 255),
          fileType: validation.allowed.fileType,
          mimeType: validation.allowed.mimeType,
          fileSize: file.size,
          storagePath: stored.storagePath,
          uploadedByName: row.ticket.reporterName ?? null,
          uploadedByEmail: row.ticket.reporterEmail || null,
          uploadedByRole: "public_user",
        })
        .returning();

      if (!att) {
        await removeStored(stored.storagePath);
        res.status(500).json({ error: "Could not save attachment" });
        return;
      }

      res.status(201).json({
        id: att.id,
        fileName: att.fileName,
        originalFileName: att.originalFileName,
        fileType: att.fileType,
        mimeType: att.mimeType,
        fileSize: att.fileSize,
        createdAt: att.createdAt.toISOString(),
      });
    } catch (err) {
      if (wroteFile) await removeStored(stored.storagePath);
      req.log.error({ err }, "Failed to save public attachment");
      res.status(500).json({ error: "Could not save attachment" });
    }
  },
);

// Multer error handler (file too large, etc.)
router.use(
  (
    err: Error & { code?: string },
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        error: "File is too large. Videos up to 50MB, PDFs 15MB, images 10MB.",
      });
      return;
    }
    next(err);
  },
);

export default router;
