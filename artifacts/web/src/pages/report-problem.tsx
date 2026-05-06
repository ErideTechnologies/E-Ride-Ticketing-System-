import { useState } from "react";
import { Link } from "wouter";
import {
  useListPublicSupportProducts,
  useCreateSupportTicket,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  CATEGORY_OPTIONS,
  REPORTER_TYPE_OPTIONS,
} from "@/lib/supportOptions";

type FormState = {
  productId: string;
  reporterName: string;
  reporterEmail: string;
  reporterWhatsapp: string;
  reporterType: string;
  category: string;
  pageOrStep: string;
  applicationReference: string;
  accountReference: string;
  issueSummary: string;
  whatWereYouTryingToDo: string;
  whatWentWrong: string;
  deviceType: string;
  browser: string;
  canContact: boolean;
};

const EMPTY_FORM: FormState = {
  productId: "",
  reporterName: "",
  reporterEmail: "",
  reporterWhatsapp: "",
  reporterType: "",
  category: "",
  pageOrStep: "",
  applicationReference: "",
  accountReference: "",
  issueSummary: "",
  whatWereYouTryingToDo: "",
  whatWentWrong: "",
  deviceType: "",
  browser: "",
  canContact: true,
};

type Confirmation = {
  ticketReference: string;
  productName: string;
};

export default function ReportProblemPage() {
  const products = useListPublicSupportProducts();
  const createTicket = useCreateSupportTicket();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitError(null);
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.productId) next.productId = "Please choose a product.";
    if (!form.reporterName.trim()) next.reporterName = "Your name is required.";
    if (!form.reporterType) next.reporterType = "Please select an option.";
    if (!form.category) next.category = "Please choose a category.";
    if (!form.issueSummary.trim())
      next.issueSummary = "Give us a short summary of the issue.";
    if (!form.whatWentWrong.trim())
      next.whatWentWrong = "Please tell us what went wrong.";
    if (!form.reporterEmail.trim() && !form.reporterWhatsapp.trim()) {
      next.reporterEmail =
        "Provide an email address or a WhatsApp number so we can reply.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    try {
      const result = await createTicket.mutateAsync({
        data: {
          productId: form.productId,
          reporterName: form.reporterName.trim(),
          reporterEmail: form.reporterEmail.trim() || null,
          reporterWhatsapp: form.reporterWhatsapp.trim() || null,
          reporterType: form.reporterType as never,
          category: form.category as never,
          pageOrStep: form.pageOrStep.trim() || null,
          applicationReference: form.applicationReference.trim() || null,
          accountReference: form.accountReference.trim() || null,
          issueSummary: form.issueSummary.trim(),
          whatWereYouTryingToDo: form.whatWereYouTryingToDo.trim() || null,
          whatWentWrong: form.whatWentWrong.trim(),
          deviceType: form.deviceType.trim() || null,
          browser: form.browser.trim() || null,
          canContact: form.canContact,
        },
      });
      setConfirmation({
        ticketReference: result.ticketReference,
        productName: result.productName,
      });
    } catch (err) {
      console.error(err);
      setSubmitError(
        "We could not submit your report. Please check the form and try again.",
      );
    }
  }

  function startNewReport() {
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
    setConfirmation(null);
  }

  if (confirmation) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <Card data-testid="confirmation-card">
            <CardHeader className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Thank you. Your issue has been received.</CardTitle>
              <CardDescription>
                Our team will review it and contact you if we need more
                information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-background p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Reference
                </p>
                <p
                  className="mt-1 font-mono text-lg font-semibold"
                  data-testid="text-ticket-reference"
                >
                  {confirmation.ticketReference}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Product: {confirmation.productName}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  onClick={startNewReport}
                  data-testid="button-report-another"
                >
                  Report another problem
                </Button>
                <Button
                  variant="outline"
                  asChild
                  data-testid="button-back-to-help"
                >
                  <Link href="/help">Back to Help</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Eride Support</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Report a Problem
          </h1>
          <p className="text-muted-foreground">
            Tell us what went wrong. Our team will review your report and
            contact you if we need more information.
          </p>
        </header>

        <Card>
          <CardContent className="pt-6">
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
              noValidate
              data-testid="form-report-problem"
            >
              <Field
                label="Which product is this about?"
                required
                error={errors.productId}
              >
                <Select
                  value={form.productId}
                  onValueChange={(v) => update("productId", v)}
                  disabled={products.isLoading}
                >
                  <SelectTrigger data-testid="select-product">
                    <SelectValue
                      placeholder={
                        products.isLoading ? "Loading…" : "Select a product"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(products.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {products.isError && (
                  <p className="text-sm text-destructive">
                    Could not load products. Please refresh the page.
                  </p>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Your name"
                  required
                  error={errors.reporterName}
                >
                  <Input
                    value={form.reporterName}
                    onChange={(e) => update("reporterName", e.target.value)}
                    autoComplete="name"
                    data-testid="input-reporter-name"
                  />
                </Field>
                <Field
                  label="You are a…"
                  required
                  error={errors.reporterType}
                >
                  <Select
                    value={form.reporterType}
                    onValueChange={(v) => update("reporterType", v)}
                  >
                    <SelectTrigger data-testid="select-reporter-type">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORTER_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Email address"
                  hint="Required unless you provide a WhatsApp number."
                  error={errors.reporterEmail}
                >
                  <Input
                    type="email"
                    value={form.reporterEmail}
                    onChange={(e) => update("reporterEmail", e.target.value)}
                    autoComplete="email"
                    data-testid="input-reporter-email"
                  />
                </Field>
                <Field label="WhatsApp number" hint="Optional.">
                  <Input
                    value={form.reporterWhatsapp}
                    onChange={(e) => update("reporterWhatsapp", e.target.value)}
                    autoComplete="tel"
                    data-testid="input-reporter-whatsapp"
                  />
                </Field>
              </div>

              <Field
                label="What kind of issue is this?"
                required
                error={errors.category}
              >
                <Select
                  value={form.category}
                  onValueChange={(v) => update("category", v)}
                >
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label="Short summary"
                required
                hint="One sentence describing the problem."
                error={errors.issueSummary}
              >
                <Input
                  value={form.issueSummary}
                  onChange={(e) => update("issueSummary", e.target.value)}
                  data-testid="input-issue-summary"
                />
              </Field>

              <Field
                label="What were you trying to do?"
                hint="Optional."
              >
                <Textarea
                  value={form.whatWereYouTryingToDo}
                  onChange={(e) =>
                    update("whatWereYouTryingToDo", e.target.value)
                  }
                  rows={3}
                  data-testid="input-what-trying"
                />
              </Field>

              <Field
                label="What went wrong?"
                required
                error={errors.whatWentWrong}
              >
                <Textarea
                  value={form.whatWentWrong}
                  onChange={(e) => update("whatWentWrong", e.target.value)}
                  rows={4}
                  data-testid="input-what-went-wrong"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Page or step where it happened" hint="Optional.">
                  <Input
                    value={form.pageOrStep}
                    onChange={(e) => update("pageOrStep", e.target.value)}
                    data-testid="input-page-or-step"
                  />
                </Field>
                <Field label="Application reference" hint="Optional.">
                  <Input
                    value={form.applicationReference}
                    onChange={(e) =>
                      update("applicationReference", e.target.value)
                    }
                    data-testid="input-application-reference"
                  />
                </Field>
                <Field label="Account reference" hint="Optional.">
                  <Input
                    value={form.accountReference}
                    onChange={(e) => update("accountReference", e.target.value)}
                    data-testid="input-account-reference"
                  />
                </Field>
                <Field label="Device" hint="Optional. e.g. iPhone, Windows laptop.">
                  <Input
                    value={form.deviceType}
                    onChange={(e) => update("deviceType", e.target.value)}
                    data-testid="input-device"
                  />
                </Field>
                <Field label="Browser" hint="Optional.">
                  <Input
                    value={form.browser}
                    onChange={(e) => update("browser", e.target.value)}
                    data-testid="input-browser"
                  />
                </Field>
              </div>

              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="canContact"
                  checked={form.canContact}
                  onCheckedChange={(v) => update("canContact", v === true)}
                  data-testid="checkbox-can-contact"
                />
                <Label
                  htmlFor="canContact"
                  className="text-sm font-normal leading-snug"
                >
                  It's okay for the Eride support team to contact me about this
                  report.
                </Label>
              </div>

              <p className="text-xs text-muted-foreground">
                Please do not upload or include sensitive documents unless
                requested by support. Do not include passwords or payment card
                details.
              </p>

              {submitError && (
                <Alert variant="destructive" data-testid="alert-submit-error">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  asChild
                  data-testid="button-cancel"
                >
                  <Link href="/help">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={createTicket.isPending}
                  data-testid="button-submit"
                >
                  {createTicket.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Submit report
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
