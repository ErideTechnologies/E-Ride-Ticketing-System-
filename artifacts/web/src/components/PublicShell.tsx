import type { ReactNode } from "react";
import { PublicNav } from "@/components/PublicNav";

type PublicShellProps = {
  children: ReactNode;
  "data-testid"?: string;
};

/**
 * Cinematic dark layout shell for the four public support routes.
 * Provides nav + footer chrome and an ambient radial glow.
 *
 * Privacy contract: this layout exposes ZERO ticket/internal/SLA data.
 * Pages opt in by rendering inside `<PublicShell>`. The `.public-dark`
 * class scopes form/card restyling so internal admin is unaffected.
 */
export function PublicShell({
  children,
  "data-testid": testId,
}: PublicShellProps) {
  return (
    <div
      className="public-dark relative flex min-h-screen flex-col overflow-x-clip"
      data-testid={testId ?? "public-shell"}
    >
      {/* Ambient hero glow — never covers content, always behind */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-15%] h-[36rem] w-[36rem] rounded-full bg-[#38BDF8] opacity-[0.05] blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[#5F7182] opacity-[0.05] blur-[120px]"
      />
      {/* Subtle horizontal hairline behind hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[18rem] hidden h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent sm:block"
      />

      <PublicNav />
      <main className="relative z-10 flex-1">{children}</main>
    </div>
  );
}
