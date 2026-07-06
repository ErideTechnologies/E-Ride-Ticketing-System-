import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import "react-phone-number-input/style.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
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
import { COUNTRY_OPTIONS_ORDER } from "@/lib/sadcCountries";
import { captureDeviceInfo } from "@/lib/deviceInfo";

const SUMMARY_MAX = 140;

type FormState = {
  productId: string;
  category: string;
  issueSummary: string;
  whatWereYouTryingToDo: string;
  whatWentWrong: string;
  pageOrStep: string;
  stepsToReproduce: string;
  applicationReference: string;
  reporterName: string;
  reporterType: string;
  reporterEmail: string;
  reporterWhatsapp: string;
  consent: boolean;
};

const EMPTY_FORM: FormState = {
  productId: "",
  category: "",
  issueSummary: "",
  whatWereYouTryingToDo: "",
  whatWentWrong: "",
  pageOrStep: "",
  stepsToReproduce: "",
  applicationReference: "",
  reporterName: "",
  reporterType: "",
  reporterEmail: "",
  reporterWhatsapp: "",
  consent: false,
};

type FieldKey = keyof FormState | "attachment";

const FIELD_LABELS: Record<FieldKey, string> = {
  productId: "Which product",
  category: "What kind of issue",
  issueSummary: "Short summary",
  whatWereYouTryingToDo: "What were you trying to do",
  whatWentWrong: "What happened",
  pageOrStep: "Page or step",
  stepsToReproduce: "Steps to reproduce",
  applicationReference: "Application or account reference",
  reporterName: "Your name",
  reporterType: "You are a…",
  reporterEmail: "Email address",
  reporterWhatsapp: "WhatsApp number",
  consent: "Consent",
  attachment: "Attachment",
};

const SERVER_GENERIC_ERROR =
  "Something went wrong. Please try again, or contact us via WhatsApp.";

export default function ReportProblemPage() {
  const [, navigate] = useLocation();
  const products = useListPublicSupportProducts();
  const createTicket = useCreateSupportTicket();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});

  const summaryLen = form.issueSummary.length;
  const summaryColour =
    summaryLen >= SUMMARY_MAX
      ? "text-[#FCA5A5]"
      : summaryLen >= 130
        ? "text-[#FBBF24]"
        : "text-[#7B8694]";

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

  function validate(): { ok: boolean; firstErrorKey: FieldKey | null } {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!form.productId) next.productId = "Please choose a product.";
    if (!form.category) next.category = "Please choose a category.";
    if (!form.issueSummary.trim())
      next.issueSummary = "Give us a short summary of the issue.";
    else if (form.issueSummary.length > SUMMARY_MAX)
      next.issueSummary = `Keep the summary under ${SUMMARY_MAX} characters.`;
    if (form.whatWereYouTryingToDo.trim().length < 5)
      next.whatWereYouTryingToDo =
        "Tell us what you were trying to do (at least 5 characters).";
    if (!form.whatWentWrong.trim())
      next.whatWentWrong = "Please tell us what went wrong.";
    if (!form.reporterName.trim())
      next.reporterName = "Your name is required.";
    if (!form.reporterType) next.reporterType = "Please select an option.";

    const email = form.reporterEmail.trim();
    const whatsapp = form.reporterWhatsapp.trim();
    if (!email && !whatsapp) {
      next.reporterEmail =
        "Provide either an email address or a WhatsApp number.";
    }
    if (whatsapp && !isValidPhoneNumber(whatsapp)) {
      next.reporterWhatsapp = "Enter a valid mobile number.";
    }
    if (!form.consent) {
      next.consent =
        "Please confirm consent before we contact you about this report.";
    }

    setErrors(next);
    const order: FieldKey[] = [
      "productId",
      "category",
      "issueSummary",
      "whatWereYouTryingToDo",
      "whatWentWrong",
      "reporterName",
      "reporterType",
      "reporterEmail",
      "reporterWhatsapp",
      "consent",
    ];
    const firstErrorKey = order.find((k) => next[k]) ?? null;
    return { ok: Object.keys(next).length === 0, firstErrorKey };
  }

  function focusField(key: FieldKey) {
    const el = fieldRefs.current[key];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el.querySelector<HTMLElement>(
      "input, textarea, select, button, [tabindex]",
    );
    focusable?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const { ok, firstErrorKey } = validate();
    if (!ok) {
      if (firstErrorKey) focusField(firstErrorKey);
      return;
    }

    try {
      const trimmedSteps = form.stepsToReproduce.trim();
      const combinedWhatHappened = trimmedSteps
        ? `${form.whatWentWrong.trim()}\n\nSteps to reproduce:\n${trimmedSteps}`
        : form.whatWentWrong.trim();

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
          issueSummary: form.issueSummary.trim(),
          whatWereYouTryingToDo: form.whatWereYouTryingToDo.trim(),
          whatWentWrong: combinedWhatHappened,
          deviceType: null,
          browser: null,
          canContact: true,
          consent: true,
          deviceInfo: captureDeviceInfo() as unknown as Record<string, unknown>,
        },
      });

      if (attachment) {
        try {
          const fd = new FormData();
          fd.append("file", attachment);
          fd.append("uploadedByName", form.reporterName.trim() || "Reporter");
          if (form.reporterEmail.trim())
            fd.append("uploadedByEmail", form.reporterEmail.trim());
          fd.append("uploadedByRole", "reporter");
          await fetch(`/api/support/tickets/${result.id}/attachments`, {
            method: "POST",
            body: fd,
          });
        } catch {
          // Attachment failure must not block the user from reaching the
          // confirmation. The ticket was already saved.
        }
      }

      navigate(
        `/help/report-problem/confirmation?ref=${encodeURIComponent(
          result.ticketReference,
        )}`,
      );
    } catch (err) {
      console.error(err);
      setSubmitError(SERVER_GENERIC_ERROR);
    }
  }

  const errorList = useMemo(
    () =>
      (Object.keys(errors) as FieldKey[])
        .filter((k) => errors[k])
        .map((k) => ({ key: k, label: FIELD_LABELS[k], message: errors[k]! })),
    [errors],
  );

  // Re-render trigger so screen readers re-announce the alert summary on each
  // failed submit attempt.
  const [submitAttempt, setSubmitAttempt] = useState(0);
  useEffect(() => {
    if (errorList.length > 0) setSubmitAttempt((n) => n + 1);
  }, [errors, errorList.length]);

  // Product selection is fixed to "E-Migration Assist" — the dropdown is hidden
  // and the id is resolved from the products list once it loads. Match on the
  // stable product code first, falling back to the display name, so a rename on
  // either side does not break the auto-selection.
  useEffect(() => {
    const list = products.data ?? [];
    const match =
      list.find((p) => p.productCode === "EMA") ??
      list.find((p) => p.productName === "E-Migration Assist");
    if (match) {
      setForm((prev) =>
        prev.productId === match.id ? prev : { ...prev, productId: match.id },
      );
    }
  }, [products.data]);

  return (
    <PublicShell data-testid="page-report-problem">
      <PublicHero
        title="Create a support"
        titleAccent="ticket"
        subtitle="Required fields are marked. We respond by email or WhatsApp."
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
            {/* Category */}
            <Field
              label={FIELD_LABELS.category}
              required
              error={errors.category}
              fieldKey="category"
              fieldRefs={fieldRefs}
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

            {/* 3. Short summary */}
            <Field
              label={FIELD_LABELS.issueSummary}
              required
              error={errors.issueSummary}
              fieldKey="issueSummary"
              fieldRefs={fieldRefs}
              footer={
                <p
                  className={`text-[11px] tabular-nums ${summaryColour}`}
                  data-testid="text-summary-counter"
                  aria-live="polite"
                >
                  {summaryLen}/{SUMMARY_MAX}
                </p>
              }
            >
              <Input
                value={form.issueSummary}
                onChange={(e) => update("issueSummary", e.target.value)}
                maxLength={SUMMARY_MAX}
                data-testid="input-issue-summary"
              />
            </Field>

            {/* 4. What were you trying to do — required, min 5 */}
            <Field
              label={FIELD_LABELS.whatWereYouTryingToDo}
              required
              error={errors.whatWereYouTryingToDo}
              fieldKey="whatWereYouTryingToDo"
              fieldRefs={fieldRefs}
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

            {/* 5. What happened */}
            <Field
              label={FIELD_LABELS.whatWentWrong}
              required
              error={errors.whatWentWrong}
              fieldKey="whatWentWrong"
              fieldRefs={fieldRefs}
            >
              <Textarea
                value={form.whatWentWrong}
                onChange={(e) => update("whatWentWrong", e.target.value)}
                rows={4}
                data-testid="input-what-went-wrong"
              />
            </Field>

            {/* 6. Page or step */}
            <Field
              label={FIELD_LABELS.pageOrStep}
              hint="Optional"
              fieldKey="pageOrStep"
              fieldRefs={fieldRefs}
            >
              <Input
                value={form.pageOrStep}
                onChange={(e) => update("pageOrStep", e.target.value)}
                data-testid="input-page-or-step"
              />
            </Field>

            {/* 7. Steps to reproduce */}
            <Field
              label={FIELD_LABELS.stepsToReproduce}
              hint="Optional · numbered list helps us reproduce the issue faster"
              fieldKey="stepsToReproduce"
              fieldRefs={fieldRefs}
            >
              <Textarea
                value={form.stepsToReproduce}
                onChange={(e) => update("stepsToReproduce", e.target.value)}
                rows={3}
                placeholder="1. …\n2. …\n3. …"
                data-testid="input-steps"
              />
            </Field>

            {/* 8. Attachment */}
            <Field
              label="Upload screenshot or recording"
              hint={`Optional. ${ATTACHMENT_HELP_TEXT} Please do not upload sensitive documents unless support asks for them.`}
              error={attachmentError ?? undefined}
              fieldKey="attachment"
              fieldRefs={fieldRefs}
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

            {/* 9. Application or account reference */}
            <Field
              label={FIELD_LABELS.applicationReference}
              hint="Optional · paste your application ID or account number if you have one"
              fieldKey="applicationReference"
              fieldRefs={fieldRefs}
            >
              <Input
                value={form.applicationReference}
                onChange={(e) =>
                  update("applicationReference", e.target.value)
                }
                data-testid="input-application-reference"
              />
            </Field>

            {/* Divider before reporter section */}
            <div
              role="separator"
              aria-hidden
              className="border-t border-white/[0.06]"
            />

            {/* 10. Name + reporter type */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={FIELD_LABELS.reporterName}
                required
                error={errors.reporterName}
                fieldKey="reporterName"
                fieldRefs={fieldRefs}
              >
                <Input
                  value={form.reporterName}
                  onChange={(e) => update("reporterName", e.target.value)}
                  autoComplete="name"
                  data-testid="input-reporter-name"
                />
              </Field>
              <Field
                label={FIELD_LABELS.reporterType}
                required
                error={errors.reporterType}
                fieldKey="reporterType"
                fieldRefs={fieldRefs}
              >
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

            {/* 11. Email + WhatsApp */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={FIELD_LABELS.reporterEmail}
                hint="Either email or WhatsApp required"
                error={errors.reporterEmail}
                fieldKey="reporterEmail"
                fieldRefs={fieldRefs}
              >
                <Input
                  type="email"
                  inputMode="email"
                  value={form.reporterEmail}
                  onChange={(e) => update("reporterEmail", e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  data-testid="input-reporter-email"
                />
              </Field>
              <Field
                label={FIELD_LABELS.reporterWhatsapp}
                hint="Default South Africa · pick another country if needed"
                error={errors.reporterWhatsapp}
                fieldKey="reporterWhatsapp"
                fieldRefs={fieldRefs}
              >
                <div className="pd-phone-input">
                  <PhoneInput
                    international
                    defaultCountry="ZA"
                    countryOptionsOrder={COUNTRY_OPTIONS_ORDER}
                    value={form.reporterWhatsapp}
                    onChange={(v) =>
                      update("reporterWhatsapp", (v ?? "") as string)
                    }
                    autoComplete="tel"
                    data-testid="input-reporter-whatsapp"
                  />
                </div>
              </Field>
            </div>

            {/* 12. POPIA consent */}
            <div
              ref={(el) => {
                fieldRefs.current.consent = el;
              }}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                errors.consent
                  ? "border-[#FCA5A5]/40 bg-[#FCA5A5]/[0.04]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <Checkbox
                id="consent"
                checked={form.consent}
                onCheckedChange={(v) => update("consent", v === true)}
                data-testid="checkbox-consent"
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={
                  errors.consent ? "consent-error" : undefined
                }
              />
              <div className="space-y-1">
                <Label
                  htmlFor="consent"
                  className="!text-xs !normal-case !tracking-normal !font-normal !text-[#B8C5D0] leading-relaxed"
                  style={{ fontFamily: "inherit" }}
                >
                  I agree to be contacted by the Eride support team about this
                  report. My contact details and the information I provide will
                  be processed in line with POPIA for the purpose of resolving
                  this issue.
                </Label>
                {errors.consent && (
                  <p
                    id="consent-error"
                    className="text-[11px] text-[#FCA5A5]"
                  >
                    {errors.consent}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-[#7B8694]">
              Please do not include passwords or payment card details.
            </p>

            {/* Validation summary (a11y) */}
            {errorList.length > 0 && (
              <Alert
                variant="destructive"
                role="alert"
                aria-live="assertive"
                data-testid="alert-validation-summary"
                key={submitAttempt}
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">
                    Please fix {errorList.length}{" "}
                    {errorList.length === 1 ? "issue" : "issues"} before
                    submitting:
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {errorList.map((e) => (
                      <li key={e.key}>
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-white"
                          onClick={() => focusField(e.key)}
                        >
                          {e.label}
                        </button>
                        : {e.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert
                variant="destructive"
                role="alert"
                data-testid="alert-submit-error"
              >
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
                disabled={createTicket.isPending || !form.consent}
                data-testid="button-submit"
              >
                {createTicket.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit report
                    <ArrowUpRight className="ml-1 h-4 w-4" />
                  </>
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
  footer,
  fieldKey,
  fieldRefs,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  fieldKey: FieldKey;
  fieldRefs: React.MutableRefObject<
    Partial<Record<FieldKey, HTMLElement | null>>
  >;
}) {
  return (
    <div
      className="space-y-2"
      ref={(el) => {
        fieldRefs.current[fieldKey] = el;
      }}
    >
      <Label>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {hint && !error && (
            <p className="text-[11px] text-[#7B8694]">{hint}</p>
          )}
          {error && (
            <p className="text-[11px] text-[#FCA5A5]" role="alert">
              {error}
            </p>
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}
