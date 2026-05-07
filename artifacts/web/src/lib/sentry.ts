import * as Sentry from "@sentry/react";

let initialized = false;

const SENSITIVE_KEYS = new Set(
  [
    "email",
    "reporteremail",
    "whatsapp",
    "reporterwhatsapp",
    "phone",
    "phonenumber",
    "password",
    "passwd",
    "pass",
    "pwd",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "apikey",
    "authorization",
    "cookie",
    "setcookie",
    "sessionid",
    "session",
    "ssn",
    "creditcard",
    "cardnumber",
    "cvv",
    "whatwentwrong",
    "expectedbehaviour",
    "expectedbehavior",
    "stepstoreproduce",
    "additionalcontext",
    "reportername",
    "fullname",
    "firstname",
    "lastname",
    "address",
    "dob",
    "dateofbirth",
  ].map((k) => k.toLowerCase()),
);

const REDACTED = "[redacted]";

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function initSentry(): boolean {
  if (initialized) return true;
  const dsn = import.meta.env.VITE_SENTRY_DSN_WEB;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) {
        event.user = event.user.id ? { id: String(event.user.id) } : {};
      }
      if (event.request) {
        event.request = redact(event.request) as typeof event.request;
      }
      if (event.extra) {
        event.extra = redact(event.extra) as typeof event.extra;
      }
      if (event.contexts) {
        event.contexts = redact(event.contexts) as typeof event.contexts;
      }
      if (event.tags) {
        event.tags = redact(event.tags) as typeof event.tags;
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) {
        breadcrumb.data = redact(breadcrumb.data) as Record<string, unknown>;
      }
      return breadcrumb;
    },
  });
  initialized = true;
  return true;
}

export { Sentry };
