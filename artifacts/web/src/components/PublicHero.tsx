import { Link } from "wouter";
import type { ReactNode } from "react";

type PublicHeroProps = {
  /** Plain leading portion of the headline, rendered in silver-white. */
  title: ReactNode;
  /** Optional accented tail of the headline, rendered in ice-blue. */
  titleAccent?: ReactNode;
  /** Optional supporting paragraph below the headline. */
  subtitle?: ReactNode;
  /** Small uppercase eyebrow above the title. Defaults to "Eride Support". */
  eyebrow?: string;
  /** Optional content rendered below the subtitle (badges, references, etc). */
  children?: ReactNode;
  /** Show a small "BACK TO HELP" link above the eyebrow. */
  showBackLink?: boolean;
  backHref?: string;
  backLabel?: string;
  /** data-testid for the hero root, useful in QA. */
  "data-testid"?: string;
  /** Hide the right-side LIVE indicator (used inside the verify panel etc). */
  hideLive?: boolean;
  /** Centre-align the eyebrow, title and subtitle (used on the help landing). */
  centered?: boolean;
};

/**
 * Cinematic hero used at the top of every public support page.
 *
 * Branding rule: public pages still surface as "Eride Support". The
 * `eyebrow` defaults to "Eride Support · Live" and callers should not
 * surface "Dogma" prominently; that name only appears as a small
 * footer attribution via <PublicFooter />.
 */
export function PublicHero({
  title,
  titleAccent,
  subtitle,
  eyebrow = "Eride Support",
  children,
  showBackLink = false,
  backHref = "/help",
  backLabel = "Back to Help",
  hideLive = false,
  centered = false,
  "data-testid": testId,
}: PublicHeroProps) {
  return (
    <section
      className="relative px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-14"
      data-testid={testId ?? "public-hero"}
    >
      <div className={`mx-auto max-w-6xl${centered ? " text-center" : ""}`}>
        {showBackLink && (
          <Link
            href={backHref}
            data-testid="link-hero-back"
            className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#7B8694] transition-colors hover:text-[#B8C5D0]"
          >
            <span aria-hidden className="h-px w-6 bg-current" />
            {backLabel}
          </Link>
        )}

        <p
          className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#38BDF8]"
          data-testid="hero-eyebrow"
        >
          {eyebrow}
          {!hideLive && (
            <span className="ml-3 text-[#7B8694]">· Live</span>
          )}
        </p>

        <h1
          className={`mt-5 max-w-4xl text-[2.25rem] font-semibold leading-[1.05] tracking-tight text-[#E5E7EB] sm:text-5xl lg:text-6xl${
            centered ? " mx-auto" : ""
          }`}
          data-testid="text-hero-title"
        >
          {title}
          {titleAccent && (
            <>
              {" "}
              <span className="bg-gradient-to-r from-[#38BDF8] via-[#7DD3FC] to-[#38BDF8] bg-clip-text text-transparent">
                {titleAccent}
              </span>
            </>
          )}
        </h1>

        {subtitle && (
          <p
            className={`mt-5 max-w-2xl text-base leading-relaxed text-[#94A3B8] sm:text-lg${
              centered ? " mx-auto" : ""
            }`}
          >
            {subtitle}
          </p>
        )}

        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
