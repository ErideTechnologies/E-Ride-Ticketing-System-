import { logger } from "./logger";

/**
 * Safe WhatsApp provider abstraction.
 *
 * Today this never actually sends a message — every concrete provider is in
 * "prepared but not wired" mode. The shape exists so the rest of the support
 * codebase can call `sendWhatsAppMessageIfPossible` without branching on env
 * vars, and so the admin Integrations page can render a single "configured /
 * not configured" status card.
 *
 * Adding a real provider later is a single-file change: implement the
 * `sendVia*` branch and flip the readiness check.
 */

export type WhatsAppProviderMode =
  | "none"
  | "manual"
  | "meta_cloud_api"
  | "twilio";

const PROVIDER_MODES: ReadonlyArray<WhatsAppProviderMode> = [
  "none",
  "manual",
  "meta_cloud_api",
  "twilio",
];

export type WhatsAppStatus = {
  provider: WhatsAppProviderMode;
  /** True when a real provider is selected AND the required env vars are present. */
  configured: boolean;
  /** True when the provider mode is none/manual — manual mode is intentionally OK. */
  manualMode: boolean;
  /** Names of env vars that must be set for the selected provider, with whether each is set. */
  requiredEnvVars: Array<{ name: string; configured: boolean }>;
  /** Human-readable, NEVER includes secret values. */
  description: string;
};

export type WhatsAppSendResult = {
  success: boolean;
  /** True when no real provider is configured — caller should record the
   *  outbound message as `manual` instead of `sent`. */
  disabled: boolean;
  manualMode: boolean;
  provider: WhatsAppProviderMode;
  providerMessageId?: string | null;
  /** Internal-only error string. NEVER surface this to public pages. */
  errorMessage?: string | null;
};

function readProviderMode(): WhatsAppProviderMode {
  const raw = (process.env["WHATSAPP_PROVIDER"] ?? "").trim().toLowerCase();
  if (!raw) return "none";
  if ((PROVIDER_MODES as readonly string[]).includes(raw)) {
    return raw as WhatsAppProviderMode;
  }
  logger.warn(
    { provider: raw },
    "Unknown WHATSAPP_PROVIDER value — falling back to disabled mode",
  );
  return "none";
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function requiredVarsFor(
  mode: WhatsAppProviderMode,
): Array<{ name: string; configured: boolean }> {
  switch (mode) {
    case "meta_cloud_api":
      return [
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_FROM_NUMBER",
      ].map((name) => ({ name, configured: envPresent(name) }));
    case "twilio":
      return [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_WHATSAPP_FROM",
      ].map((name) => ({ name, configured: envPresent(name) }));
    case "manual":
    case "none":
    default:
      return [];
  }
}

export function getWhatsAppStatus(): WhatsAppStatus {
  const provider = readProviderMode();
  const requiredEnvVars = requiredVarsFor(provider);
  const allRequiredPresent =
    requiredEnvVars.length === 0
      ? false
      : requiredEnvVars.every((v) => v.configured);
  const manualMode = provider === "none" || provider === "manual";
  const configured = !manualMode && allRequiredPresent;

  let description: string;
  if (provider === "none") {
    description =
      "WhatsApp provider not configured. Outbound WhatsApp actions are recorded as manual.";
  } else if (provider === "manual") {
    description =
      "WhatsApp is in manual mode. Agents send messages from their own device; the system only logs them.";
  } else if (configured) {
    description = `WhatsApp provider \"${provider}\" is configured and ready.`;
  } else {
    description = `WhatsApp provider \"${provider}\" is selected but missing required env vars; falling back to manual.`;
  }

  return { provider, configured, manualMode, requiredEnvVars, description };
}

export function isWhatsAppEnabled(): boolean {
  return getWhatsAppStatus().configured;
}

export function isWhatsAppManualMode(): boolean {
  return getWhatsAppStatus().manualMode;
}

/**
 * Light normalisation: strip spaces / dashes / parens, keep leading `+`.
 * Does NOT validate or canonicalise to E.164; admin/public layers already do
 * stricter validation before persisting.
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  const sign = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  return digits ? `${sign}${digits}` : "";
}

/**
 * Webhook signature verification stub. When no provider is configured (or no
 * webhook secret is set) we return `null` so callers can decide whether to
 * 404 or 503; we never throw and we never log secret values.
 */
export function verifyWhatsAppWebhookIfConfigured(_input: {
  signature: string | null;
  rawBody: Buffer | string;
}): { provider: WhatsAppProviderMode; verified: boolean } | null {
  const provider = readProviderMode();
  if (provider === "none" || provider === "manual") return null;
  const secret = process.env["WHATSAPP_WEBHOOK_SECRET"];
  if (!secret) return null;
  // Real signature verification is provider-specific (Meta uses HMAC-SHA256
  // of the raw body keyed by the app secret; Twilio uses an X-Twilio-Signature
  // header). Until a provider is actually wired we always return `false` so
  // unsigned/spoofed webhooks are rejected, never accepted.
  return { provider, verified: false };
}

export type SendWhatsAppParams = {
  to: string;
  body: string;
};

export async function sendWhatsAppMessageIfPossible(
  params: SendWhatsAppParams,
): Promise<WhatsAppSendResult> {
  const status = getWhatsAppStatus();
  if (status.manualMode || !status.configured) {
    return {
      success: false,
      disabled: true,
      manualMode: status.manualMode,
      provider: status.provider,
      providerMessageId: null,
      errorMessage: status.manualMode
        ? "WhatsApp is in manual mode."
        : `WhatsApp provider \"${status.provider}\" missing required env vars.`,
    };
  }

  // Provider is selected and env vars are present, but no real send code is
  // wired up yet. Record as a no-op (NOT a fake success) so audit trails stay
  // honest and the admin sees the integration as "configured but not wired".
  const to = normalizeWhatsAppNumber(params.to);
  logger.info(
    { provider: status.provider, to: to ? to.slice(0, 4) + "***" : "" },
    "WhatsApp send requested but provider implementation is not wired yet — recording as manual",
  );
  return {
    success: false,
    disabled: true,
    manualMode: false,
    provider: status.provider,
    providerMessageId: null,
    errorMessage:
      "WhatsApp provider configured but send implementation is not wired yet.",
  };
}
