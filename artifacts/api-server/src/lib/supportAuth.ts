import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

export const SUPPORT_ROLES = [
  "support_admin",
  "support_agent",
  "product_owner",
  "developer",
  "qa_verifier",
  "viewer",
  "reporter",
] as const;

export type SupportRole = (typeof SUPPORT_ROLES)[number];

export const SUPPORT_PERMISSIONS = [
  "view_dashboard",
  "edit_ticket",
  "send_email",
  "manage_attachments",
  "manage_workflow",
  "manage_workflow_admin_outcomes",
  "create_linear_issue",
  "manage_linear_link",
  "manage_sentry_link",
  "manage_settings",
  "manage_templates",
] as const;

export type SupportPermission = (typeof SUPPORT_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<SupportRole, ReadonlySet<SupportPermission>> = {
  support_admin: new Set(SUPPORT_PERMISSIONS),
  support_agent: new Set([
    "view_dashboard",
    "edit_ticket",
    "send_email",
    "manage_attachments",
    "manage_workflow",
  ]),
  product_owner: new Set([
    "view_dashboard",
    "edit_ticket",
    "send_email",
    "manage_attachments",
    "manage_workflow",
    "create_linear_issue",
    "manage_linear_link",
    "manage_sentry_link",
  ]),
  developer: new Set([
    "view_dashboard",
    "edit_ticket",
    "manage_linear_link",
    "manage_sentry_link",
    "manage_workflow",
  ]),
  qa_verifier: new Set([
    "view_dashboard",
    "edit_ticket",
    "manage_workflow",
  ]),
  viewer: new Set(["view_dashboard"]),
  reporter: new Set([]),
};

export function roleHasPermission(
  role: SupportRole,
  permission: SupportPermission,
): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: SupportRole): SupportPermission[] {
  return Array.from(ROLE_PERMISSIONS[role]);
}

export interface SupportSessionUser {
  email: string;
  name: string;
  role: SupportRole;
}

const ROLE_ENV_KEYS: Record<SupportRole, string> = {
  support_admin: "SUPPORT_ADMIN_EMAILS",
  support_agent: "SUPPORT_AGENT_EMAILS",
  product_owner: "SUPPORT_PRODUCT_OWNER_EMAILS",
  developer: "SUPPORT_DEVELOPER_EMAILS",
  qa_verifier: "SUPPORT_QA_EMAILS",
  viewer: "SUPPORT_VIEWER_EMAILS",
  reporter: "SUPPORT_REPORTER_EMAILS",
};

function parseEmailList(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function lookupRoleForEmail(email: string): SupportRole | null {
  const lower = email.trim().toLowerCase();
  if (!lower) return null;
  // Highest-privilege wins if present in multiple lists.
  for (const role of SUPPORT_ROLES) {
    const set = parseEmailList(process.env[ROLE_ENV_KEYS[role]]);
    if (set.has(lower)) return role;
  }
  return null;
}

let devSecretWarned = false;
function getSessionSecret(): string {
  const secret =
    process.env.SUPPORT_AUTH_SECRET || process.env.SESSION_SECRET || "";
  if (secret) return secret;
  if (!devSecretWarned) {
    devSecretWarned = true;
    logger.warn(
      "No SUPPORT_AUTH_SECRET / SESSION_SECRET set; using ephemeral dev secret. Sessions will not survive a server restart and this MUST be replaced before production.",
    );
  }
  // Ephemeral per-process random secret so we still HMAC something.
  if (!ephemeralDevSecret) ephemeralDevSecret = randomBytes(32).toString("hex");
  return ephemeralDevSecret;
}
let ephemeralDevSecret: string | null = null;

const SESSION_COOKIE = "support_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

function encodeToken(user: SupportSessionUser, expMs: number): string {
  const body = Buffer.from(
    JSON.stringify({ e: user.email, n: user.name, exp: expMs }),
    "utf8",
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeToken(token: string): SupportSessionUser | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(body))) return null;
  let parsed: { e?: string; n?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed.e || typeof parsed.exp !== "number") return null;
  if (Date.now() > parsed.exp) return null;
  const role = lookupRoleForEmail(parsed.e);
  if (!role) return null;
  return { email: parsed.e, name: parsed.n || parsed.e, role };
}

export function getCurrentSupportUser(req: Request): SupportSessionUser | null {
  // Support both signed cookie and Bearer header (handy for tests/curl).
  const headerAuth = req.headers.authorization;
  if (headerAuth && headerAuth.toLowerCase().startsWith("bearer ")) {
    const tok = headerAuth.slice(7).trim();
    const u = decodeToken(tok);
    if (u) return u;
  }
  const cookieHeader = req.headers.cookie || "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      return decodeToken(decodeURIComponent(rest.join("=")));
    }
  }
  return null;
}

export function setSupportSessionCookie(
  res: Response,
  user: SupportSessionUser,
): { token: string; expiresAt: Date } {
  const expMs = Date.now() + SESSION_TTL_MS;
  const token = encodeToken(user, expMs);
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
  return { token, expiresAt: new Date(expMs) };
}

export function clearSupportSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function verifyLoginPassword(
  password: string,
  role: SupportRole,
): boolean {
  const expected =
    role === "reporter"
      ? process.env.SUPPORT_REPORTER_PASSWORD || ""
      : process.env.SUPPORT_AUTH_PASSWORD || "";
  if (!expected || !password) return false;
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isLoginConfigured(): boolean {
  return Boolean(
    process.env.SUPPORT_AUTH_PASSWORD || process.env.SUPPORT_REPORTER_PASSWORD,
  );
}

// ---- Express middleware ----

export function requireSupportAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = getCurrentSupportUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as Request & { supportUser?: SupportSessionUser }).supportUser = user;
  next();
}

export function requireSupportRole(allowed: ReadonlyArray<SupportRole>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getCurrentSupportUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!allowed.includes(user.role)) {
      res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
      return;
    }
    (req as Request & { supportUser?: SupportSessionUser }).supportUser = user;
    next();
  };
}

export function requireSupportPermission(permission: SupportPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getCurrentSupportUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roleHasPermission(user.role, permission)) {
      res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
      return;
    }
    (req as Request & { supportUser?: SupportSessionUser }).supportUser = user;
    next();
  };
}

// Public-path matcher used by the global guard.
// NOTE: Paths here are RELATIVE to the router's mount point (`/api`), so they
// start with `/support/...`, not `/api/support/...`.
const PUBLIC_PATH_MATCHERS: Array<(method: string, path: string) => boolean> = [
  (m, p) => m === "GET" && p === "/support/products",
  (m, p) => m === "POST" && p === "/support/tickets",
  (_m, p) => p.startsWith("/support/public/"),
  (m, p) => m === "GET" && p === "/_sentry-test",
  (m, p) => m === "GET" && p === "/healthz",
  // Auth endpoints themselves
  (m, p) => m === "POST" && p === "/support/auth/login",
  (m, p) => m === "POST" && p === "/support/auth/logout",
  (m, p) => m === "GET" && p === "/support/auth/me",
];

export function isPublicSupportPath(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return PUBLIC_PATH_MATCHERS.some((fn) => fn(m, path));
}

// Express matches trailing-slash variants (`/support/tickets/`) by default, but
// the public/permission matchers use anchored regexes (`^/support/tickets$`).
// Without normalization a reporter could bypass authorization by appending a
// trailing slash. Collapse trailing slashes (keep root) before matching.
function normalizeSupportPath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.replace(/\/+$/, "") || "/";
  }
  return path;
}

// Declarative permission table for protected routes. Paths are relative to
// the /api mount; `:param` segments match a single non-slash component.
// First-match-wins. Routes not listed here only require authentication
// (handled by the auth guard above) — no extra permission check.
type PermRule = {
  method: string;
  pattern: RegExp;
  permission: SupportPermission;
};
function rule(
  method: string,
  pathTemplate: string,
  permission: SupportPermission,
): PermRule {
  // Convert `/support/tickets/:id/...` → regex matching one path segment per :param
  const escaped = pathTemplate
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "[^/]+");
  return { method, pattern: new RegExp(`^${escaped}$`), permission };
}

const PERMISSION_RULES: PermRule[] = [
  // Dashboard reads: any internal ticket/dashboard data requires view_dashboard.
  // Reporters (ticket-logging users) have no permissions and are blocked here,
  // while still using the public /support/public/* + POST /support/tickets flow.
  rule("GET", "/support/wallboard", "view_dashboard"),
  rule("GET", "/support/sla-summary", "view_dashboard"),
  rule("GET", "/support/tickets", "view_dashboard"),
  rule("GET", "/support/tickets/:id", "view_dashboard"),
  rule("GET", "/support/tickets/:id/notes", "view_dashboard"),
  rule("GET", "/support/tickets/:id/messages", "view_dashboard"),
  rule("GET", "/support/tickets/:id/status-history", "view_dashboard"),
  rule("GET", "/support/tickets/:id/linear-link", "view_dashboard"),
  rule("GET", "/support/tickets/:id/sentry-links", "view_dashboard"),
  rule("GET", "/support/tickets/:id/attachments", "view_dashboard"),
  rule(
    "GET",
    "/support/tickets/:id/attachments/:attachmentId",
    "view_dashboard",
  ),
  rule("GET", "/support/integrations/linear/status", "view_dashboard"),
  // Settings + templates: support_admin only (reads + writes)
  rule("GET", "/support/settings", "manage_settings"),
  rule("PATCH", "/support/settings", "manage_settings"),
  // Integrations status + admin-only test actions
  rule("GET", "/support/integrations/status", "manage_settings"),
  rule("POST", "/support/integrations/email/test", "manage_settings"),
  rule("GET", "/support/templates", "manage_templates"),
  rule("GET", "/support/templates/:id", "manage_templates"),
  rule("PATCH", "/support/templates/:id", "manage_templates"),
  rule("POST", "/support/templates/preview", "manage_templates"),
  // Linear API + link management
  rule(
    "POST",
    "/support/tickets/:id/create-linear-issue",
    "create_linear_issue",
  ),
  rule("POST", "/support/tickets/:id/linear-link", "manage_linear_link"),
  rule("DELETE", "/support/tickets/:id/linear-link", "manage_linear_link"),
  // Sentry link management
  rule("POST", "/support/tickets/:id/sentry-links", "manage_sentry_link"),
  rule(
    "DELETE",
    "/support/tickets/:id/sentry-links/:sentryLinkId",
    "manage_sentry_link",
  ),
  // Email sending
  rule("POST", "/support/tickets/:id/send-email", "send_email"),
  // Attachments (admin) — upload & delete require manage_attachments
  rule("POST", "/support/tickets/:id/attachments", "manage_attachments"),
  rule(
    "DELETE",
    "/support/tickets/:id/attachments/:attachmentId",
    "manage_attachments",
  ),
  // Ticket editing
  rule("PATCH", "/support/tickets/:id", "edit_ticket"),
  rule("POST", "/support/tickets/:id/notes", "edit_ticket"),
  rule("POST", "/support/tickets/:id/messages", "edit_ticket"),
  // Workflow action
  rule("POST", "/support/tickets/:id/workflow-action", "manage_workflow"),
  // One-time maintenance: purge all tickets (admin only; also env-flag gated)
  rule("POST", "/support/admin/purge-tickets", "manage_settings"),
];

export function supportPermissionGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const path = normalizeSupportPath(req.path);
  if (!path.startsWith("/support")) return next();
  if (isPublicSupportPath(req.method, path)) return next();
  const matched = PERMISSION_RULES.find(
    (r) => r.method === req.method.toUpperCase() && r.pattern.test(path),
  );
  if (!matched) return next();
  const user =
    (req as Request & { supportUser?: SupportSessionUser }).supportUser ??
    getCurrentSupportUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!roleHasPermission(user.role, matched.permission)) {
    res
      .status(403)
      .json({ error: "You do not have permission to perform this action" });
    return;
  }
  next();
}

export function supportAuthGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Only guard /support/* (paths are relative to the /api mount point).
  const path = normalizeSupportPath(req.path);
  if (!path.startsWith("/support")) return next();
  if (isPublicSupportPath(req.method, path)) return next();
  const user = getCurrentSupportUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as Request & { supportUser?: SupportSessionUser }).supportUser = user;
  next();
}
