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

export const SUPPORT_ROLE_LABELS: Record<SupportRole, string> = {
  support_admin: "Support admin",
  support_agent: "Support agent",
  product_owner: "Product owner",
  developer: "Developer",
  qa_verifier: "QA verifier",
  viewer: "Viewer",
  reporter: "Ticket reporter",
};

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

export interface SupportSessionUser {
  email: string;
  name: string;
  role: SupportRole;
}

export interface SupportAuthState {
  authenticated: boolean;
  user: SupportSessionUser | null;
  permissions: SupportPermission[];
  loginConfigured: boolean;
}

const ROLE_PERMISSIONS: Record<SupportRole, ReadonlyArray<SupportPermission>> =
  {
    support_admin: SUPPORT_PERMISSIONS,
    support_agent: [
      "view_dashboard",
      "edit_ticket",
      "send_email",
      "manage_attachments",
      "manage_workflow",
    ],
    product_owner: [
      "view_dashboard",
      "edit_ticket",
      "send_email",
      "manage_attachments",
      "manage_workflow",
      "create_linear_issue",
      "manage_linear_link",
      "manage_sentry_link",
    ],
    developer: [
      "view_dashboard",
      "edit_ticket",
      "manage_linear_link",
      "manage_sentry_link",
      "manage_workflow",
    ],
    qa_verifier: ["view_dashboard", "edit_ticket", "manage_workflow"],
    viewer: ["view_dashboard"],
    reporter: [],
  };

export function roleHasPermission(
  role: SupportRole,
  permission: SupportPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function userHasPermission(
  user: SupportSessionUser | null | undefined,
  permission: SupportPermission,
): boolean {
  if (!user) return false;
  return roleHasPermission(user.role, permission);
}
