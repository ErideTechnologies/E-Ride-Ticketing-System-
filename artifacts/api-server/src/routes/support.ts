import { Router, type IRouter } from "express";
import multer from "multer";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
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
  supportMessageTemplatesTable,
  supportSettingsTable,
  type SupportTicket,
  type SupportTicketAttachment,
  type SupportTicketMessage,
  type SupportMessageTemplate,
  type SupportSettings,
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
  UpdateSupportSettingsBody,
  UpdateSupportMessageTemplateBody,
  PreviewSupportMessageTemplateBody,
  ListSupportMessageTemplatesQueryParams,
  CreateSupportTicketLinearIssueBody,
} from "@workspace/api-zod";
import {
  createLinearIssue,
  isLinearEnabled,
  resolveLinearTeamId,
} from "../lib/linearClient";
import { getIntegrationsStatus } from "../lib/integrationStatus";
import * as Sentry from "@sentry/node";
import {
  isSupportEmailEnabled,
  sendSupportEmail,
} from "../lib/supportEmail";
import { getCurrentSupportUser, roleHasPermission } from "../lib/supportAuth";
import { recordSupportAuditLog } from "../lib/supportAudit";
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
import {
  calculateTicketSla,
  ENGINEERING_FIX_STATUSES,
  type SlaResult,
  type SlaStatus,
} from "../lib/sla";
import {
  isSafeTemplateHtml,
  renderTemplateString,
  ALLOWED_TEMPLATE_KEYS,
  ALLOWED_TEMPLATE_CHANNELS,
  type AllowedTemplateKey,
  type AllowedTemplateChannel,
  type TemplateContext,
} from "../lib/templateRender";

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

/**
 * For each ticket id, returns the earliest moment its internal status
 * transitioned into an engineering-fix state. Used as the start anchor for
 * the engineering-fix SLA. Falls back to ticket.createdAt at the call site
 * when no such transition exists yet.
 */
async function loadEngineeringStartedAtMap(
  ticketIds: string[],
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (ticketIds.length === 0) return map;
  const engineeringStatuses = Array.from(ENGINEERING_FIX_STATUSES);
  const rows = await db
    .select({
      supportTicketId: supportTicketStatusHistoryTable.supportTicketId,
      newInternalStatus: supportTicketStatusHistoryTable.newInternalStatus,
      createdAt: supportTicketStatusHistoryTable.createdAt,
    })
    .from(supportTicketStatusHistoryTable)
    .where(
      and(
        inArray(supportTicketStatusHistoryTable.supportTicketId, ticketIds),
        inArray(
          supportTicketStatusHistoryTable.newInternalStatus,
          engineeringStatuses,
        ),
      ),
    );
  for (const r of rows) {
    const existing = map.get(r.supportTicketId);
    if (!existing || r.createdAt.getTime() < existing.getTime()) {
      map.set(r.supportTicketId, r.createdAt);
    }
  }
  return map;
}

function serializeSla(sla: SlaResult) {
  return {
    slaStatus: sla.slaStatus,
    slaPhase: sla.slaPhase,
    slaLabel: sla.slaLabel,
    slaDueAt: sla.slaDueAt,
    slaBreachedAt: sla.slaBreachedAt,
    minutesUntilDue: sla.minutesUntilDue,
    overdueMinutes: sla.overdueMinutes,
    targetMinutes: sla.targetMinutes,
  };
}

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

  const engineeringStartedAtMap = await loadEngineeringStartedAtMap(
    rows.map((r) => r.id),
  );
  const slaByTicketId = new Map<string, SlaResult>();
  const now = new Date();
  for (const t of rows) {
    slaByTicketId.set(
      t.id,
      calculateTicketSla({
        priority: t.priority,
        publicStatus: t.publicStatus,
        internalStatus: t.internalStatus,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        closedAt: t.closedAt,
        engineeringStartedAt: engineeringStartedAtMap.get(t.id) ?? null,
        now,
      }),
    );
  }

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
    slaBreached: 0,
    slaApproachingBreach: 0,
    slaPaused: 0,
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
    const sla = slaByTicketId.get(t.id);
    if (open) {
      summary.totalOpenTickets++;
      if (t.priority === "urgent") summary.urgentTickets++;
      if (t.priority === "high") summary.highPriorityTickets++;
      if (sla?.slaStatus === "breached") summary.slaBreached++;
      if (sla?.slaStatus === "approaching") summary.slaApproachingBreach++;
      if (sla?.slaStatus === "paused") summary.slaPaused++;
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

  const toWallboardTicket = (t: (typeof rows)[number]) => {
    const sla = slaByTicketId.get(t.id);
    return {
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
      sla: serializeSla(
        sla ??
          calculateTicketSla({
            priority: t.priority,
            publicStatus: t.publicStatus,
            internalStatus: t.internalStatus,
            createdAt: t.createdAt,
            resolvedAt: t.resolvedAt,
            closedAt: t.closedAt,
            engineeringStartedAt: null,
            now,
          }),
      ),
    };
  };

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

  const breachedTickets = rows
    .filter(
      (t) =>
        isOpen(t.internalStatus) &&
        slaByTicketId.get(t.id)?.slaStatus === "breached",
    )
    .sort((a, b) => {
      const ad = slaByTicketId.get(a.id)?.slaDueAt ?? "";
      const bd = slaByTicketId.get(b.id)?.slaDueAt ?? "";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    })
    .slice(0, 10)
    .map(toWallboardTicket);

  const approachingBreachTickets = rows
    .filter(
      (t) =>
        isOpen(t.internalStatus) &&
        slaByTicketId.get(t.id)?.slaStatus === "approaching",
    )
    .sort((a, b) => {
      const ad = slaByTicketId.get(a.id)?.minutesUntilDue ?? Number.MAX_SAFE_INTEGER;
      const bd = slaByTicketId.get(b.id)?.minutesUntilDue ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })
    .slice(0, 10)
    .map(toWallboardTicket);

  res.json({
    summary,
    productBreakdown: Array.from(productAgg.values()),
    urgentHighTickets,
    awaitingTriageTickets,
    waitingUserNotificationTickets,
    breachedTickets,
    approachingBreachTickets,
    lastUpdated: new Date().toISOString(),
  });
});

router.get("/support/sla-summary", async (req, res): Promise<void> => {
  const org = await getErideOrganisation();
  if (!org) {
    req.log.error({ orgCode: ERIDE_ORG_CODE }, "Eride organisation not found");
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }

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

  const engineeringStartedAtMap = await loadEngineeringStartedAtMap(
    rows.map((r) => r.id),
  );
  const now = new Date();

  const totals = { breached: 0, approaching: 0, onTrack: 0, paused: 0, completed: 0 };
  type ProdAgg = {
    productId: string;
    productName: string;
    productCode: string;
    breached: number;
    approaching: number;
    onTrack: number;
    paused: number;
  };
  const byProduct = new Map<string, ProdAgg>();
  const priorityOrder: TicketPriority[] = ["urgent", "high", "medium", "low"];
  const byPriority = new Map<
    TicketPriority,
    { priority: TicketPriority; breached: number; approaching: number; onTrack: number; paused: number }
  >();
  for (const p of priorityOrder) {
    byPriority.set(p, { priority: p, breached: 0, approaching: 0, onTrack: 0, paused: 0 });
  }

  type Enriched = (typeof rows)[number] & { sla: SlaResult };
  const enriched: Enriched[] = rows.map((t) => ({
    ...t,
    sla: calculateTicketSla({
      priority: t.priority,
      publicStatus: t.publicStatus,
      internalStatus: t.internalStatus,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      engineeringStartedAt: engineeringStartedAtMap.get(t.id) ?? null,
      now,
    }),
  }));

  for (const t of enriched) {
    if (!byProduct.has(t.productId)) {
      byProduct.set(t.productId, {
        productId: t.productId,
        productName: t.productName,
        productCode: t.productCode,
        breached: 0,
        approaching: 0,
        onTrack: 0,
        paused: 0,
      });
    }
    const prod = byProduct.get(t.productId)!;
    const pri = byPriority.get(t.priority)!;
    switch (t.sla.slaStatus) {
      case "breached":
        totals.breached++;
        prod.breached++;
        pri.breached++;
        break;
      case "approaching":
        totals.approaching++;
        prod.approaching++;
        pri.approaching++;
        break;
      case "on_track":
        totals.onTrack++;
        prod.onTrack++;
        pri.onTrack++;
        break;
      case "paused":
        totals.paused++;
        prod.paused++;
        pri.paused++;
        break;
      case "completed":
        totals.completed++;
        break;
      default:
        break;
    }
  }

  const oldestBreachedTickets = enriched
    .filter((t) => t.sla.slaStatus === "breached")
    .sort((a, b) => (a.sla.slaDueAt! < b.sla.slaDueAt! ? -1 : 1))
    .slice(0, 10)
    .map((t) => ({
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
      sla: serializeSla(t.sla),
    }));

  res.json({
    totals,
    byProduct: Array.from(byProduct.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
    ),
    byPriority: Array.from(byPriority.values()),
    oldestBreachedTickets,
    lastUpdated: now.toISOString(),
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
      resolvedAt: supportTicketsTable.resolvedAt,
      closedAt: supportTicketsTable.closedAt,
    })
    .from(supportTicketsTable)
    .innerJoin(
      supportProductsTable,
      eq(supportProductsTable.id, supportTicketsTable.productId),
    )
    .where(and(...conditions))
    .orderBy(desc(supportTicketsTable.createdAt));

  const engineeringStartedAtMap = await loadEngineeringStartedAtMap(
    rows.map((r) => r.id),
  );
  const now = new Date();

  const slaStatusFilter = parseSlaStatusFilter(rest.slaStatus);
  const overdueOnly = parseBool(rest.overdueOnly);
  const dueSoonOnly = parseBool(rest.dueSoonOnly);

  const enriched = rows.map((r) => {
    const sla = calculateTicketSla({
      priority: r.priority,
      publicStatus: r.publicStatus,
      internalStatus: r.internalStatus,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      closedAt: r.closedAt,
      engineeringStartedAt: engineeringStartedAtMap.get(r.id) ?? null,
      now,
    });
    return { row: r, sla };
  });

  const filtered = enriched.filter(({ sla }) => {
    if (slaStatusFilter && sla.slaStatus !== slaStatusFilter) return false;
    if (overdueOnly && sla.slaStatus !== "breached") return false;
    if (dueSoonOnly && sla.slaStatus !== "approaching") return false;
    return true;
  });

  res.json(
    filtered.map(({ row: r, sla }) => ({
      id: r.id,
      ticketReference: r.ticketReference,
      productName: r.productName,
      productCode: r.productCode,
      category: r.category,
      publicStatus: r.publicStatus,
      internalStatus: r.internalStatus,
      priority: r.priority,
      severity: r.severity,
      reporterType: r.reporterType,
      reporterName: r.reporterName,
      reporterEmail: r.reporterEmail,
      reporterWhatsapp: r.reporterWhatsapp,
      issueSummary: r.issueSummary,
      source: r.source,
      environment: r.environment,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      sla: serializeSla(sla),
    })),
  );
});

const SLA_STATUS_FILTER_VALUES = new Set<SlaStatus>([
  "on_track",
  "approaching",
  "breached",
  "paused",
  "completed",
  "not_started",
]);

function parseSlaStatusFilter(value: unknown): SlaStatus | null {
  if (typeof value !== "string") return null;
  return SLA_STATUS_FILTER_VALUES.has(value as SlaStatus)
    ? (value as SlaStatus)
    : null;
}

function parseBool(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value === "true" || value === "1";
}

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
  sendTicketReceivedEmailIfPossible(ticket, product.productName, product.productCode).catch(
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

async function computeTicketSlaForDetail(
  row: DetailRow,
  now: Date = new Date(),
): Promise<SlaResult> {
  const map = await loadEngineeringStartedAtMap([row.ticket.id]);
  return calculateTicketSla({
    priority: row.ticket.priority,
    publicStatus: row.ticket.publicStatus,
    internalStatus: row.ticket.internalStatus,
    createdAt: row.ticket.createdAt,
    resolvedAt: row.ticket.resolvedAt,
    closedAt: row.ticket.closedAt,
    engineeringStartedAt: map.get(row.ticket.id) ?? null,
    now,
  });
}

function serializeTicketDetail(row: DetailRow, sla: SlaResult) {
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
    sla: serializeSla(sla),
  };
}

router.get("/support/tickets/:id", async (req, res): Promise<void> => {
  const row = await loadErideTicket(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  const sla = await computeTicketSlaForDetail(row);
  res.json(serializeTicketDetail(row, sla));
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
    const sla = await computeTicketSlaForDetail(existing);
    res.json(serializeTicketDetail(existing, sla));
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

  const updatedRow: DetailRow = {
    ticket: updated,
    productName: existing.productName,
    productCode: existing.productCode,
  };
  const sla = await computeTicketSlaForDetail(updatedRow);
  void recordSupportAuditLog({
    action: "ticket.update",
    supportTicketId: updated.id,
    actor: getCurrentSupportUser(req),
    metadata: {
      ticketReference: updated.ticketReference,
      changedFields: Object.keys(updates),
      publicChanged,
      internalChanged,
    },
  });
  res.json(serializeTicketDetail(updatedRow, sla));
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

    // Admin-outcome actions (spam/duplicate/not_a_bug/close) require an
    // elevated permission so non-admin roles with `manage_workflow` cannot
    // shortcut tickets into terminal admin states.
    const ADMIN_OUTCOME_ACTIONS = new Set<WorkflowAction>([
      "mark_spam",
      "mark_duplicate",
      "mark_not_a_bug",
      "close_ticket",
    ]);
    if (ADMIN_OUTCOME_ACTIONS.has(action as WorkflowAction)) {
      const user = getCurrentSupportUser(req);
      if (!user || !roleHasPermission(user.role, "manage_workflow_admin_outcomes")) {
        res.status(403).json({ error: "Forbidden: admin-only workflow action" });
        return;
      }
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

    const updatedRow: DetailRow = {
      ticket: updated,
      productName: existing.productName,
      productCode: existing.productCode,
    };
    const sla = await computeTicketSlaForDetail(updatedRow);
    void recordSupportAuditLog({
      action: "ticket.workflow_action",
      supportTicketId: updated.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: updated.ticketReference,
        workflowAction: action,
        newPublicStatus: updated.publicStatus,
        newInternalStatus: updated.internalStatus,
      },
    });
    res.json(serializeTicketDetail(updatedRow, sla));
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
    void recordSupportAuditLog({
      action: "ticket.linear_link_saved",
      supportTicketId: existing.ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: existing.ticket.ticketReference,
        linearIssueKey: saved.linearIssueKey,
      },
    });
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
    void recordSupportAuditLog({
      action: "ticket.sentry_link_added",
      supportTicketId: existing.ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: existing.ticket.ticketReference,
        sentryLinkId: saved.id,
        sentryIssueId: saved.sentryIssueId,
        sentryEventId: saved.sentryEventId,
      },
    });
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
    void recordSupportAuditLog({
      action: "ticket.sentry_link_removed",
      supportTicketId: existing.ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: existing.ticket.ticketReference,
        sentryLinkId,
      },
    });
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

// ── Linear API integration ──────────────────────────────────────────────────

const PRIORITY_TO_LINEAR_PRIORITY: Record<string, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

function linearTitleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildServerLinearTitle(t: SupportTicket, productCode: string): string {
  return `[${linearTitleCase(t.priority)}] [${productCode}] ${linearTitleCase(
    t.category,
  )} — ${t.issueSummary}`;
}

function buildServerLinearBody(
  t: SupportTicket,
  productName: string,
  productCode: string,
  attachmentCount: number,
): string {
  const attachmentSummary =
    attachmentCount === 0
      ? "No attachments uploaded"
      : `${attachmentCount} attachment(s) on the support ticket — review in the support dashboard.`;
  return `SUPPORT TICKET ESCALATION

Support Ticket:
${t.ticketReference}

Product:
${productName} (${productCode})

Priority:
${t.priority}

Severity:
${t.severity}

Category:
${t.category}

Reporter Type:
${t.reporterType}

Environment:
${t.environment}

Page / Step:
${t.pageOrStep ?? ""}

Application Reference:
${t.applicationReference ?? ""}

Account Reference:
${t.accountReference ?? ""}

Issue Summary:
${t.issueSummary}

What the user was trying to do:
${t.whatWereYouTryingToDo ?? ""}

What went wrong:
${t.whatWentWrong}

Attachments:
${attachmentSummary}

Current Support Status:
Public: ${t.publicStatus}
Internal: ${t.internalStatus}

Expected Engineering Action:
1. Reproduce the issue.
2. Identify the root cause.
3. Fix the issue.
4. Add or update a regression test.
5. Submit for review.
6. Return to support/QA for production verification.

Compliance Notes:
- Do not expose PII in logs, console output, Sentry, or Linear beyond what is necessary.
- Do not expose internal notes publicly.
- Do not use legal-decision language such as approved, rejected, or guaranteed.
- Preserve existing database IDs unless a schema change is explicitly required.
- The fixer cannot verify their own work.
- QA/support must verify on production before the user is told the issue is fixed.`;
}

router.get(
  "/support/integrations/linear/status",
  async (_req, res): Promise<void> => {
    const configured = isLinearEnabled();
    const hasTeamForProductCode: Record<string, boolean> = {};
    for (const code of ["EMA", "8BT", "ERD"]) {
      hasTeamForProductCode[code] = Boolean(
        resolveLinearTeamId(code) && configured,
      );
    }
    res.json({ configured, hasTeamForProductCode });
  },
);

// Full integration-status snapshot. Admin-only via supportPermissionGuard
// (manage_settings). Never exposes secret values.
router.get(
  "/support/integrations/status",
  async (_req, res): Promise<void> => {
    res.json(getIntegrationsStatus());
  },
);

// Admin-only test email. Returns { disabled: true } when RESEND_API_KEY is
// missing instead of throwing. Provider error messages are returned to the
// admin UI only (errorMessage). The audit log records every attempt.
const TEST_EMAIL_SUBJECT = "Eride Support Email Test";
const TEST_EMAIL_TEXT =
  "This confirms that Eride Support email delivery is configured.";
const TEST_EMAIL_HTML = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f6f8;margin:0;padding:24px;color:#0F172A"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:24px"><p style="margin:0 0 12px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#475569">Eride Support</p><h1 style="margin:0 0 12px;font-size:20px;color:#0F172A">Email delivery is configured</h1><p style="margin:0;color:#334155;line-height:1.5">${TEST_EMAIL_TEXT}</p></div></body></html>`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  "/support/integrations/email/test",
  async (req, res): Promise<void> => {
    const user = getCurrentSupportUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Defense-in-depth: the global supportPermissionGuard already enforces
    // manage_settings for this route, but re-check here so a future
    // misconfiguration of the guard cannot let a non-admin trigger a send.
    if (!roleHasPermission(user.role, "manage_settings")) {
      res.status(403).json({ error: "Permission required" });
      return;
    }
    const body = (req.body ?? {}) as { recipient?: unknown };
    const requested =
      typeof body.recipient === "string" ? body.recipient.trim() : "";
    const recipient = requested || user.email;
    if (!recipient || !EMAIL_REGEX.test(recipient) || recipient.length > 320) {
      res.status(400).json({ error: "Invalid recipient email address" });
      return;
    }

    const sentAt = new Date().toISOString();

    if (!isSupportEmailEnabled()) {
      void recordSupportAuditLog({
        action: "integration.email_test",
        actor: user,
        metadata: { recipient, disabled: true },
      });
      res.json({
        success: false,
        disabled: true,
        recipient,
        sentAt,
        providerMessageId: null,
        errorMessage:
          "RESEND_API_KEY is not configured. Set the secret to enable email delivery.",
      });
      return;
    }

    const result = await sendSupportEmail({
      to: recipient,
      subject: TEST_EMAIL_SUBJECT,
      html: TEST_EMAIL_HTML,
      text: TEST_EMAIL_TEXT,
    });

    void recordSupportAuditLog({
      action: "integration.email_test",
      actor: user,
      metadata: {
        recipient,
        success: result.success,
        providerMessageId: result.providerMessageId ?? null,
      },
    });

    res.json({
      success: result.success,
      disabled: result.disabled,
      recipient,
      sentAt,
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.errorMessage ?? null,
    });
  },
);

router.post(
  "/support/tickets/:id/create-linear-issue",
  async (req, res): Promise<void> => {
    const parsed = CreateSupportTicketLinearIssueBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const body = parsed.data;

    const existing = await loadErideTicket(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const ticket = existing.ticket;

    // Build title/body from request overrides or server-side template.
    const attachmentCount = await db
      .select({ id: supportTicketAttachmentsTable.id })
      .from(supportTicketAttachmentsTable)
      .where(
        eq(supportTicketAttachmentsTable.supportTicketId, ticket.id),
      );
    const generatedTitle =
      body.title?.trim() ||
      buildServerLinearTitle(ticket, existing.productCode);
    const generatedDescription =
      body.description?.trim() ||
      buildServerLinearBody(
        ticket,
        existing.productName,
        existing.productCode,
        attachmentCount.length,
      );

    // Resolve team ID: explicit override → product mapping → default.
    const teamId =
      body.linearTeamId?.trim() ||
      resolveLinearTeamId(existing.productCode);

    if (!isLinearEnabled()) {
      res.status(200).json({
        success: false,
        disabled: true,
        errorMessage:
          "Linear API is not configured. Use the manual Save Linear Link form or copy/paste instead.",
        generatedTitle,
        generatedDescription,
        linearLink: null,
      });
      return;
    }
    if (!teamId) {
      res.status(200).json({
        success: false,
        disabled: false,
        errorMessage: `No Linear team configured for product ${existing.productCode}. Set LINEAR_TEAM_ID_${existing.productCode.toUpperCase()} or LINEAR_DEFAULT_TEAM_ID.`,
        generatedTitle,
        generatedDescription,
        linearLink: null,
      });
      return;
    }

    // Serialize concurrent create-issue requests for this ticket so two
    // clicks can't both pass the duplicate-link check, both call Linear,
    // and orphan one of the resulting issues. pg_advisory_xact_lock blocks
    // peers in other transactions until this one commits/rolls back.
    type CreateOutcome =
      | { kind: "duplicate"; existingKey: string }
      | {
          kind: "linear_failed";
          disabled: boolean;
          errorMessage: string;
        }
      | {
          kind: "ok";
          savedLink: typeof supportTicketLinearLinksTable.$inferSelect;
          linearIssueKey: string;
          linearIssueUrl: string | null;
        };

    const outcome = await db.transaction<CreateOutcome>(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ticket.id}))`);

      const [currentLink] = await tx
        .select()
        .from(supportTicketLinearLinksTable)
        .where(
          eq(supportTicketLinearLinksTable.supportTicketId, ticket.id),
        )
        .limit(1);
      if (currentLink && currentLink.linearIssueKey) {
        return { kind: "duplicate", existingKey: currentLink.linearIssueKey };
      }

      const result = await createLinearIssue({
        teamId,
        title: generatedTitle,
        description: generatedDescription,
        priority: PRIORITY_TO_LINEAR_PRIORITY[ticket.priority],
      });

      if (!result.success) {
        return {
          kind: "linear_failed",
          disabled: result.disabled,
          errorMessage: result.errorMessage ?? "Linear API call failed.",
        };
      }

      const linkValues = {
        linearIssueId: result.linearIssueId ?? null,
        linearIssueKey: result.linearIssueKey ?? null,
        linearIssueUrl: result.linearIssueUrl ?? null,
        linearTeamKey: result.linearTeamKey ?? teamId,
        linearStatus: "created",
        createdByName: body.createdByName?.trim() || null,
        lastSyncedAt: new Date(),
      };
      const [savedLink] = await tx
        .insert(supportTicketLinearLinksTable)
        .values({ supportTicketId: ticket.id, ...linkValues })
        .onConflictDoUpdate({
          target: supportTicketLinearLinksTable.supportTicketId,
          set: { ...linkValues, updatedAt: new Date() },
        })
        .returning();

      const eligibleInternal = new Set([
        "engineering_escalation_required",
        "support_review",
      ]);
      if (eligibleInternal.has(ticket.internalStatus)) {
        const previousInternal = ticket.internalStatus;
        await tx
          .update(supportTicketsTable)
          .set({ internalStatus: "linear_created", updatedAt: new Date() })
          .where(eq(supportTicketsTable.id, ticket.id));
        await tx.insert(supportTicketStatusHistoryTable).values({
          supportTicketId: ticket.id,
          oldPublicStatus: ticket.publicStatus,
          newPublicStatus: ticket.publicStatus,
          oldInternalStatus: previousInternal,
          newInternalStatus: "linear_created",
          changedByName: body.createdByName?.trim() || null,
          changeReason: `[create_linear_issue] Linear issue ${result.linearIssueKey} created`,
        });
      }

      await tx.insert(supportTicketMessagesTable).values({
        supportTicketId: ticket.id,
        direction: "internal",
        channel: "internal_note",
        messageType: "internal_update",
        messageBody: `Linear issue ${result.linearIssueKey} created for this support ticket. ${result.linearIssueUrl ?? ""}`.trim(),
        deliveryStatus: "not_applicable",
        senderName: body.createdByName?.trim() || "Support",
        relatedPublicStatus: ticket.publicStatus,
        relatedInternalStatus: eligibleInternal.has(ticket.internalStatus)
          ? "linear_created"
          : ticket.internalStatus,
      });

      return {
        kind: "ok",
        savedLink,
        linearIssueKey: result.linearIssueKey ?? "",
        linearIssueUrl: result.linearIssueUrl ?? null,
      };
    });

    if (outcome.kind === "duplicate") {
      res.status(409).json({
        error: `Ticket is already linked to Linear issue ${outcome.existingKey}.`,
      });
      return;
    }
    if (outcome.kind === "linear_failed") {
      res.status(200).json({
        success: false,
        disabled: outcome.disabled,
        errorMessage: outcome.errorMessage,
        generatedTitle,
        generatedDescription,
        linearLink: null,
      });
      return;
    }

    void recordSupportAuditLog({
      action: "ticket.linear_issue_created",
      supportTicketId: ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: ticket.ticketReference,
        linearIssueKey: outcome.linearIssueKey,
        linearIssueUrl: outcome.linearIssueUrl,
        teamId,
      },
    });
    res.json({
      success: true,
      disabled: false,
      errorMessage: null,
      generatedTitle,
      generatedDescription,
      linearLink: outcome.savedLink
        ? serializeLinearLink(outcome.savedLink)
        : null,
    });
  },
);

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
    void recordSupportAuditLog({
      action: "ticket.linear_link_removed",
      supportTicketId: existing.ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: { ticketReference: existing.ticket.ticketReference },
    });
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

  void recordSupportAuditLog({
    action: "ticket.note_added",
    supportTicketId: existing.ticket.id,
    actor: getCurrentSupportUser(req),
    metadata: { ticketReference: existing.ticket.ticketReference },
  });
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
    void recordSupportAuditLog({
      action: "ticket.message_recorded",
      supportTicketId: existing.ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: existing.ticket.ticketReference,
        direction: row.direction,
        channel: row.channel,
        messageType: row.messageType,
      },
    });
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

/**
 * Look up an active admin-managed email template for the given key/org and,
 * if found, render it against the current ticket + settings. Returns null if
 * no active template exists — callers should fall back to the hardcoded
 * `renderSupportEmailTemplate`.
 */
async function renderAdminEmailIfActive(
  orgId: string,
  templateKey: SupportEmailTemplateKey,
  ticket: SupportTicket,
  productName: string,
  productCode: string,
  settings: SupportSettings,
): Promise<{ subject: string; text: string; html: string } | null> {
  const row = await db.query.supportMessageTemplatesTable.findFirst({
    where: and(
      eq(supportMessageTemplatesTable.organisationId, orgId),
      eq(supportMessageTemplatesTable.templateKey, templateKey),
      eq(supportMessageTemplatesTable.channel, "email"),
      eq(supportMessageTemplatesTable.isActive, true),
    ),
  });
  if (!row) return null;
  const ctx: TemplateContext = {
    ticketReference: ticket.ticketReference,
    productName,
    productCode,
    reporterName: ticket.reporterName ?? "",
    publicStatus: ticket.publicStatus,
    issueSummary: ticket.issueSummary,
    supportDisplayName: settings.supportDisplayName,
    supportEmailReplyTo: settings.supportEmailReplyTo,
  };
  const subject = renderTemplateString(
    row.subject ?? `[${ticket.ticketReference}] ${row.templateName}`,
    ctx,
  );
  const text = renderTemplateString(row.bodyText, ctx);
  // Prefer admin-supplied bodyHtml (already passed isSafeTemplateHtml on save);
  // otherwise wrap rendered text using the standard custom-email shell.
  const html =
    row.bodyHtml && row.bodyHtml.trim()
      ? renderTemplateString(row.bodyHtml, ctx)
      : renderCustomEmailHtml({
          ticketReference: ticket.ticketReference,
          productName,
          publicStatus: ticket.publicStatus,
          reporterName: ticket.reporterName ?? null,
          bodyText: text,
        });
  return { subject, text, html };
}

export async function sendTicketReceivedEmailIfPossible(
  ticket: SupportTicket,
  productName: string,
  productCode: string,
): Promise<void> {
  const recipient = ticket.reporterEmail?.trim();
  if (!recipient || !EMAIL_RE.test(recipient)) return;

  const settingsResult = await getOrCreateErideSettings();
  const adminRendered = settingsResult
    ? await renderAdminEmailIfActive(
        settingsResult.orgId,
        "ticket_received",
        ticket,
        productName,
        productCode,
        settingsResult.settings,
      )
    : null;
  const fallback = renderSupportEmailTemplate("ticket_received", {
    ticket,
    productName,
  });
  const rendered = adminRendered ?? fallback;

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
      const settingsResult = await getOrCreateErideSettings();
      const adminRendered = settingsResult
        ? await renderAdminEmailIfActive(
            settingsResult.orgId,
            messageType,
            t,
            existing.productName,
            existing.productCode,
            settingsResult.settings,
          )
        : null;
      const rendered =
        adminRendered ??
        renderSupportEmailTemplate(messageType, {
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
    void recordSupportAuditLog({
      action: "ticket.email_sent",
      supportTicketId: t.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: t.ticketReference,
        recipient,
        messageType,
        sendMode,
        deliveryStatus,
        providerMessageId: sendResult.providerMessageId ?? null,
        disabled: sendResult.disabled,
      },
    });
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

      void recordSupportAuditLog({
        action: "ticket.attachment_uploaded",
        supportTicketId: existing.ticket.id,
        actor: getCurrentSupportUser(req),
        metadata: {
          ticketReference: existing.ticket.ticketReference,
          attachmentId: row.id,
          fileName: row.originalFileName,
          mimeType: row.mimeType,
          fileSize: row.fileSize,
        },
      });
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
    void recordSupportAuditLog({
      action: "ticket.attachment_deleted",
      supportTicketId: existing.ticket.id,
      actor: getCurrentSupportUser(req),
      metadata: {
        ticketReference: existing.ticket.ticketReference,
        attachmentId,
        fileName: att.originalFileName,
      },
    });
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

// ─── Settings ───────────────────────────────────────────────────────────────

const ERIDE_DEFAULT_SETTINGS = {
  supportDisplayName: "Eride Support",
  supportEmailFrom: "Eride Support <support@eridetech.africa>",
  supportEmailReplyTo: "support@eridetech.africa",
  defaultSenderName: "Eride Support",
  defaultSenderRole: "support",
  publicTicketTokenTtlMinutes: 30,
  allowPublicReplies: true,
  allowPublicAttachments: true,
} as const;

export async function getOrCreateErideSettings(): Promise<
  { settings: SupportSettings; orgId: string } | null
> {
  const org = await getErideOrganisation();
  if (!org) return null;
  const existing = await db.query.supportSettingsTable.findFirst({
    where: eq(supportSettingsTable.organisationId, org.id),
  });
  if (existing) return { settings: existing, orgId: org.id };
  const [created] = await db
    .insert(supportSettingsTable)
    .values({ organisationId: org.id, ...ERIDE_DEFAULT_SETTINGS })
    .onConflictDoNothing({ target: supportSettingsTable.organisationId })
    .returning();
  if (created) return { settings: created, orgId: org.id };
  const fallback = await db.query.supportSettingsTable.findFirst({
    where: eq(supportSettingsTable.organisationId, org.id),
  });
  return fallback ? { settings: fallback, orgId: org.id } : null;
}

function serializeSettings(s: SupportSettings) {
  return {
    id: s.id,
    organisationId: s.organisationId,
    supportDisplayName: s.supportDisplayName,
    supportEmailFrom: s.supportEmailFrom,
    supportEmailReplyTo: s.supportEmailReplyTo,
    defaultSenderName: s.defaultSenderName,
    defaultSenderRole: s.defaultSenderRole,
    publicTicketTokenTtlMinutes: s.publicTicketTokenTtlMinutes,
    allowPublicReplies: s.allowPublicReplies,
    allowPublicAttachments: s.allowPublicAttachments,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// "support@example.com" or "Display Name <support@example.com>"
const FROM_EMAIL_RE =
  /^(?:[^<>]+<\s*[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+\s*>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/;

router.get("/support/settings", async (_req, res): Promise<void> => {
  const result = await getOrCreateErideSettings();
  if (!result) {
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }
  res.json(serializeSettings(result.settings));
});

router.patch("/support/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSupportSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings update" });
    return;
  }
  const data = parsed.data;
  // Extra validation for email-shaped fields.
  if (data.supportEmailFrom !== undefined && !FROM_EMAIL_RE.test(data.supportEmailFrom)) {
    res.status(400).json({ error: "supportEmailFrom is not a valid email or 'Name <email>' format." });
    return;
  }
  if (data.supportEmailReplyTo !== undefined && !EMAIL_RE.test(data.supportEmailReplyTo)) {
    res.status(400).json({ error: "supportEmailReplyTo is not a valid email." });
    return;
  }
  const existing = await getOrCreateErideSettings();
  if (!existing) {
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }
  const patch: Partial<typeof supportSettingsTable.$inferInsert> = {};
  if (data.supportDisplayName !== undefined) patch.supportDisplayName = data.supportDisplayName.trim();
  if (data.supportEmailFrom !== undefined) patch.supportEmailFrom = data.supportEmailFrom.trim();
  if (data.supportEmailReplyTo !== undefined) patch.supportEmailReplyTo = data.supportEmailReplyTo.trim();
  if (data.defaultSenderName !== undefined) patch.defaultSenderName = data.defaultSenderName.trim();
  if (data.defaultSenderRole !== undefined) patch.defaultSenderRole = data.defaultSenderRole.trim();
  if (data.publicTicketTokenTtlMinutes !== undefined) patch.publicTicketTokenTtlMinutes = data.publicTicketTokenTtlMinutes;
  if (data.allowPublicReplies !== undefined) patch.allowPublicReplies = data.allowPublicReplies;
  if (data.allowPublicAttachments !== undefined) patch.allowPublicAttachments = data.allowPublicAttachments;
  if (Object.keys(patch).length === 0) {
    res.json(serializeSettings(existing.settings));
    return;
  }
  const [updated] = await db
    .update(supportSettingsTable)
    .set(patch)
    .where(eq(supportSettingsTable.id, existing.settings.id))
    .returning();
  void recordSupportAuditLog({
    action: "settings.updated",
    actor: getCurrentSupportUser(req),
    metadata: { changedFields: Object.keys(patch) },
  });
  res.json(serializeSettings(updated ?? existing.settings));
});

// ─── Message templates ──────────────────────────────────────────────────────

function serializeTemplate(t: SupportMessageTemplate) {
  return {
    id: t.id,
    organisationId: t.organisationId,
    templateKey: t.templateKey,
    templateName: t.templateName,
    channel: t.channel,
    subject: t.subject,
    bodyText: t.bodyText,
    bodyHtml: t.bodyHtml,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function isAllowedTemplateKey(v: string): v is AllowedTemplateKey {
  return (ALLOWED_TEMPLATE_KEYS as readonly string[]).includes(v);
}
function isAllowedTemplateChannel(v: string): v is AllowedTemplateChannel {
  return (ALLOWED_TEMPLATE_CHANNELS as readonly string[]).includes(v);
}

router.get("/support/templates", async (req, res): Promise<void> => {
  const parsed = ListSupportMessageTemplatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid template filters" });
    return;
  }
  const { channel, templateKey, isActive } = parsed.data;
  const org = await getErideOrganisation();
  if (!org) {
    res.status(500).json({ error: "Support is temporarily unavailable" });
    return;
  }
  const conditions: SQL[] = [
    eq(supportMessageTemplatesTable.organisationId, org.id),
  ];
  if (channel) conditions.push(eq(supportMessageTemplatesTable.channel, channel));
  if (templateKey) conditions.push(eq(supportMessageTemplatesTable.templateKey, templateKey));
  if (isActive !== undefined) conditions.push(eq(supportMessageTemplatesTable.isActive, isActive));
  const rows = await db
    .select()
    .from(supportMessageTemplatesTable)
    .where(and(...conditions))
    .orderBy(supportMessageTemplatesTable.channel, supportMessageTemplatesTable.templateKey);
  res.json(rows.map(serializeTemplate));
});

async function loadErideTemplate(id: string): Promise<SupportMessageTemplate | null> {
  if (!UUID_RE.test(id)) return null;
  const org = await getErideOrganisation();
  if (!org) return null;
  const row = await db.query.supportMessageTemplatesTable.findFirst({
    where: and(
      eq(supportMessageTemplatesTable.id, id),
      eq(supportMessageTemplatesTable.organisationId, org.id),
    ),
  });
  return row ?? null;
}

router.get("/support/templates/:id", async (req, res): Promise<void> => {
  const row = await loadErideTemplate(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(serializeTemplate(row));
});

router.patch("/support/templates/:id", async (req, res): Promise<void> => {
  const existing = await loadErideTemplate(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const parsed = UpdateSupportMessageTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid template update" });
    return;
  }
  const data = parsed.data;

  // Subject required for email channel (except `custom` which may omit).
  if (existing.channel === "email" && existing.templateKey !== "custom") {
    const finalSubject =
      data.subject !== undefined ? (data.subject ?? "").trim() : (existing.subject ?? "").trim();
    if (!finalSubject) {
      res.status(400).json({
        error: "Email templates require a subject.",
      });
      return;
    }
  }

  if (data.bodyText !== undefined && !data.bodyText.trim()) {
    res.status(400).json({ error: "bodyText is required and cannot be empty." });
    return;
  }

  if (data.bodyHtml !== undefined && data.bodyHtml !== null && data.bodyHtml.trim()) {
    const safety = isSafeTemplateHtml(data.bodyHtml);
    if (!safety.ok) {
      res.status(400).json({ error: safety.reason });
      return;
    }
  }

  const patch: Partial<typeof supportMessageTemplatesTable.$inferInsert> = {};
  if (data.templateName !== undefined) patch.templateName = data.templateName.trim();
  if (data.subject !== undefined) patch.subject = data.subject == null ? null : data.subject.trim();
  if (data.bodyText !== undefined) patch.bodyText = data.bodyText;
  if (data.bodyHtml !== undefined)
    patch.bodyHtml = data.bodyHtml == null ? null : data.bodyHtml;
  if (data.isActive !== undefined) patch.isActive = data.isActive;

  if (Object.keys(patch).length === 0) {
    res.json(serializeTemplate(existing));
    return;
  }

  const [updated] = await db
    .update(supportMessageTemplatesTable)
    .set(patch)
    .where(eq(supportMessageTemplatesTable.id, existing.id))
    .returning();
  void recordSupportAuditLog({
    action: "template.updated",
    actor: getCurrentSupportUser(req),
    metadata: {
      templateId: existing.id,
      templateKey: existing.templateKey,
      channel: existing.channel,
      changedFields: Object.keys(patch),
    },
  });
  res.json(serializeTemplate(updated ?? existing));
});

const SAMPLE_TEMPLATE_CONTEXT: Required<TemplateContext> = {
  ticketReference: "EMA-SUP-2026-000123",
  productName: "E-Migration Assist",
  productCode: "EMA",
  reporterName: "Sample Reporter",
  publicStatus: "under_review",
  issueSummary: "Sample issue summary for previewing this template.",
  supportDisplayName: "Eride Support",
  supportEmailReplyTo: "support@eridetech.africa",
};

async function buildTemplateContextForTicket(
  ticketId: string | null | undefined,
): Promise<{ ctx: TemplateContext; usedSample: boolean }> {
  const settingsResult = await getOrCreateErideSettings();
  const settings = settingsResult?.settings;
  if (ticketId && UUID_RE.test(ticketId)) {
    const row = await loadErideTicket(ticketId);
    if (row) {
      const t = row.ticket;
      return {
        usedSample: false,
        ctx: {
          ticketReference: t.ticketReference,
          productName: row.productName,
          productCode: row.productCode,
          reporterName: t.reporterName ?? "",
          publicStatus: t.publicStatus,
          issueSummary: t.issueSummary,
          supportDisplayName:
            settings?.supportDisplayName ?? SAMPLE_TEMPLATE_CONTEXT.supportDisplayName,
          supportEmailReplyTo:
            settings?.supportEmailReplyTo ?? SAMPLE_TEMPLATE_CONTEXT.supportEmailReplyTo,
        },
      };
    }
  }
  return {
    usedSample: true,
    ctx: {
      ...SAMPLE_TEMPLATE_CONTEXT,
      supportDisplayName:
        settings?.supportDisplayName ?? SAMPLE_TEMPLATE_CONTEXT.supportDisplayName,
      supportEmailReplyTo:
        settings?.supportEmailReplyTo ?? SAMPLE_TEMPLATE_CONTEXT.supportEmailReplyTo,
    },
  };
}

router.post("/support/templates/preview", async (req, res): Promise<void> => {
  const parsed = PreviewSupportMessageTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid preview request" });
    return;
  }
  const data = parsed.data;
  if (!isAllowedTemplateKey(data.templateKey)) {
    res.status(400).json({ error: "Unsupported templateKey" });
    return;
  }
  if (!isAllowedTemplateChannel(data.channel)) {
    res.status(400).json({ error: "Unsupported channel" });
    return;
  }

  // If no overrides provided, fall back to the saved template content.
  let subject = data.subject ?? null;
  let bodyText = data.bodyText ?? null;
  let bodyHtml = data.bodyHtml ?? null;

  if (subject === null || bodyText === null || bodyHtml === null) {
    const org = await getErideOrganisation();
    if (org) {
      const saved = await db.query.supportMessageTemplatesTable.findFirst({
        where: and(
          eq(supportMessageTemplatesTable.organisationId, org.id),
          eq(supportMessageTemplatesTable.templateKey, data.templateKey),
          eq(supportMessageTemplatesTable.channel, data.channel),
        ),
      });
      if (saved) {
        if (subject === null) subject = saved.subject;
        if (bodyText === null) bodyText = saved.bodyText;
        if (bodyHtml === null) bodyHtml = saved.bodyHtml;
      }
    }
  }

  if (bodyHtml && bodyHtml.trim()) {
    const safety = isSafeTemplateHtml(bodyHtml);
    if (!safety.ok) {
      res.status(400).json({ error: safety.reason });
      return;
    }
  }

  const { ctx, usedSample } = await buildTemplateContextForTicket(data.ticketId ?? null);
  const renderedSubject = subject ? renderTemplateString(subject, ctx) : null;
  const renderedBodyText = renderTemplateString(bodyText ?? "", ctx);
  const renderedBodyHtml = bodyHtml ? renderTemplateString(bodyHtml, ctx) : null;

  res.json({
    renderedSubject,
    renderedBodyText,
    renderedBodyHtml,
    usedSampleTicket: usedSample,
  });
});

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
