import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type PublicHeroProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small uppercase eyebrow text shown above the title. Defaults to "Eride Support". */
  eyebrow?: string;
  /** Optional content rendered below the subtitle (e.g. badges, ticket reference). */
  children?: ReactNode;
  /** Optional right-aligned slot (e.g. action buttons). */
  actions?: ReactNode;
  /** Centre-align the hero text (used on landing-style pages). */
  align?: "left" | "center";
  /** Show a "Back to Help" link on the left of the eyebrow row. */
  showBackLink?: boolean;
  /** Override the back link target/label. */
  backHref?: string;
  backLabel?: string;
  /** data-testid for the hero root, useful in QA. */
  "data-testid"?: string;
};

/**
 * Premium dark hero used at the top of every public support page.
 *
 * Branding rule: public pages still surface as "Eride Support" — the eyebrow
 * MUST default to "Eride Support" and callers should not surface "Dogma"
 * publicly. Visual styling uses the Dogma palette (Carbon #0B0F14 background,
 * Silver #E5E7EB text, Electric Ice Blue #38BDF8 accent line).
 */
export function PublicHero({
  title,
  subtitle,
  eyebrow = "Eride Support",
  children,
  actions,
  align = "left",
  showBackLink = false,
  backHref = "/help",
  backLabel = "Back to Help",
  "data-testid": testId,
}: PublicHeroProps) {
  const alignClass = align === "center" ? "text-center items-center" : "";
  return (
    <section
      className="relative isolate overflow-hidden bg-[#0B0F14] text-[#E5E7EB]"
      data-testid={testId ?? "public-hero"}
    >
      {/* Soft ice-blue radial glow in the corner — subtle premium accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-[#38BDF8] opacity-[0.12] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/60 to-transparent"
      />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        {showBackLink && (
          <div className="mb-6">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[#94A3B8] hover:text-[#E5E7EB] transition-colors"
              data-testid="link-hero-back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          </div>
        )}
        <div
          className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${align === "center" ? "sm:flex-col sm:items-center" : ""}`}
        >
          <div className={`flex flex-col gap-3 ${alignClass}`}>
            <div
              className={`inline-flex items-center gap-2 ${align === "center" ? "self-center" : "self-start"}`}
            >
              <span className="h-[2px] w-7 rounded-full bg-[#38BDF8]" />
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[#38BDF8]">
                {eyebrow}
              </span>
            </div>
            <h1
              className="text-3xl font-semibold tracking-tight text-[#E5E7EB] sm:text-4xl"
              data-testid="text-hero-title"
            >
              {title}
            </h1>
            {subtitle && (
              <p className="max-w-2xl text-sm text-[#94A3B8] sm:text-base">
                {subtitle}
              </p>
            )}
            {children && <div className="pt-1">{children}</div>}
          </div>
          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
