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
  CreateSupportTicketBody,
  CreateSupportTicketMessageBody,
  CreateSupportTicketNoteBody,
  ListPublicSupportProductsResponse,
  ListSupportTicketsQueryParams,
  UpdateSupportTicketBody,
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
