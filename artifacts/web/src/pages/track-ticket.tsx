import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, Loader2, Search } from "lucide-react";
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
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-medium text-primary">Eride Support</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Track Your Support Ticket
          </h1>
          <p className="text-muted-foreground">
            Enter your ticket reference and contact email or WhatsApp number to
            view the latest public status.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Find your ticket</CardTitle>
            <CardDescription>
              Use the reference we sent when you submitted the report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onSubmit}
              className="space-y-5"
              noValidate
              data-testid="form-track-ticket"
            >
              <div className="space-y-1.5">
                <Label htmlFor="track-ticket-reference">
                  Ticket reference <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="track-ticket-reference"
                  value={ticketReference}
                  onChange={(e) => setTicketReference(e.target.value)}
                  placeholder="e.g. ER1-SUP-2026-000123"
                  data-testid="input-track-ticket-reference"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="track-contact-email">Email address</Label>
                <Input
                  id="track-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  autoComplete="email"
                  data-testid="input-track-contact-email"
                />
                <p className="text-xs text-muted-foreground">
                  Use the email you submitted with your report.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="track-contact-whatsapp">
                  Or WhatsApp number
                </Label>
                <Input
                  id="track-contact-whatsapp"
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                  autoComplete="tel"
                  data-testid="input-track-contact-whatsapp"
                />
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

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild>
                  <Link href="/help">Back to Help</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="button-track-ticket-submit"
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  View ticket
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Don't have a reference?{" "}
          <Link
            href="/help/report-problem"
            className="underline underline-offset-2"
          >
            Report a new problem
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
