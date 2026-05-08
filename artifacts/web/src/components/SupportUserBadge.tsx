import { useState } from "react";
import { useLocation } from "wouter";
import { useSupportAuth } from "./SupportAuthProvider";
import { SUPPORT_ROLE_LABELS } from "@/lib/supportAuth";
import { Button } from "@/components/ui/button";

export function SupportUserBadge({
  className,
}: {
  className?: string;
}) {
  const { user, logout } = useSupportAuth();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const roleLabel = SUPPORT_ROLE_LABELS[user.role];
  return (
    <div
      className={`flex items-center gap-2 text-xs text-slate-600 ${className ?? ""}`}
      data-testid="support-user-badge"
    >
      <span className="hidden sm:inline">Signed in as</span>
      <span className="font-medium text-slate-900 truncate max-w-[14rem]">
        {user.name || user.email}
      </span>
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700">
        {roleLabel}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await logout();
          setBusy(false);
          navigate("/admin/support/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
