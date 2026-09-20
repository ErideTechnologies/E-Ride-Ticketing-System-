import { Router, type IRouter } from "express";
import { db, supportUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSupportSessionCookie,
  getCurrentSupportUser,
  isLoginConfigured,
  lookupRoleForEmail,
  permissionsForRole,
  setSupportSessionCookie,
  type SupportSessionUser,
  verifyLoginPassword,
} from "../lib/supportAuth";
import { recordSupportAuditLog } from "../lib/supportAudit";
import {
  hashSupportPassword,
  verifySupportPassword,
} from "../lib/supportPasswords";

const router: IRouter = Router();

router.get("/support/auth/me", (req, res): void => {
  const user = getCurrentSupportUser(req);
  if (!user) {
    res.status(200).json({
      authenticated: false,
      user: null,
      permissions: [],
      loginConfigured: isLoginConfigured(),
    });
    return;
  }
  res.json({
    authenticated: true,
    user,
    permissions: permissionsForRole(user.role),
    loginConfigured: isLoginConfigured(),
  });
});

router.post("/support/auth/login", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  const [account] = await db
    .select()
    .from(supportUsersTable)
    .where(eq(supportUsersTable.email, email))
    .limit(1);

  let user: SupportSessionUser | undefined;

  if (
    account &&
    account.active &&
    account.role === "support_admin" &&
    (await verifySupportPassword(password, account.passwordHash))
  ) {
    user = {
      email: account.email,
      name: `${account.firstName} ${account.surname}`.trim(),
      role: "support_admin",
    };
  } else if (!account) {
    const legacyRole = lookupRoleForEmail(email);
    const legacyPasswordOk = legacyRole
      ? verifyLoginPassword(password, legacyRole)
      : false;
    if (legacyRole && legacyPasswordOk) {
      user = { email, name: email, role: legacyRole };
    }
  }

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  setSupportSessionCookie(res, user);
  void recordSupportAuditLog({
    action: "auth.login",
    actor: user,
    metadata: { ip: req.ip },
  });
  res.json({
    authenticated: true,
    user,
    permissions: permissionsForRole(user.role),
  });
});

router.post("/support/auth/register", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as {
    firstName?: unknown;
    surname?: unknown;
    email?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
  };
  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const surname = typeof body.surname === "string" ? body.surname.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!firstName || !surname || !email || !password || !confirmPassword) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (firstName.length > 100 || surname.length > 100) {
    res.status(400).json({ error: "Name and surname must be 100 characters or less" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (password.length < 10) {
    res.status(400).json({ error: "Password must be at least 10 characters" });
    return;
  }
  if (password !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const passwordHash = await hashSupportPassword(password);
  try {
    const [account] = await db
      .insert(supportUsersTable)
      .values({
        firstName,
        surname,
        email,
        passwordHash,
        role: "support_admin",
      })
      .returning();

    const user = {
      email: account.email,
      name: `${account.firstName} ${account.surname}`.trim(),
      role: "support_admin" as const,
    };
    setSupportSessionCookie(res, user);
    void recordSupportAuditLog({
      action: "auth.register",
      actor: user,
      metadata: { ip: req.ip },
    });
    res.status(201).json({
      authenticated: true,
      user,
      permissions: permissionsForRole(user.role),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    throw error;
  }
});

router.post("/support/auth/logout", (req, res): void => {
  const user = getCurrentSupportUser(req);
  clearSupportSessionCookie(res);
  if (user) {
    void recordSupportAuditLog({ action: "auth.logout", actor: user });
  }
  res.json({ ok: true });
});

export default router;
