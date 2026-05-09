import { resolve } from "node:path";
import { isLinearEnabled, resolveLinearTeamId } from "./linearClient";
import { isSupportEmailEnabled, getSupportEmailFrom, getSupportEmailReplyTo } from "./supportEmail";
import { isLoginConfigured } from "./supportAuth";
import { getWhatsAppStatus } from "./supportWhatsApp";

/**
 * Internal-only integration status snapshot. Every field is safe to render in
 * the admin Integrations page — we expose configured/not-configured booleans,
 * provider names, and (where safe) defaults like the email From address. We
 * NEVER include secret values, API keys, tokens, or signing keys.
 */

export type EnvVarPresence = { name: string; configured: boolean };

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function envList(names: ReadonlyArray<string>): EnvVarPresence[] {
  return names.map((name) => ({ name, configured: envPresent(name) }));
}

export type IntegrationStatusCard = {
  /** Stable id for the UI. */
  key:
    | "auth"
    | "publicTicket"
    | "email"
    | "sentry"
    | "linear"
    | "whatsapp"
    | "attachments";
  /** Display label. */
  label: string;
  /** True when the integration has the minimum env vars to operate. */
  configured: boolean;
  /** When true, show the "fallback / disabled / manual" warning chip. */
  fallback: boolean;
  /** Required env vars + whether each is present. NEVER includes values. */
  requiredEnvVars: EnvVarPresence[];
  /** Optional env vars + presence. NEVER includes values. */
  optionalEnvVars: EnvVarPresence[];
  /** Short, human-readable, non-sensitive details (e.g. provider name, From address). */
  details: Record<string, string | boolean | number | null>;
};

export type IntegrationsStatusSnapshot = {
  generatedAt: string;
  cards: IntegrationStatusCard[];
};

function authCard(): IntegrationStatusCard {
  const required = envList(["SUPPORT_AUTH_PASSWORD"]);
  const roleLists = envList([
    "SUPPORT_ADMIN_EMAILS",
    "SUPPORT_AGENT_EMAILS",
    "SUPPORT_PRODUCT_OWNER_EMAILS",
    "SUPPORT_DEVELOPER_EMAILS",
    "SUPPORT_QA_EMAILS",
    "SUPPORT_VIEWER_EMAILS",
  ]);
  const optional = [
    { name: "SUPPORT_AUTH_SECRET", configured: envPresent("SUPPORT_AUTH_SECRET") },
    ...roleLists,
  ];
  const passwordOk = isLoginConfigured();
  const hasAdmin = envPresent("SUPPORT_ADMIN_EMAILS");
  return {
    key: "auth",
    label: "Internal authentication",
    configured: passwordOk && hasAdmin,
    fallback: !envPresent("SUPPORT_AUTH_SECRET"),
    requiredEnvVars: required,
    optionalEnvVars: optional,
    details: {
      hasAdminAllowlist: hasAdmin,
      hasIndependentSessionSecret: envPresent("SUPPORT_AUTH_SECRET"),
    },
  };
}

function publicTicketCard(): IntegrationStatusCard {
  const hasOwn = envPresent("SUPPORT_PUBLIC_TICKET_SECRET");
  const hasFallback = envPresent("SESSION_SECRET");
  return {
    key: "publicTicket",
    label: "Public ticket security",
    configured: hasOwn || hasFallback,
    fallback: !hasOwn && hasFallback,
    requiredEnvVars: envList(["SUPPORT_PUBLIC_TICKET_SECRET"]),
    optionalEnvVars: envList(["SESSION_SECRET"]),
    details: {
      hasDedicatedSecret: hasOwn,
      fallingBackToSessionSecret: !hasOwn && hasFallback,
      tokenTtlMinutes: 30,
    },
  };
}

function emailCard(): IntegrationStatusCard {
  const required = envList(["RESEND_API_KEY"]);
  const optional = envList(["SUPPORT_EMAIL_FROM", "SUPPORT_EMAIL_REPLY_TO"]);
  const enabled = isSupportEmailEnabled();
  return {
    key: "email",
    label: "Email (Resend)",
    configured: enabled,
    fallback: !enabled,
    requiredEnvVars: required,
    optionalEnvVars: optional,
    details: {
      provider: "resend",
      from: getSupportEmailFrom(),
      replyTo: getSupportEmailReplyTo(),
      disabledMode: !enabled,
    },
  };
}

function sentryCard(): IntegrationStatusCard {
  const apiDsn = envPresent("SENTRY_DSN_API");
  const webDsn = envPresent("VITE_SENTRY_DSN_WEB");
  const testEndpointEnabled = process.env["ENABLE_SENTRY_TEST_ENDPOINT"] === "true";
  return {
    key: "sentry",
    label: "Sentry",
    configured: apiDsn && webDsn,
    fallback: apiDsn !== webDsn, // only one side set
    requiredEnvVars: envList(["SENTRY_DSN_API", "VITE_SENTRY_DSN_WEB"]),
    optionalEnvVars: envList(["ENABLE_SENTRY_TEST_ENDPOINT"]),
    details: {
      backendConfigured: apiDsn,
      frontendConfigured: webDsn,
      testEndpointEnabled,
      // Surface this as a warning in the UI when true in production.
      testEndpointShouldBeOffInProd: testEndpointEnabled,
    },
  };
}

function linearCard(): IntegrationStatusCard {
  const enabled = isLinearEnabled();
  const products = ["EMA", "8BT", "ERD"] as const;
  const productMappings: Record<string, boolean> = {};
  for (const code of products) {
    productMappings[code] = Boolean(resolveLinearTeamId(code) && enabled);
  }
  const hasDefault = envPresent("LINEAR_DEFAULT_TEAM_ID");
  return {
    key: "linear",
    label: "Linear",
    configured: enabled && (hasDefault || products.some((c) => productMappings[c])),
    fallback: !enabled,
    requiredEnvVars: envList(["LINEAR_API_KEY"]),
    optionalEnvVars: envList([
      "LINEAR_TEAM_ID_EMA",
      "LINEAR_TEAM_ID_8BT",
      "LINEAR_TEAM_ID_ERD",
      "LINEAR_DEFAULT_TEAM_ID",
    ]),
    details: {
      hasDefaultTeam: hasDefault,
      productEMAConfigured: productMappings["EMA"] ?? false,
      product8BTConfigured: productMappings["8BT"] ?? false,
      productERDConfigured: productMappings["ERD"] ?? false,
    },
  };
}

function whatsappCard(): IntegrationStatusCard {
  const status = getWhatsAppStatus();
  return {
    key: "whatsapp",
    label: "WhatsApp",
    configured: status.configured,
    fallback: status.manualMode || (!status.configured && status.provider !== "none"),
    requiredEnvVars: [
      { name: "WHATSAPP_PROVIDER", configured: envPresent("WHATSAPP_PROVIDER") },
      ...status.requiredEnvVars,
    ],
    optionalEnvVars: envList([
      "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_WEBHOOK_SECRET",
    ]),
    details: {
      provider: status.provider,
      manualMode: status.manualMode,
      description: status.description,
    },
  };
}

function attachmentsCard(): IntegrationStatusCard {
  const customDir = process.env["SUPPORT_ATTACHMENTS_DIR"];
  const usingFallback = !customDir;
  // Surface only the resolved relative dir name, never the full absolute path,
  // to avoid leaking server filesystem layout in the UI.
  const resolved = resolve(customDir ?? "./.local-storage/attachments");
  const lastSegment = resolved.split(/[\\/]/).filter(Boolean).pop() ?? "attachments";
  return {
    key: "attachments",
    label: "Attachment storage",
    configured: true, // local storage always works; admin should know which mode
    fallback: usingFallback,
    requiredEnvVars: [],
    optionalEnvVars: envList(["SUPPORT_ATTACHMENTS_DIR"]),
    details: {
      mode: usingFallback ? "local-fallback" : "configured",
      directoryName: lastSegment,
      warning: usingFallback
        ? "Local fallback in use. In production, point SUPPORT_ATTACHMENTS_DIR at a persistent volume."
        : null,
    },
  };
}

export function getIntegrationsStatus(): IntegrationsStatusSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    cards: [
      authCard(),
      publicTicketCard(),
      emailCard(),
      sentryCard(),
      linearCard(),
      whatsappCard(),
      attachmentsCard(),
    ],
  };
}
