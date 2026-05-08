import { type ReactNode } from "react";
import { Link } from "wouter";
import { useSupportAuth } from "./SupportAuthProvider";
import {
  type SupportPermission,
  type SupportRole,
} from "@/lib/supportAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** If provided, user must hold one of these roles. */
  roles?: ReadonlyArray<SupportRole>;
  /** If provided, user must hold this permission (in addition to roles). */
  permission?: SupportPermission;
}

function RestrictedShell({
  title,
  message,
  showLogin,
}: {
  title: string;
  message: string;
  showLogin: boolean;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-700">{message}</p>
          <div className="flex flex-wrap gap-2">
            {showLogin && (
              <Button asChild>
                <Link to="/admin/support/login">Sign in</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/help">Back to help</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function RequireSupportAuth({ children, roles, permission }: Props) {
  const { authenticated, user, loading, hasPermission } = useSupportAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <RestrictedShell
        title="Access restricted"
        message="Please sign in with an authorised Eride support account to view this page."
        showLogin
      />
    );
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <RestrictedShell
        title="Permission required"
        message="You do not have permission to access this support area."
        showLogin={false}
      />
    );
  }

  if (permission && !hasPermission(permission)) {
    return (
      <RestrictedShell
        title="Permission required"
        message="You do not have permission to access this support area."
        showLogin={false}
      />
    );
  }

  return <>{children}</>;
}
