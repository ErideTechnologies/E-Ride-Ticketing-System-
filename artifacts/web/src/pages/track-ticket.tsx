import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowUpRight, Loader2 } from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { PublicHero } from "@/components/PublicHero";
import { storePublicTicketToken } from "@/lib/publicTicketAccess";

export default function TrackTicketPage() {
  const [, navigate] = useLocation();
  const [ticketReference, setTicketReference] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ref = ticketReference.trim();
    if (!ref) {
      setError("Please enter your ticket reference.");
      return;
    }
    if (!contactEmail.trim() && !contactWhatsapp.trim()) {
      setError(
        "Please provide the email or WhatsApp number you used when you submitted this ticket.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch("/api/support/public/verify-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketReference: ref,
          contactEmail: contactEmail.trim() || null,
          contactWhatsapp: contactWhatsapp.trim() || null,
        }),
      });
      if (!resp.ok) {
        setError("We could not verify this ticket. Please try again.");
        setSubmitting(false);
        return;
      }
      const data = (await resp.json()) as {
        success: boolean;
        ticketReference?: string;
        accessToken?: string;
        expiresAt?: string;
      };
      if (
        !data.success ||
        !data.accessToken ||
        !data.ticketReference ||
        !data.expiresAt
      ) {
        setError(
          "We could not verify this ticket. Please check your reference and contact details.",
        );
        setSubmitting(false);
        return;
      }
      storePublicTicketToken(data.ticketReference, {
        token: data.accessToken,
        expiresAt: data.expiresAt,
      });
      navigate(`/help/ticket/${encodeURIComponent(data.ticketReference)}`);
    } catch (err) {
      console.error(err);
      setError("We could not reach support right now. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <PublicShell data-testid="page-track-ticket">
      <PublicHero
        title="Track your"
        titleAccent="ticket"
        subtitle="Enter the reference and the email or WhatsApp number you used to report it."
        showBackLink
        data-testid="hero-track-ticket"
      />

      <div className="mx-auto w-full max-w-xl px-5 pb-16 sm:px-8">
        <div
          className="pd-card relative overflow-hidden rounded-3xl p-6 sm:p-8"
          data-testid="card-track-ticket"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/30 to-transparent"
          />

          <form
            onSubmit={onSubmit}
            className="space-y-6"
            noValidate
            data-testid="form-track-ticket"
          >
            <div className="space-y-2">
              <Label htmlFor="track-ticket-reference">Ticket reference</Label>
              <Input
                id="track-ticket-reference"
                value={ticketReference}
                onChange={(e) => setTicketReference(e.target.value)}
                placeholder="ER1-SUP-2026-000123"
                data-testid="input-track-ticket-reference"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="track-contact-email">Email or WhatsApp</Label>
              <Input
                id="track-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                data-testid="input-track-contact-email"
              />
              <Input
                id="track-contact-whatsapp"
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
                autoComplete="tel"
                placeholder="or +14155552671"
                data-testid="input-track-contact-whatsapp"
              />
              <p className="text-[11px] text-[#7B8694]">
                Use the email or WhatsApp number you submitted with your
                report.
              </p>
            </div>

            {error && (
              <Alert
                variant="destructive"
                data-testid="alert-track-ticket-error"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                asChild
                data-testid="button-back-to-help"
              >
                <Link href="/help">Back to Help</Link>
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                data-testid="button-track-ticket-submit"
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                View ticket
                {!submitting && <ArrowUpRight className="ml-1 h-4 w-4" />}
              </Button>
            </div>

            <p className="text-center text-[11px] text-[#7B8694]">
              Don't have a reference?{" "}
              <Link
                href="/help/report-problem"
                className="text-[#7DD3FC] underline decoration-[#38BDF8]/40 underline-offset-4 hover:text-[#38BDF8]"
              >
                Report a new problem
              </Link>
              .
            </p>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}
