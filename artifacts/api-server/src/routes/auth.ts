import { Router, type IRouter } from "express";
import {
  clearSupportSessionCookie,
  getCurrentSupportUser,
  isLoginConfigured,
  lookupRoleForEmail,
  permissionsForRole,
  setSupportSessionCookie,
  verifyLoginPassword,
} from "../lib/supportAuth";
import { recordSupportAuditLog } from "../lib/supportAudit";

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
    name?: unknown;
  };
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : email;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }
  if (!isLoginConfigured()) {
    res.status(503).json({
      error:
        "Internal sign-in is not configured. Set SUPPORT_AUTH_PASSWORD and the SUPPORT_*_EMAILS environment variables.",
    });
    return;
  }
  const role = lookupRoleForEmail(email);
  const passwordOk = verifyLoginPassword(password);
  if (!role || !passwordOk) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const user = { email, name, role };
  setSupportSessionCookie(res, user);
  void recordSupportAuditLog({
    action: "auth.login",
    actor: user,
    metadata: { ip: req.ip },
  });
  res.json({
    authenticated: true,
    user,
    permissions: permissionsForRole(role),
  });
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
