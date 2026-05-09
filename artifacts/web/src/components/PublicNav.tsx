import { Link, useLocation } from "wouter";

const NAV_ITEMS = [
  { label: "Help", href: "/help" },
  { label: "Report", href: "/help/report-problem" },
  { label: "Track", href: "/help/track-ticket" },
] as const;

export function PublicNav() {
  const [location] = useLocation();
  return (
    <header
      className="relative z-20 border-b border-white/[0.06] bg-black/60 backdrop-blur-md"
      data-testid="public-nav"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <Link
          href="/help"
          className="flex items-center gap-3"
          data-testid="link-public-nav-logo"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-[#0B1218] to-[#03080C]">
            <span className="absolute inset-1 rounded-full border border-white/[0.06]" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#7B8694]">
              Eride
            </span>
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-[#E5E7EB]">
              Support
            </span>
          </span>
        </Link>

        <nav
          aria-label="Public support sections"
          className="hidden items-center gap-8 sm:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              location === item.href ||
              (item.href === "/help" && location.startsWith("/help/ticket"));
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`link-public-nav-${item.label.toLowerCase()}`}
                className={`font-mono text-[12px] uppercase tracking-[0.24em] transition-colors ${
                  active
                    ? "text-[#E5E7EB]"
                    : "text-[#7B8694] hover:text-[#E5E7EB]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-[#7B8694]"
          data-testid="public-nav-live"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#38BDF8] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#38BDF8]" />
          </span>
          <span className="text-[#B8C5D0]">Live</span>
        </div>
      </div>
    </header>
  );
}
