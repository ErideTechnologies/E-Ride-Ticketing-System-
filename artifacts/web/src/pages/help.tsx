import { Link } from "wouter";
import {
  ArrowUpRight,
  LifeBuoy,
  ShieldCheck,
  Hash,
  MessagesSquare,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { PublicHero } from "@/components/PublicHero";

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
        centered
      />

      {/* ─── Action cards ──────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8" data-testid="section-action-cards">
        <div className="mx-auto grid max-w-xl grid-cols-1 gap-5">
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
              Create a support ticket
            </h2>

            <div className="relative mt-10 flex items-center justify-between border-t border-white/[0.06] pt-5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#E5E7EB]">
                Create ticket →
                <ArrowUpRight className="h-4 w-4 text-[#38BDF8] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#7B8694]">
                ~ 60 seconds
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
    </PublicShell>
  );
}
