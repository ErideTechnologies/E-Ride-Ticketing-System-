import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_TYPE_LABELS,
  PRIORITY_LABELS,
  PUBLIC_STATUS_LABELS,
  humanLabel,
} from "@/lib/supportLabels";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HELP_TEXT,
  formatFileSize,
  validateAttachmentFile,
} from "@/lib/attachmentRules";
import {
  clearPublicTicketToken,
  readPublicTicketToken,
  storePublicTicketToken,
} from "@/lib/publicTicketAccess";

type PublicTicket = {
  ticketReference: string;
  productName: string;
  productCode: string;
  publicStatus: string;
  category: string;
  priority: string;
  issueSummary: string;
  pageOrStep: string | null;
  reporterName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
};

type PublicMessage = {
  id: string;
  direction: "outbound" | "inbound" | "internal";
  channel: string;
  messageType: string;
  senderName: string | null;
  messageBody: string;
  createdAt: string;
};

const REOPEN_FROM = new Set(["fixed", "resolved", "closed"]);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function PublicTicketPage() {
  const params = useParams<{ ticketReference: string }>();
  const ticketReference = decodeURIComponent(params.ticketReference ?? "");
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string | null>(() => {
    const stored = readPublicTicketToken(ticketReference);
    return stored?.token ?? null;
  });

  if (!token) {
    return (
      <VerifyPanel
        ticketReference={ticketReference}
        onVerified={(t) => setToken(t)}
      />
    );
  }

  return (
    <TicketView
      ticketReference={ticketReference}
      token={token}
      onTokenInvalid={() => {
        clearPublicTicketToken(ticketReference);
        setToken(null);
        navigate(
          `/help/track-ticket?ref=${encodeURIComponent(ticketReference)}`,
        );
      }}
    />
  );
}

function VerifyPanel({
  ticketReference,
  onVerified,
}: {
  ticketReference: string;
  onVerified: (token: string) => void;
}) {
  const [contactEmail, setContactEmail] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          ticketReference,
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
      onVerified(data.accessToken);
    } catch {
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
            Verify your ticket access
          </h1>
          <p
            className="font-mono text-sm text-muted-foreground"
            data-testid="text-verify-ticket-reference"
          >
            {ticketReference}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Confirm it's you</CardTitle>
            <CardDescription>
              Enter the email or WhatsApp number you used when submitting this
              report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onSubmit}
              className="space-y-5"
              noValidate
              data-testid="form-verify-ticket"
            >
              <div className="space-y-1.5">
                <Label htmlFor="verify-contact-email">Email address</Label>
                <Input
                  id="verify-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  autoComplete="email"
                  data-testid="input-verify-contact-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verify-contact-whatsapp">
                  Or WhatsApp number
                </Label>
                <Input
                  id="verify-contact-whatsapp"
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                  autoComplete="tel"
                  data-testid="input-verify-contact-whatsapp"
                />
              </div>
              {error && (
                <Alert
                  variant="destructive"
                  data-testid="alert-verify-error"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild>
                  <Link href="/help/track-ticket">Use a different reference</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="button-verify-submit"
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  View ticket
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function TicketView({
  ticketReference,
  token,
  onTokenInvalid,
}: {
  ticketReference: string;
  token: string;
  onTokenInvalid: () => void;
}) {
  const queryClient = useQueryClient();

  const ticketQuery = useQuery<PublicTicket>({
    queryKey: ["public-ticket", ticketReference, token],
    queryFn: async () => {
      const resp = await fetch(
        `/api/support/public/tickets/${encodeURIComponent(ticketReference)}?token=${encodeURIComponent(token)}`,
      );
      if (resp.status === 401) {
        onTokenInvalid();
        throw new Error("expired");
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as PublicTicket;
    },
    retry: false,
  });

  const messagesQuery = useQuery<PublicMessage[]>({
    queryKey: ["public-ticket-messages", ticketReference, token],
    queryFn: async () => {
      const resp = await fetch(
        `/api/support/public/tickets/${encodeURIComponent(ticketReference)}/messages?token=${encodeURIComponent(token)}`,
      );
      if (resp.status === 401) {
        onTokenInvalid();
        throw new Error("expired");
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as PublicMessage[];
    },
    retry: false,
  });

  const replyMutation = useMutation({
    mutationFn: async (input: { messageBody: string; contactName: string }) => {
      const resp = await fetch(
        `/api/support/public/tickets/${encodeURIComponent(ticketReference)}/reply?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageBody: input.messageBody,
            contactName: input.contactName || null,
          }),
        },
      );
      if (resp.status === 401) {
        onTokenInvalid();
        throw new Error("expired");
      }
      if (!resp.ok) {
        const err = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(err?.error ?? "Could not save your reply.");
      }
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["public-ticket", ticketReference, token],
      });
      queryClient.invalidateQueries({
        queryKey: ["public-ticket-messages", ticketReference, token],
      });
    },
  });

  if (ticketQuery.isLoading) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        </div>
      </main>
    );
  }

  if (ticketQuery.isError || !ticketQuery.data) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-10">
        <div className="mx-auto max-w-xl">
          <Alert variant="destructive" data-testid="alert-ticket-load-failed">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              We could not load this ticket. Your access link may have expired.
              Please verify again.
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button asChild>
              <Link href="/help/track-ticket">Back to ticket lookup</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const ticket = ticketQuery.data;
  const isReopenable = REOPEN_FROM.has(ticket.publicStatus);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-primary">Eride Support</p>
            <h1
              className="font-mono text-2xl font-semibold tracking-tight"
              data-testid="text-public-ticket-reference"
            >
              {ticket.ticketReference}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid="badge-product">
                {ticket.productName}
              </Badge>
              <Badge data-testid="badge-public-status">
                {humanLabel(PUBLIC_STATUS_LABELS, ticket.publicStatus)}
              </Badge>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/help">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Help
            </Link>
          </Button>
        </header>

        <Alert data-testid="alert-privacy-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Only share information related to this support request. Do not send
            passwords, payment card details, or sensitive documents unless
            support specifically asks for them.
          </AlertDescription>
        </Alert>

        <Card data-testid="card-status">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Current status"
              value={humanLabel(PUBLIC_STATUS_LABELS, ticket.publicStatus)}
            />
            <Row label="Submitted" value={formatDateTime(ticket.createdAt)} />
            <Row
              label="Last update"
              value={formatDateTime(ticket.updatedAt)}
            />
            {ticket.resolvedAt && (
              <Row
                label="Resolved"
                value={formatDateTime(ticket.resolvedAt)}
              />
            )}
            {ticket.closedAt && (
              <Row label="Closed" value={formatDateTime(ticket.closedAt)} />
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-summary">
          <CardHeader>
            <CardTitle>Ticket summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Product" value={ticket.productName} />
            <Row
              label="Category"
              value={humanLabel(CATEGORY_LABELS, ticket.category)}
            />
            <Row
              label="Priority"
              value={humanLabel(PRIORITY_LABELS, ticket.priority)}
            />
            {ticket.pageOrStep && (
              <Row label="Page or step" value={ticket.pageOrStep} />
            )}
            <Row label="What you reported" value={ticket.issueSummary} />
          </CardContent>
        </Card>

        <Card data-testid="card-messages">
          <CardHeader>
            <CardTitle>Latest updates</CardTitle>
            <CardDescription>
              Public messages between you and the support team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messagesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading messages…</p>
            ) : messagesQuery.data && messagesQuery.data.length > 0 ? (
              <ul className="space-y-3">
                {messagesQuery.data.map((m) => (
                  <li
                    key={m.id}
                    data-testid={`message-row-${m.id}`}
                    className={`rounded-md border p-3 ${
                      m.direction === "outbound"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">
                        {m.direction === "outbound" ? "From support" : "From you"}
                      </Badge>
                      <Badge variant="outline">
                        {humanLabel(MESSAGE_TYPE_LABELS, m.messageType)}
                      </Badge>
                      <Badge variant="outline">
                        {humanLabel(MESSAGE_CHANNEL_LABELS, m.channel)}
                      </Badge>
                      <span>{formatDateTime(m.createdAt)}</span>
                      {m.senderName && <span>· {m.senderName}</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{m.messageBody}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No public messages yet.
              </p>
            )}
          </CardContent>
        </Card>

        {isReopenable && (
          <Alert data-testid="alert-reopen-helper">
            <AlertDescription>
              If the issue continues, send us an update and our team will review
              it.
            </AlertDescription>
          </Alert>
        )}

        <ReplyCard
          reporterName={ticket.reporterName ?? ""}
          ticketReference={ticketReference}
          token={token}
          submitting={replyMutation.isPending}
          submitError={
            replyMutation.error
              ? (replyMutation.error as Error).message
              : null
          }
          submitted={replyMutation.isSuccess}
          onSubmit={(messageBody, contactName) => {
            replyMutation.mutate({ messageBody, contactName });
          }}
          onTokenInvalid={onTokenInvalid}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" asChild>
            <Link href="/help">Back to Help</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/help/report-problem">Report another problem</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="min-w-[7rem] text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

function ReplyCard({
  reporterName,
  ticketReference,
  token,
  submitting,
  submitError,
  submitted,
  onSubmit,
  onTokenInvalid,
}: {
  reporterName: string;
  ticketReference: string;
  token: string;
  submitting: boolean;
  submitError: string | null;
  submitted: boolean;
  onSubmit: (messageBody: string, contactName: string) => void;
  onTokenInvalid: () => void;
}) {
  const queryClient = useQueryClient();
  const [messageBody, setMessageBody] = useState("");
  const [contactName, setContactName] = useState(reporterName);
  const [localError, setLocalError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadOutcome, setUploadOutcome] = useState<
    | { kind: "success"; name: string }
    | { kind: "error"; message: string }
    | null
  >(null);

  // After a successful reply, clear the textarea once.
  useEffect(() => {
    if (submitted) setMessageBody("");
  }, [submitted]);

  function handleSelectAttachment(file: File | null) {
    setAttachmentError(null);
    setUploadOutcome(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!messageBody.trim()) {
      setLocalError("Please write a message.");
      return;
    }
    onSubmit(messageBody.trim(), contactName.trim());
  }

  async function handleUpload() {
    if (!attachment) return;
    setUploading(true);
    setUploadOutcome(null);
    try {
      const fd = new FormData();
      fd.append("file", attachment);
      const resp = await fetch(
        `/api/support/public/tickets/${encodeURIComponent(ticketReference)}/attachments?token=${encodeURIComponent(token)}`,
        { method: "POST", body: fd },
      );
      if (resp.status === 401) {
        onTokenInvalid();
        return;
      }
      if (!resp.ok) {
        const err = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setUploadOutcome({
          kind: "error",
          message: err?.error ?? "Upload failed. Please try again.",
        });
        return;
      }
      setUploadOutcome({ kind: "success", name: attachment.name });
      setAttachment(null);
      // Refresh ticket (updatedAt) on the chance the team responds.
      queryClient.invalidateQueries({
        queryKey: ["public-ticket", ticketReference, token],
      });
    } catch {
      setUploadOutcome({
        kind: "error",
        message: "Upload failed. Please try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card data-testid="card-add-info">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Add more information
        </CardTitle>
        <CardDescription>
          Send an update or upload a screenshot. The support team will see your
          reply on this ticket.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          noValidate
          data-testid="form-public-reply"
        >
          <div className="space-y-1.5">
            <Label htmlFor="public-reply-name">Your name</Label>
            <Input
              id="public-reply-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              data-testid="input-public-reply-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="public-reply-body">
              Update <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="public-reply-body"
              rows={4}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              data-testid="input-public-reply-body"
            />
          </div>
          {localError && (
            <Alert variant="destructive" data-testid="alert-reply-local-error">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}
          {submitError && (
            <Alert
              variant="destructive"
              data-testid="alert-reply-submit-error"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          {submitted && !submitError && (
            <Alert data-testid="alert-reply-success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Thank you. Your update has been added to the ticket.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              data-testid="button-public-reply-submit"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send update
            </Button>
          </div>
        </form>

        <div className="space-y-2 border-t pt-4">
          <Label>Attach a screenshot or short recording</Label>
          <p className="text-xs text-muted-foreground">
            {ATTACHMENT_HELP_TEXT} Please do not upload sensitive documents
            unless support asks for them.
          </p>
          <Input
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={(e) =>
              handleSelectAttachment(e.target.files?.[0] ?? null)
            }
            data-testid="input-public-attachment"
          />
          {attachment && (
            <p
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="text-public-attachment-selected"
            >
              <Paperclip className="h-3 w-3" />
              {attachment.name} · {formatFileSize(attachment.size)}
            </p>
          )}
          {attachmentError && (
            <Alert
              variant="destructive"
              data-testid="alert-public-attachment-error"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{attachmentError}</AlertDescription>
            </Alert>
          )}
          {uploadOutcome?.kind === "error" && (
            <Alert
              variant="destructive"
              data-testid="alert-public-upload-error"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{uploadOutcome.message}</AlertDescription>
            </Alert>
          )}
          {uploadOutcome?.kind === "success" && (
            <Alert data-testid="alert-public-upload-success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Uploaded {uploadOutcome.name}. Thank you.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={!attachment || uploading}
              onClick={handleUpload}
              data-testid="button-public-attachment-upload"
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="mr-2 h-4 w-4" />
              )}
              Upload attachment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
