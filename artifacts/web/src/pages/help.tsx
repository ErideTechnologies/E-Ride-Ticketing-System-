import { Link } from "wouter";
import {
  ArrowRight,
  LifeBuoy,
  Search,
  ShieldCheck,
  Hash,
  MessagesSquare,
} from "lucide-react";

const PRODUCTS = ["E-Migration Assist", "8Beauty", "Eride"] as const;

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    label: "Secure intake",
    description: "Encrypted submission",
  },
  {
    icon: Hash,
    label: "Tracked reference",
    description: "Unique ticket ID",
  },
  {
    icon: MessagesSquare,
    label: "Support follow-up",
    description: "Email or WhatsApp",
  },
] as const;

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0B0F14]">
      {/* ─── Cinematic dark hero ───────────────────────────────────────── */}
      <section
        className="relative isolate overflow-hidden bg-[#050505] text-[#E5E7EB]"
        data-testid="hero-help"
      >
        {/* Layered ambient glow — graphite pool with a single cool highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_15%,rgba(31,41,51,0.95),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-[#38BDF8] opacity-[0.08] blur-[110px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-[#5F7182] opacity-[0.10] blur-[90px]"
        />
        {/* Hairline at the very bottom of the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/50 to-transparent"
        />

        <div className="relative mx-auto max-w-5xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
          {/* Eyebrow */}
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#38BDF8] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#38BDF8]" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#94A3B8] sm:text-xs">
              Eride Support
            </span>
          </div>

          {/* Title + subtitle */}
          <h1
            className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-[#E5E7EB] sm:text-5xl lg:text-6xl"
            data-testid="text-hero-title"
          >
            How can we help?
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#94A3B8] sm:text-lg">
            Report an issue, track a ticket, and stay updated until resolution.
          </p>

          {/* Mobile inline meta — small system attribution */}
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#3B4652] bg-[#0B0F14]/60 px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#94A3B8] backdrop-blur-sm sm:text-[11px]">
            <span className="h-1 w-1 rounded-full bg-[#38BDF8]" />
            Powered by Eride Dogma
          </p>
        </div>
      </section>

      {/* ─── Action cards (overlap into hero on desktop) ───────────────── */}
      <section className="relative -mt-12 sm:-mt-16">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
            {/* Primary — Report a problem */}
            <Link
              href="/help/report-problem"
              data-testid="card-report-problem"
              className="group relative block overflow-hidden rounded-2xl border border-[#1F2933] bg-[#0B0F14] p-6 text-[#E5E7EB] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#38BDF8]/50 hover:shadow-[0_25px_50px_-20px_rgba(56,189,248,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC] sm:p-7"
            >
              {/* Top hairline accent */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/70 to-transparent"
              />
              {/* Soft corner glow on hover */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#38BDF8] opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-[0.18]"
              />

              <div className="relative flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#3B4652] bg-[#1F2933]">
                  <LifeBuoy className="h-5 w-5 text-[#38BDF8]" />
                </div>
                <span className="inline-flex items-center rounded-full bg-[#38BDF8]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#38BDF8] ring-1 ring-inset ring-[#38BDF8]/30">
                  Primary
                </span>
              </div>

              <h2 className="relative mt-5 text-xl font-semibold tracking-tight text-[#E5E7EB] sm:text-2xl">
                Report a problem
              </h2>
              <p className="relative mt-2 text-sm leading-relaxed text-[#94A3B8]">
                Submit a ticket and we'll respond with a tracked reference you
                can follow up with.
              </p>

              <div className="relative mt-6 flex items-center gap-2 text-sm font-semibold text-[#E5E7EB]">
                Start a report
                <ArrowRight className="h-4 w-4 text-[#38BDF8] transition-transform duration-200 group-hover:translate-x-1" />
              </div>
            </Link>

            {/* Secondary — Track an existing ticket */}
            <Link
              href="/help/track-ticket"
              data-testid="card-track-ticket"
              className="group relative block overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-6 text-[#0B0F14] shadow-[0_12px_30px_-18px_rgba(11,15,20,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#5F7182] hover:shadow-[0_18px_35px_-18px_rgba(11,15,20,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC] sm:p-7"
            >
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5F7182]/50 to-transparent"
              />

              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]">
                  <Search className="h-5 w-5 text-[#1F2933]" />
                </div>
                <span className="inline-flex items-center rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5F7182] ring-1 ring-inset ring-[#E5E7EB]">
                  Existing
                </span>
              </div>

              <h2 className="mt-5 text-xl font-semibold tracking-tight text-[#0B0F14] sm:text-2xl">
                Track an existing ticket
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5F7182]">
                Look up the latest status using your reference and the contact
                you submitted with.
              </p>

              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#1F2933]">
                Look up status
                <ArrowRight className="h-4 w-4 text-[#5F7182] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[#38BDF8]" />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Trust strip ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pt-10 sm:px-8 sm:pt-14">
        <div
          className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6"
          data-testid="section-trust-strip"
        >
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
            {TRUST_ITEMS.map(({ icon: Icon, label, description }) => (
              <li
                key={label}
                className="flex items-start gap-3 sm:flex-col sm:items-start sm:gap-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC]">
                  <Icon className="h-4 w-4 text-[#1F2933]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0B0F14]">
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs text-[#94A3B8]">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Product chips ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pt-8 sm:px-8 sm:pt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#94A3B8]">
          Supported products
        </p>
        <ul
          className="mt-3 flex flex-wrap gap-2"
          data-testid="list-product-chips"
        >
          {PRODUCTS.map((product) => (
            <li key={product}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1F2933] shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8]" />
                {product}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Footer attribution ────────────────────────────────────────── */}
      <footer className="mx-auto max-w-5xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16">
        <div className="flex flex-col items-start gap-1 border-t border-[#E5E7EB] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#94A3B8]">
            Powered by{" "}
            <span className="font-semibold text-[#1F2933]">
              Eride Dogma Support Centre
            </span>
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#94A3B8]">
            Structured support · Controlled resolution
          </p>
        </div>
      </footer>
    </main>
  );
}
