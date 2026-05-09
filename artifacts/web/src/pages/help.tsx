import { Link } from "wouter";
import {
  ArrowUpRight,
  LifeBuoy,
  Search,
  ShieldCheck,
  Hash,
  MessagesSquare,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { PublicHero } from "@/components/PublicHero";

const PRODUCTS = ["E-Migration Assist", "8Beauty", "Eride"] as const;

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    label: "Secure intake",
    description: "Encrypted submission, scoped access.",
  },
  {
    icon: Hash,
    label: "Tracked reference",
    description: "Unique ID for every report, end-to-end.",
  },
  {
    icon: MessagesSquare,
    label: "Two-way follow-up",
    description: "Email or WhatsApp. We close the loop.",
  },
] as const;

export default function HelpPage() {
  return (
    <PublicShell data-testid="page-help">
      <PublicHero
        title="How can"
        titleAccent="we help?"
        subtitle="Report an issue, track a ticket, and stay updated until resolution. One controlled, transparent thread between you and our team."
      />

      {/* ─── Action cards ──────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8" data-testid="section-action-cards">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Primary — Report a problem */}
          <Link
            href="/help/report-problem"
            data-testid="card-report-problem"
            className="group relative block overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0B1218] via-[#080D13] to-[#04080C] p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#38BDF8]/40 hover:shadow-[0_30px_60px_-30px_rgba(56,189,248,0.35)] sm:p-9"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#38BDF8] opacity-[0.10] blur-[80px] transition-opacity duration-300 group-hover:opacity-[0.20]"
            />
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/40 to-transparent"
            />

            <div className="relative flex items-start justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#38BDF8]/40 bg-[#38BDF8]/[0.08] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7DD3FC]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_6px_rgba(56,189,248,0.9)]" />
                Primary
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                <LifeBuoy className="h-5 w-5 text-[#38BDF8]" />
              </span>
            </div>

            <h2 className="relative mt-12 text-3xl font-semibold tracking-tight text-[#E5E7EB] sm:text-[2rem]">
              Report a problem
            </h2>
            <p className="relative mt-3 max-w-md text-sm leading-relaxed text-[#7B8694]">
              Tell us what happened. We assign a tracked reference and respond
              by email or WhatsApp.
            </p>

            <div className="relative mt-10 flex items-center justify-between border-t border-white/[0.06] pt-5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E5E7EB]">
                Start a report
                <ArrowUpRight className="h-4 w-4 text-[#38BDF8] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#7B8694]">
                ~ 60 seconds
              </span>
            </div>
          </Link>

          {/* Secondary — Track a ticket */}
          <Link
            href="/help/track-ticket"
            data-testid="card-track-ticket"
            className="group relative block overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0B1218] via-[#080D13] to-[#04080C] p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 sm:p-9"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
            />

            <div className="flex items-start justify-between">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7B8694]">
                Existing
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                <Search className="h-5 w-5 text-[#B8C5D0]" />
              </span>
            </div>

            <h2 className="mt-12 text-3xl font-semibold tracking-tight text-[#E5E7EB] sm:text-[2rem]">
              Track a ticket
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#7B8694]">
              Enter your reference and contact to view the latest status.
            </p>

            <div className="mt-10 flex items-center border-t border-white/[0.06] pt-5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E5E7EB]">
                Look up status
                <ArrowUpRight className="h-4 w-4 text-[#B8C5D0] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* ─── Trust strip ───────────────────────────────────────────────── */}
      <section className="mt-12 px-5 sm:mt-16 sm:px-8" data-testid="section-trust-strip">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/[0.06] bg-gradient-to-br from-[#0B1218]/80 to-[#04080C]/80 p-6 sm:p-8">
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {TRUST_ITEMS.map(({ icon: Icon, label, description }) => (
              <li key={label} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#38BDF8]/20 bg-[#38BDF8]/[0.06]">
                  <Icon className="h-4 w-4 text-[#38BDF8]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#E5E7EB]">
                    {label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#7B8694]">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Supported products ────────────────────────────────────────── */}
      <section
        className="mt-14 px-5 pb-12 sm:mt-20 sm:px-8 sm:pb-16"
        data-testid="section-products"
      >
        <div className="mx-auto max-w-6xl">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#7B8694]">
              Supported products
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#E5E7EB] sm:text-3xl">
              One support surface across the Eride suite
            </h2>
          </div>

          <ul
            className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
            data-testid="list-product-chips"
          >
            {PRODUCTS.map((product) => (
              <li
                key={product}
                className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#0B1218]/80 to-[#04080C]/80 p-5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#7B8694]">
                  Product
                </p>
                <p className="mt-2 text-base font-medium text-[#E5E7EB]">
                  {product}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </PublicShell>
  );
}
