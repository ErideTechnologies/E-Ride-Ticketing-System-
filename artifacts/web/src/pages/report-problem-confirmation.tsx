import { Link, useSearch } from "wouter";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell } from "@/components/PublicShell";
import { PublicHero } from "@/components/PublicHero";

export default function ReportProblemConfirmationPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const ref = params.get("ref")?.trim() ?? "";

  return (
    <PublicShell data-testid="page-report-confirmation">
      <PublicHero
        title="Thank you."
        titleAccent="Received."
        subtitle="Our team will review your report and contact you if we need more information."
        showBackLink
        data-testid="hero-report-confirmation"
      />

      <div className="mx-auto w-full max-w-xl px-5 pb-16 sm:px-8">
        <div
          className="pd-card relative overflow-hidden rounded-3xl p-6 sm:p-8 text-center"
          data-testid="confirmation-card"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/40 to-transparent"
          />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#38BDF8]/30 bg-[#38BDF8]/[0.08]">
            <CheckCircle2 className="h-7 w-7 text-[#38BDF8]" />
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.24em] text-[#7B8694]">
            Reference
          </p>
          <p
            className="mt-2 font-mono text-xl font-semibold text-[#E5E7EB]"
            data-testid="text-ticket-reference"
          >
            {ref || "—"}
          </p>
          <p className="mt-4 text-sm text-[#B8C5D0]">
            Save this reference. We'll include it on every reply so you can
            track the conversation.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {ref && (
              <Button asChild data-testid="button-track-ticket">
                <Link href={`/help/ticket/${encodeURIComponent(ref)}`}>
                  Track this ticket
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              asChild
              data-testid="button-report-another"
            >
              <Link href="/help/report-problem">Report another problem</Link>
            </Button>
            <Button
              variant="outline"
              asChild
              data-testid="button-back-to-help"
            >
              <Link href="/help">Back to Help</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
