/**
 * Render an admin-managed support template by substituting `{{variable}}`
 * placeholders. Unknown variables render as empty string. Allowed variables
 * are restricted to the support-template variable set.
 */

export const TEMPLATE_VARIABLES = [
  "ticketReference",
  "productName",
  "productCode",
  "reporterName",
  "publicStatus",
  "issueSummary",
  "supportDisplayName",
  "supportEmailReplyTo",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateContext = Partial<Record<TemplateVariable, string | null>>;

const HUMAN_PUBLIC_STATUS = (s: string): string => s.replace(/_/g, " ");

export function renderTemplateString(
  template: string | null | undefined,
  ctx: TemplateContext,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    if ((TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      const v = ctx[name as TemplateVariable];
      if (v == null) return "";
      if (name === "publicStatus") return HUMAN_PUBLIC_STATUS(String(v));
      return String(v);
    }
    return "";
  });
}

/**
 * Conservative HTML safety check for admin-managed bodyHtml. We don't
 * sanitise — we reject anything that contains script tags, inline
 * event handlers, javascript: URIs, or other obviously dangerous content.
 * This is intentionally strict: admins should write tame HTML.
 */
export function isSafeTemplateHtml(html: string): {
  ok: true;
} | {
  ok: false;
  reason: string;
} {
  const lower = html.toLowerCase();
  if (/<\s*script[\s>]/i.test(html)) {
    return { ok: false, reason: "Template HTML must not contain <script> tags." };
  }
  if (/<\s*\/\s*script\s*>/i.test(html)) {
    return { ok: false, reason: "Template HTML must not contain </script> tags." };
  }
  if (/<\s*(iframe|object|embed|link|meta|style)\b/i.test(html)) {
    return {
      ok: false,
      reason:
        "Template HTML must not contain <iframe>, <object>, <embed>, <link>, <meta>, or <style> tags.",
    };
  }
  if (/\son[a-z]+\s*=/.test(lower)) {
    return {
      ok: false,
      reason: "Template HTML must not contain inline event handlers (onclick, onload, etc.).",
    };
  }
  if (/javascript:/.test(lower) || /vbscript:/.test(lower) || /data:text\/html/.test(lower)) {
    return {
      ok: false,
      reason: "Template HTML must not contain javascript:, vbscript:, or data:text/html URIs.",
    };
  }
  return { ok: true };
}

/** Allowed templateKey values for support_message_templates. */
export const ALLOWED_TEMPLATE_KEYS = [
  "ticket_received",
  "under_review",
  "more_info_needed",
  "escalated_to_engineering",
  "fixed",
  "resolved",
  "closed",
  "reopened",
  "custom",
] as const;
export type AllowedTemplateKey = (typeof ALLOWED_TEMPLATE_KEYS)[number];

/** Allowed channel values for support_message_templates. */
export const ALLOWED_TEMPLATE_CHANNELS = [
  "email",
  "whatsapp",
  "manual",
  "in_app",
] as const;
export type AllowedTemplateChannel = (typeof ALLOWED_TEMPLATE_CHANNELS)[number];
