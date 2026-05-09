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
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Paperclip,
  ArrowUpRight,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { PublicHero } from "@/components/PublicHero";
import {
  CATEGORY_OPTIONS,
  REPORTER_TYPE_OPTIONS,
} from "@/lib/supportOptions";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HELP_TEXT,
  formatFileSize,
  validateAttachmentFile,
} from "@/lib/attachmentRules";

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
  attachmentUploadFailed?: boolean;
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
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  function handleSelectAttachment(file: File | null) {
    setAttachmentError(null);
    if (!file) {
      setAttachment(null);
      return;
    }
    const err = validateAttachmentFile(file);
    if (err) {
      setAttachment(null);
      setAttachmentError(err);
      return;
    }
    setAttachment(file);
  }

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
      let attachmentUploadFailed = false;
      if (attachment) {
        try {
          const fd = new FormData();
          fd.append("file", attachment);
          fd.append("uploadedByName", form.reporterName.trim() || "Reporter");
          if (form.reporterEmail.trim())
            fd.append("uploadedByEmail", form.reporterEmail.trim());
          fd.append("uploadedByRole", "reporter");
          const resp = await fetch(
            `/api/support/tickets/${result.id}/attachments`,
            { method: "POST", body: fd },
          );
          if (!resp.ok) attachmentUploadFailed = true;
        } catch {
          attachmentUploadFailed = true;
        }
      }
      setConfirmation({
        ticketReference: result.ticketReference,
        productName: result.productName,
        attachmentUploadFailed,
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
    setAttachment(null);
    setAttachmentError(null);
  }

  if (confirmation) {
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
              {confirmation.ticketReference}
            </p>
            <p className="mt-3 text-sm text-[#7B8694]">
              Product: {confirmation.productName}
            </p>

            {confirmation.attachmentUploadFailed && (
              <Alert
                variant="destructive"
                className="mt-6 text-left"
                data-testid="alert-attachment-failed"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Your ticket was created, but the attachment could not be
                  uploaded. Reference: {confirmation.ticketReference}. You can
                  send the screenshot to support later.
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
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
          </div>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell data-testid="page-report-problem">
      <PublicHero
        title="Report a"
        titleAccent="problem"
        subtitle="Tell us what happened. Required fields are marked. We respond on email or WhatsApp."
        showBackLink
        data-testid="hero-report-problem"
      />

      <div className="mx-auto w-full max-w-3xl px-5 pb-16 sm:px-8">
        <div className="pd-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/30 to-transparent"
          />

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
            noValidate
            data-testid="form-report-problem"
          >
            <Field
              label="Which product"
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
                <p className="text-xs text-[#FCA5A5]">
                  Could not load products. Please refresh the page.
                </p>
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name" required error={errors.reporterName}>
                <Input
                  value={form.reporterName}
                  onChange={(e) => update("reporterName", e.target.value)}
                  autoComplete="name"
                  data-testid="input-reporter-name"
                />
              </Field>
              <Field label="You are a…" required error={errors.reporterType}>
                <Select
                  value={form.reporterType}
                  onValueChange={(v) => update("reporterType", v)}
                >
                  <SelectTrigger data-testid="select-reporter-type">
                    <SelectValue placeholder="Select reporter type" />
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

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Email address"
                hint="Either email or WhatsApp required"
                error={errors.reporterEmail}
              >
                <Input
                  type="email"
                  value={form.reporterEmail}
                  onChange={(e) => update("reporterEmail", e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  data-testid="input-reporter-email"
                />
              </Field>
              <Field label="WhatsApp number" hint="E.164, e.g. +14155552671">
                <Input
                  value={form.reporterWhatsapp}
                  onChange={(e) => update("reporterWhatsapp", e.target.value)}
                  autoComplete="tel"
                  placeholder="+14155552671"
                  data-testid="input-reporter-whatsapp"
                />
              </Field>
            </div>

            <Field label="What kind of issue" required error={errors.category}>
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
              error={errors.issueSummary}
            >
              <Input
                value={form.issueSummary}
                onChange={(e) => update("issueSummary", e.target.value)}
                data-testid="input-issue-summary"
              />
            </Field>

            <Field label="What were you trying to do" hint="Optional">
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
              label="What happened"
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

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Page or step" hint="Optional">
                <Input
                  value={form.pageOrStep}
                  onChange={(e) => update("pageOrStep", e.target.value)}
                  data-testid="input-page-or-step"
                />
              </Field>
              <Field label="Application reference" hint="Optional">
                <Input
                  value={form.applicationReference}
                  onChange={(e) =>
                    update("applicationReference", e.target.value)
                  }
                  data-testid="input-application-reference"
                />
              </Field>
              <Field label="Account reference" hint="Optional">
                <Input
                  value={form.accountReference}
                  onChange={(e) => update("accountReference", e.target.value)}
                  data-testid="input-account-reference"
                />
              </Field>
              <Field label="Device" hint="Optional · iPhone, Windows laptop…">
                <Input
                  value={form.deviceType}
                  onChange={(e) => update("deviceType", e.target.value)}
                  data-testid="input-device"
                />
              </Field>
              <Field label="Browser" hint="Optional">
                <Input
                  value={form.browser}
                  onChange={(e) => update("browser", e.target.value)}
                  data-testid="input-browser"
                />
              </Field>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <Checkbox
                id="canContact"
                checked={form.canContact}
                onCheckedChange={(v) => update("canContact", v === true)}
                data-testid="checkbox-can-contact"
              />
              <Label
                htmlFor="canContact"
                className="!text-xs !normal-case !tracking-normal !font-normal !text-[#B8C5D0]"
                style={{ fontFamily: "inherit" }}
              >
                It's okay for the Eride support team to contact me about this
                report.
              </Label>
            </div>

            <Field
              label="Upload screenshot or recording"
              hint={`Optional. ${ATTACHMENT_HELP_TEXT} Please do not upload sensitive documents unless support asks for them.`}
              error={attachmentError ?? undefined}
            >
              <Input
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) =>
                  handleSelectAttachment(e.target.files?.[0] ?? null)
                }
                data-testid="input-attachment"
              />
              {attachment && (
                <p
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#B8C5D0]"
                  data-testid="text-attachment-selected"
                >
                  <Paperclip className="h-3 w-3" />
                  {attachment.name} · {formatFileSize(attachment.size)}
                </p>
              )}
            </Field>

            <p className="text-[11px] text-[#7B8694]">
              Please do not include passwords or payment card details.
            </p>

            {submitError && (
              <Alert variant="destructive" data-testid="alert-submit-error">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
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
                {createTicket.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Submit report
                {!createTicket.isPending && (
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PublicShell>
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
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-[11px] text-[#7B8694]">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-[#FCA5A5]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
