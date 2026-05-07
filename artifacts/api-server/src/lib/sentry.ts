import * as Sentry from "@sentry/node";
import { logger } from "./logger";

const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "email",
  "reporteremail",
  "reporterwhatsapp",
  "whatsappnumber",
  "whatsappnumberraw",
  "whatsappnumbercanonical",
  "fullname",
  "reportername",
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "idnumber",
  "passportnumber",
  "paymentcard",
  "cardnumber",
  "cvv",
  "details",
  "whatwentwrong",
  "authorization",
  "cookie",
  "set-cookie",
]);

function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env["SENTRY_DSN_API"];
  if (!dsn) {
    logger.info("Sentry not initialised: SENTRY_DSN_API is not set");
    return false;
  }
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      try {
        if (event.request) {
          event.request = redactValue(event.request) as typeof event.request;
        }
        if (event.contexts) {
          event.contexts = redactValue(event.contexts) as typeof event.contexts;
        }
        if (event.tags) {
          event.tags = redactValue(event.tags) as typeof event.tags;
        }
        if (event.extra) {
          event.extra = redactValue(event.extra) as typeof event.extra;
        }
        if (event.user) {
          event.user = { id: event.user.id };
        }
      } catch {
        /* never break Sentry pipeline */
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.data) {
        crumb.data = redactValue(crumb.data) as typeof crumb.data;
      }
      return crumb;
    },
  });
  initialized = true;
  logger.info("Sentry initialised for API server");
  return true;
}

export { Sentry };
