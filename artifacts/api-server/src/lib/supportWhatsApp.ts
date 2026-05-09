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

  const to = normalizeWhatsAppNumber(params.to);
  if (!to) {
    return {
      success: false,
      disabled: false,
      manualMode: false,
      provider: status.provider,
      providerMessageId: null,
      errorMessage: "Invalid WhatsApp recipient number.",
    };
  }

  if (status.provider === "twilio") {
    return await sendViaTwilio({ to, body: params.body });
  }

  // Other providers (e.g. meta_cloud_api) are not wired yet — record as a
  // no-op (NOT a fake success) so audit trails stay honest.
  logger.info(
    { provider: status.provider, to: to.slice(0, 4) + "***" },
    "WhatsApp send requested but this provider implementation is not wired yet — recording as manual",
  );
  return {
    success: false,
    disabled: true,
    manualMode: false,
    provider: status.provider,
    providerMessageId: null,
    errorMessage: `WhatsApp provider \"${status.provider}\" is not wired yet.`,
  };
}

/**
 * Format a number into Twilio's `whatsapp:+E164` channel address. The
 * `WHATSAPP_FROM_NUMBER` env var may already be in `whatsapp:+...` form.
 */
function toTwilioChannelAddress(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("whatsapp:")) return trimmed;
  const normalized = normalizeWhatsAppNumber(trimmed);
  if (!normalized) return "";
  return `whatsapp:${normalized.startsWith("+") ? normalized : `+${normalized}`}`;
}

async function sendViaTwilio(params: {
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"]?.trim() ?? "";
  const authToken = process.env["TWILIO_AUTH_TOKEN"]?.trim() ?? "";
  const fromRaw =
    process.env["TWILIO_WHATSAPP_FROM"]?.trim() ||
    process.env["WHATSAPP_FROM_NUMBER"]?.trim() ||
    "";
  if (!accountSid || !authToken || !fromRaw) {
    return {
      success: false,
      disabled: true,
      manualMode: false,
      provider: "twilio",
      providerMessageId: null,
      errorMessage: "Twilio credentials missing.",
    };
  }

  const to = toTwilioChannelAddress(params.to);
  const from = toTwilioChannelAddress(fromRaw);
  if (!to || !from) {
    return {
      success: false,
      disabled: false,
      manualMode: false,
      provider: "twilio",
      providerMessageId: null,
      errorMessage: "Invalid Twilio WhatsApp from/to number.",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid,
  )}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({
    From: from,
    To: to,
    Body: params.body,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const providerMessage =
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { message?: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : null;
      const errMessage: string =
        providerMessage ?? `Twilio HTTP ${response.status}`;
      logger.warn(
        {
          provider: "twilio",
          status: response.status,
          to: to.slice(0, 12) + "***",
        },
        "Twilio WhatsApp send failed",
      );
      return {
        success: false,
        disabled: false,
        manualMode: false,
        provider: "twilio",
        providerMessageId: null,
        errorMessage: errMessage,
      };
    }

    const sid =
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { sid?: unknown }).sid === "string"
        ? (parsed as { sid: string }).sid
        : null;
    logger.info(
      { provider: "twilio", sid, to: to.slice(0, 12) + "***" },
      "Twilio WhatsApp send accepted",
    );
    return {
      success: true,
      disabled: false,
      manualMode: false,
      provider: "twilio",
      providerMessageId: sid,
      errorMessage: null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Twilio request failed";
    logger.warn(
      { provider: "twilio", err: message },
      "Twilio WhatsApp send threw",
    );
    return {
      success: false,
      disabled: false,
      manualMode: false,
      provider: "twilio",
      providerMessageId: null,
      errorMessage: message,
    };
  }
}
