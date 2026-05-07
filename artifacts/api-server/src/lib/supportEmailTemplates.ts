import type { SupportTicket } from "@workspace/db";

export type SupportEmailTemplateKey =
  | "ticket_received"
  | "under_review"
  | "more_info_needed"
  | "escalated_to_engineering"
  | "fixed"
  | "resolved"
  | "closed"
  | "reopened";

export type RenderedSupportEmail = {
  subject: string;
  text: string;
  html: string;
};

export type SupportEmailContext = {
  ticket: Pick<
    SupportTicket,
    "ticketReference" | "publicStatus" | "reporterName" | "issueSummary"
  >;
  productName: string;
};

const FOOTER_TEXT =
  "This message relates to your Eride Support ticket. Please do not reply with passwords, payment card details, or sensitive documents unless specifically requested by support.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(opts: {
  greeting: string;
  paragraphs: string[];
  ticketReference: string;
  productName: string;
  publicStatus: string;
}): string {
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p)}</p>`)
    .join("");
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5;max-width:560px;margin:0 auto;padding:16px;">
<p style="margin:0 0 12px 0;">${escapeHtml(opts.greeting)}</p>
${paras}
<table role="presentation" style="border-collapse:collapse;margin:16px 0;font-size:14px;">
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Ticket reference</td><td style="padding:4px 0;font-weight:bold;">${escapeHtml(opts.ticketReference)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Product</td><td style="padding:4px 0;">${escapeHtml(opts.productName)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Status</td><td style="padding:4px 0;">${escapeHtml(humanStatus(opts.publicStatus))}</td></tr>
</table>
<p style="margin:0 0 12px 0;">— Eride Support</p>
<hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
<p style="font-size:12px;color:#666;margin:0;">${escapeHtml(FOOTER_TEXT)}</p>
</body></html>`;
}

function humanStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function greeting(ticket: SupportEmailContext["ticket"]): string {
  const name = ticket.reporterName?.trim();
  return name ? `Hi ${name},` : "Hi,";
}

function renderText(opts: {
  greeting: string;
  paragraphs: string[];
  ticketReference: string;
  productName: string;
  publicStatus: string;
}): string {
  return [
    opts.greeting,
    "",
    ...opts.paragraphs,
    "",
    `Ticket reference: ${opts.ticketReference}`,
    `Product: ${opts.productName}`,
    `Status: ${humanStatus(opts.publicStatus)}`,
    "",
    "— Eride Support",
    "",
    FOOTER_TEXT,
  ].join("\n");
}

const TEMPLATE_BODIES: Record<
  SupportEmailTemplateKey,
  { subjectPrefix: string; paragraphs: string[] }
> = {
  ticket_received: {
    subjectPrefix: "We have received your support request",
    paragraphs: [
      "Thank you for contacting Eride Support. We have received your request and will review it shortly.",
      "We will keep you updated as soon as there is news on your ticket.",
    ],
  },
  under_review: {
    subjectPrefix: "Your support ticket is under review",
    paragraphs: [
      "Our support team is now actively reviewing your ticket.",
      "We will follow up as soon as we have more information for you.",
    ],
  },
  more_info_needed: {
    subjectPrefix: "We need a little more information about your support ticket",
    paragraphs: [
      "To help us resolve your issue, we need a bit more information from you.",
      "Please reply to this email with any extra details that may help us understand the problem.",
    ],
  },
  escalated_to_engineering: {
    subjectPrefix: "Your support ticket has been escalated",
    paragraphs: [
      "Your support ticket has been escalated to our engineering team for further investigation.",
      "We will let you know as soon as we have an update.",
    ],
  },
  fixed: {
    subjectPrefix: "An update on your support ticket",
    paragraphs: [
      "We believe the issue you reported has now been addressed.",
      "Please try again at your convenience and let us know if you continue to experience the problem.",
    ],
  },
  resolved: {
    subjectPrefix: "Your support ticket has been resolved",
    paragraphs: [
      "We have marked your support ticket as resolved.",
      "If the issue returns or you have any further questions, please reply to this email and we will reopen it.",
    ],
  },
  closed: {
    subjectPrefix: "Your support ticket has been closed",
    paragraphs: [
      "Your support ticket has been closed.",
      "If you need further assistance, please reply to this email or submit a new request.",
    ],
  },
  reopened: {
    subjectPrefix: "Your support ticket has been reopened",
    paragraphs: [
      "We have reopened your support ticket and are looking into it again.",
      "We will follow up as soon as there is an update.",
    ],
  },
};

export function renderSupportEmailTemplate(
  key: SupportEmailTemplateKey,
  ctx: SupportEmailContext,
): RenderedSupportEmail {
  const body = TEMPLATE_BODIES[key];
  const subject = `[${ctx.ticket.ticketReference}] ${body.subjectPrefix}`;
  const greet = greeting(ctx.ticket);
  const text = renderText({
    greeting: greet,
    paragraphs: body.paragraphs,
    ticketReference: ctx.ticket.ticketReference,
    productName: ctx.productName,
    publicStatus: ctx.ticket.publicStatus,
  });
  const html = renderHtml({
    greeting: greet,
    paragraphs: body.paragraphs,
    ticketReference: ctx.ticket.ticketReference,
    productName: ctx.productName,
    publicStatus: ctx.ticket.publicStatus,
  });
  return { subject, text, html };
}

export function renderCustomEmailHtml(opts: {
  ticketReference: string;
  productName: string;
  publicStatus: string;
  reporterName: string | null;
  bodyText: string;
}): string {
  const greet = opts.reporterName?.trim()
    ? `Hi ${opts.reporterName.trim()},`
    : "Hi,";
  const paragraphs = opts.bodyText
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return renderHtml({
    greeting: greet,
    paragraphs,
    ticketReference: opts.ticketReference,
    productName: opts.productName,
    publicStatus: opts.publicStatus,
  });
}

export const SUPPORT_EMAIL_TEMPLATE_KEYS: SupportEmailTemplateKey[] = [
  "ticket_received",
  "under_review",
  "more_info_needed",
  "escalated_to_engineering",
  "fixed",
  "resolved",
  "closed",
  "reopened",
];
