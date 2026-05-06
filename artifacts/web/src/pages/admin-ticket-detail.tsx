import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSupportTicket,
  useUpdateSupportTicket,
  useListSupportTicketNotes,
  useCreateSupportTicketNote,
  useListSupportTicketStatusHistory,
  useListSupportTicketAttachments,
  useDeleteSupportTicketAttachment,
  useListSupportTicketMessages,
  useCreateSupportTicketMessage,
  useApplySupportTicketWorkflowAction,
  type SupportTicketWorkflowAction,
  getGetSupportTicketQueryKey,
  getListSupportTicketNotesQueryKey,
  getListSupportTicketStatusHistoryQueryKey,
  getListSupportTicketAttachmentsQueryKey,
  getListSupportTicketMessagesQueryKey,
  type SupportTicketDetail,
  type SupportTicketAttachment,
  type SupportTicketMessage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HELP_TEXT,
  formatFileSize,
  validateAttachmentFile,
} from "@/lib/attachmentRules";
import { CATEGORY_OPTIONS } from "@/lib/supportOptions";
import {
  CATEGORY_LABELS,
  INTERNAL_STATUS_LABELS,
  INTERNAL_STATUS_OPTIONS,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_CHANNEL_OPTIONS,
  MESSAGE_DELIVERY_STATUS_LABELS,
  MESSAGE_DELIVERY_STATUS_OPTIONS,
  MESSAGE_DIRECTION_LABELS,
  MESSAGE_DIRECTION_OPTIONS,
  MESSAGE_TYPE_LABELS,
  MESSAGE_TYPE_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  PUBLIC_STATUS_LABELS,
  PUBLIC_STATUS_OPTIONS,
  REPORTER_TYPE_LABELS,
  SEVERITY_LABELS,
  SEVERITY_OPTIONS,
  humanLabel,
} from "@/lib/supportLabels";

function priorityBadgeClass(p: string): string {
  switch (p) {
    case "urgent":
      return "bg-destructive text-destructive-foreground";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-amber-400 text-amber-950";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fillTemplate(
  template: string,
  ticket: SupportTicketDetail,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = (ticket as unknown as Record<string, unknown>)[key];
    return v == null || v === "" ? "" : String(v);
  });
}

const COMM_TEMPLATES: Array<{ key: string; label: string; body: string }> = [
  {
    key: "received",
    label: "Ticket received",
    body: `Hi {{reporterName}},
Thank you for contacting Eride Support.
We have received your request.
Reference: {{ticketReference}}
Status: Received
Our team will review the issue and contact you if we need more information.
Eride Support`,
  },
  {
    key: "more-info",
    label: "More info needed",
    body: `Hi {{reporterName}},
We are reviewing your support request, but we need a little more information.
Please send us a screenshot, the page where the issue happened, and what you clicked before the issue appeared.
Reference: {{ticketReference}}
Eride Support`,
  },
  {
    key: "escalated",
    label: "Escalated to engineering",
    body: `Hi {{reporterName}},
Your issue has been escalated to our technical team.
Reference: {{ticketReference}}
Status: Being Fixed
You do not need to report it again. We will update you once the issue has been resolved.
Eride Support`,
  },
  {
    key: "fixed",
    label: "Fixed",
    body: `Hi {{reporterName}},
The issue you reported has been fixed.
Reference: {{ticketReference}}
Please try again. If the issue continues, reply to this message and we will reopen the ticket.
Eride Support`,
  },
  {
    key: "closed",
    label: "Closed",
    body: `Hi {{reporterName}},
We are closing your support ticket because the issue has been resolved.
Reference: {{ticketReference}}
If the same issue happens again, you can create a new ticket through the support page.
Eride Support`,
  },
];

function buildHandoff(t: SupportTicketDetail): string {
  return `SUPPORT TICKET DEVELOPER HANDOFF

Ticket:
${t.ticketReference}

Product:
${t.productName} (${t.productCode})

Priority:
${t.priority}

Severity:
${t.severity}

Category:
${t.category}

Reporter Type:
${t.reporterType}

Page/Step:
${t.pageOrStep ?? ""}

Issue Summary:
${t.issueSummary}

What user was trying to do:
${t.whatWereYouTryingToDo ?? ""}

What went wrong:
${t.whatWentWrong}

Expected developer action:
Investigate, reproduce, fix, add regression test, and return for QA verification.

Compliance notes:
- Do not expose PII in logs.
- Do not expose internal notes publicly.
- Do not use legal-decision language such as approved, rejected, guaranteed.
- The fixer cannot verify their own work.`;
}

export default function AdminTicketDetailPage() {
  const [, params] = useRoute("/admin/support/tickets/:id");
  const id = params?.id ?? "";
  const ticketQuery = useGetSupportTicket(id);

  if (!id) return null;

  if (ticketQuery.isLoading) {
    return (
      <Shell>
        <p className="py-12 text-center text-muted-foreground">
          Loading ticket…
        </p>
      </Shell>
    );
  }

  if (ticketQuery.isError) {
    const err = ticketQuery.error as unknown as { status?: number } | null;
    const notFound = err?.status === 404;
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {notFound ? "Ticket not found" : "Could not load ticket"}
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  if (!ticketQuery.data) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Ticket not found</AlertDescription>
        </Alert>
      </Shell>
    );
  }

  return <TicketDetail ticket={ticketQuery.data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/admin/support/tickets">
          <Button variant="ghost" size="sm" data-testid="link-back">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to tickets
          </Button>
        </Link>
        {children}
      </div>
    </main>
  );
}

function TicketDetail({ ticket }: { ticket: SupportTicketDetail }) {
  const qc = useQueryClient();
  const updateMutation = useUpdateSupportTicket();
  const [saveError, setSaveError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetSupportTicketQueryKey(ticket.id) });
    qc.invalidateQueries({
      queryKey: getListSupportTicketStatusHistoryQueryKey(ticket.id),
    });
  }

  async function save(data: Record<string, unknown>) {
    setSaveError(null);
    try {
      await updateMutation.mutateAsync({ id: ticket.id, data });
      invalidate();
      return true;
    } catch {
      setSaveError("Could not save changes");
      return false;
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/admin/support/tickets">
          <Button variant="ghost" size="sm" data-testid="link-back">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to tickets
          </Button>
        </Link>

        <header className="flex flex-wrap items-center gap-3">
          <h1
            className="font-mono text-2xl font-semibold"
            data-testid="text-ticket-reference"
          >
            {ticket.ticketReference}
          </h1>
          <Badge variant="outline">
            {ticket.productName} · {ticket.productCode}
          </Badge>
          <Badge
            className={priorityBadgeClass(ticket.priority)}
            data-testid="badge-priority"
          >
            {humanLabel(PRIORITY_LABELS, ticket.priority)}
          </Badge>
          <Badge variant="outline" data-testid="badge-public-status">
            Public: {humanLabel(PUBLIC_STATUS_LABELS, ticket.publicStatus)}
          </Badge>
          <Badge variant="outline" data-testid="badge-internal-status">
            Internal: {humanLabel(INTERNAL_STATUS_LABELS, ticket.internalStatus)}
          </Badge>
        </header>

        {saveError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        <WorkflowActionsCard ticket={ticket} />

        <div className="grid gap-6 lg:grid-cols-2">
          <OverviewCard ticket={ticket} />
          <ReporterCard ticket={ticket} />
          <IssueDetailsCard ticket={ticket} onSave={save} />
          <StatusManagementCard ticket={ticket} onSave={save} />
          <AssignmentCard ticket={ticket} onSave={save} />
          <AttachmentsCard ticketId={ticket.id} />
          <NotesCard ticketId={ticket.id} />
          <StatusHistoryCard ticketId={ticket.id} />
          <CommunicationLogCard ticket={ticket} />
          <HandoffCard ticket={ticket} />
        </div>
      </div>
    </main>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 break-words">{value || "—"}</dd>
    </div>
  );
}

type WorkflowGroup = {
  title: string;
  testId: string;
  actions: Array<{ action: SupportTicketWorkflowAction; label: string }>;
};

const WORKFLOW_GROUPS: WorkflowGroup[] = [
  {
    title: "Support review",
    testId: "group-support-review",
    actions: [
      { action: "start_review", label: "Start Review" },
      { action: "request_more_info", label: "Request More Info" },
    ],
  },
  {
    title: "Engineering",
    testId: "group-engineering",
    actions: [
      { action: "escalate_to_engineering", label: "Escalate to Engineering" },
      { action: "mark_in_engineering", label: "Mark In Engineering" },
      { action: "send_to_qa", label: "Send to QA" },
    ],
  },
  {
    title: "Resolution",
    testId: "group-resolution",
    actions: [
      {
        action: "mark_fixed_waiting_notification",
        label: "Mark Fixed / Waiting User Notification",
      },
      { action: "mark_user_notified", label: "Mark User Notified" },
      { action: "resolve_ticket", label: "Resolve" },
      { action: "close_ticket", label: "Close" },
      { action: "reopen_ticket", label: "Reopen" },
    ],
  },
  {
    title: "Admin outcomes",
    testId: "group-admin-outcomes",
    actions: [
      { action: "mark_duplicate", label: "Duplicate" },
      { action: "mark_not_a_bug", label: "Not a Bug" },
      { action: "defer_ticket", label: "Defer" },
      { action: "mark_spam", label: "Spam" },
    ],
  },
];

const WORKFLOW_REMINDERS: Partial<Record<SupportTicketWorkflowAction, string>> = {
  request_more_info:
    "Remember to send or record a More Info Needed message.",
  escalate_to_engineering:
    "Record the Escalated to Engineering message if the reporter should be updated.",
  mark_fixed_waiting_notification:
    "Send or record the Fixed message before marking User Notified.",
  close_ticket:
    "Make sure the closure message has been recorded if user communication is required.",
};

function WorkflowActionsCard({ ticket }: { ticket: SupportTicketDetail }) {
  const qc = useQueryClient();
  const mutation = useApplySupportTicketWorkflowAction();
  const [activeAction, setActiveAction] =
    useState<SupportTicketWorkflowAction | null>(null);
  const [changedByName, setChangedByName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] =
    useState<SupportTicketWorkflowAction | null>(null);

  function openAction(action: SupportTicketWorkflowAction) {
    setError(null);
    setLastAction(null);
    setActiveAction(action);
    setChangedByName("");
    setReason("");
  }

  function cancel() {
    setActiveAction(null);
    setChangedByName("");
    setReason("");
  }

  async function confirm() {
    if (!activeAction) return;
    setError(null);
    try {
      await mutation.mutateAsync({
        id: ticket.id,
        data: {
          action: activeAction,
          changedByName: changedByName.trim() || null,
          reason: reason.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: getGetSupportTicketQueryKey(ticket.id) });
      qc.invalidateQueries({
        queryKey: getListSupportTicketStatusHistoryQueryKey(ticket.id),
      });
      setLastAction(activeAction);
      setActiveAction(null);
      setChangedByName("");
      setReason("");
    } catch {
      setError("Could not apply workflow action");
    }
  }

  const reminder = lastAction ? WORKFLOW_REMINDERS[lastAction] : undefined;

  return (
    <Card data-testid="card-workflow-actions">
      <CardHeader>
        <CardTitle className="text-base">Workflow actions</CardTitle>
        <CardDescription>
          Move this ticket through the standard support lifecycle. Each action
          updates public + internal status and writes a history entry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {WORKFLOW_GROUPS.map((group) => (
          <div key={group.testId} data-testid={group.testId}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.actions.map((a) => (
                <Button
                  key={a.action}
                  size="sm"
                  variant={activeAction === a.action ? "default" : "outline"}
                  onClick={() => openAction(a.action)}
                  disabled={mutation.isPending}
                  data-testid={`button-workflow-${a.action}`}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        ))}

        {activeAction && (
          <div
            className="space-y-2 rounded-md border bg-muted/40 p-3"
            data-testid="panel-workflow-confirm"
          >
            <div className="text-sm font-medium">
              Apply: {activeAction.replace(/_/g, " ")}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="workflow-changed-by"
                  className="text-xs text-muted-foreground"
                >
                  Your name (optional)
                </Label>
                <Input
                  id="workflow-changed-by"
                  value={changedByName}
                  onChange={(e) => setChangedByName(e.target.value)}
                  placeholder="e.g. Priya"
                  data-testid="input-workflow-changed-by"
                />
              </div>
              <div>
                <Label
                  htmlFor="workflow-reason"
                  className="text-xs text-muted-foreground"
                >
                  Reason / comment (optional)
                </Label>
                <Input
                  id="workflow-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this change?"
                  data-testid="input-workflow-reason"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={confirm}
                disabled={mutation.isPending}
                data-testid="button-workflow-confirm"
              >
                {mutation.isPending ? "Applying…" : "Apply action"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancel}
                disabled={mutation.isPending}
                data-testid="button-workflow-cancel"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive" data-testid="alert-workflow-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lastAction && !activeAction && (
          <div
            className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            data-testid="text-workflow-success"
          >
            <div className="font-medium">
              Applied: {lastAction.replace(/_/g, " ")}
            </div>
            {reminder && (
              <div className="mt-1 text-emerald-800" data-testid="text-workflow-reminder">
                {reminder}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewCard({ ticket }: { ticket: SupportTicketDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ticket overview</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <FieldRow label="Reference" value={ticket.ticketReference} />
          <FieldRow label="Product" value={ticket.productName} />
          <FieldRow label="Product code" value={ticket.productCode} />
          <FieldRow
            label="Category"
            value={humanLabel(CATEGORY_LABELS, ticket.category)}
          />
          <FieldRow
            label="Priority"
            value={humanLabel(PRIORITY_LABELS, ticket.priority)}
          />
          <FieldRow
            label="Severity"
            value={humanLabel(SEVERITY_LABELS, ticket.severity)}
          />
          <FieldRow
            label="Public status"
            value={humanLabel(PUBLIC_STATUS_LABELS, ticket.publicStatus)}
          />
          <FieldRow
            label="Internal status"
            value={humanLabel(INTERNAL_STATUS_LABELS, ticket.internalStatus)}
          />
          <FieldRow label="Source" value={ticket.source} />
          <FieldRow label="Environment" value={ticket.environment} />
          <FieldRow label="Created" value={formatDateTime(ticket.createdAt)} />
          <FieldRow label="Updated" value={formatDateTime(ticket.updatedAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function ReporterCard({ ticket }: { ticket: SupportTicketDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reporter</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <FieldRow
            label="Type"
            value={humanLabel(REPORTER_TYPE_LABELS, ticket.reporterType)}
          />
          <FieldRow label="Name" value={ticket.reporterName} />
          <FieldRow label="Email" value={ticket.reporterEmail} />
          <FieldRow label="WhatsApp" value={ticket.reporterWhatsapp} />
          <FieldRow label="User ID" value={ticket.userId} />
          <FieldRow label="Company ID" value={ticket.companyId} />
          <FieldRow label="Firm ID" value={ticket.firmId} />
          <FieldRow label="Partner ID" value={ticket.partnerId} />
        </dl>
      </CardContent>
    </Card>
  );
}

function IssueDetailsCard({
  ticket,
  onSave,
}: {
  ticket: SupportTicketDetail;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [issueSummary, setIssueSummary] = useState(ticket.issueSummary);
  const [whatWereYouTryingToDo, setTrying] = useState(
    ticket.whatWereYouTryingToDo ?? "",
  );
  const [whatWentWrong, setWrong] = useState(ticket.whatWentWrong);
  const [pageOrStep, setPageOrStep] = useState(ticket.pageOrStep ?? "");
  const [applicationReference, setAppRef] = useState(
    ticket.applicationReference ?? "",
  );
  const [accountReference, setAccRef] = useState(
    ticket.accountReference ?? "",
  );
  const [environment, setEnvironment] = useState(ticket.environment ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      issueSummary,
      whatWereYouTryingToDo: whatWereYouTryingToDo || null,
      whatWentWrong,
      pageOrStep: pageOrStep || null,
      applicationReference: applicationReference || null,
      accountReference: accountReference || null,
      environment: environment || null,
    });
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Issue details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Issue summary">
          <Input
            value={issueSummary}
            onChange={(e) => setIssueSummary(e.target.value)}
            data-testid="input-issue-summary"
          />
        </Field>
        <Field label="What were you trying to do?">
          <Textarea
            value={whatWereYouTryingToDo}
            onChange={(e) => setTrying(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="What went wrong?">
          <Textarea
            value={whatWentWrong}
            onChange={(e) => setWrong(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Page or step">
          <Input
            value={pageOrStep}
            onChange={(e) => setPageOrStep(e.target.value)}
          />
        </Field>
        <Field label="Application reference">
          <Input
            value={applicationReference}
            onChange={(e) => setAppRef(e.target.value)}
          />
        </Field>
        <Field label="Account reference">
          <Input
            value={accountReference}
            onChange={(e) => setAccRef(e.target.value)}
          />
        </Field>
        <Field label="Environment">
          <Input
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
          />
        </Field>
        <Button
          onClick={handleSave}
          disabled={saving}
          data-testid="button-save-issue"
        >
          {saving ? "Saving…" : "Save issue details"}
        </Button>
      </CardContent>
    </Card>
  );
}

function StatusManagementCard({
  ticket,
  onSave,
}: {
  ticket: SupportTicketDetail;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [publicStatus, setPublic] = useState(ticket.publicStatus);
  const [internalStatus, setInternal] = useState(ticket.internalStatus);
  const [priority, setPriority] = useState(ticket.priority);
  const [severity, setSeverity] = useState(ticket.severity);
  const [category, setCategory] = useState(ticket.category);
  const [changedByName, setChangedByName] = useState("Support");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      publicStatus,
      internalStatus,
      priority,
      severity,
      category,
      changedByName: changedByName || null,
    });
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status &amp; priority</CardTitle>
        <CardDescription>
          Status changes are recorded in the history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Public status">
          <SimpleSelect
            value={publicStatus}
            onChange={(v) =>
              setPublic(v as SupportTicketDetail["publicStatus"])
            }
            options={PUBLIC_STATUS_OPTIONS}
            testId="select-public-status"
          />
        </Field>
        <Field label="Internal status">
          <SimpleSelect
            value={internalStatus}
            onChange={(v) =>
              setInternal(v as SupportTicketDetail["internalStatus"])
            }
            options={INTERNAL_STATUS_OPTIONS}
            testId="select-internal-status"
          />
        </Field>
        <Field label="Priority">
          <SimpleSelect
            value={priority}
            onChange={(v) => setPriority(v as SupportTicketDetail["priority"])}
            options={PRIORITY_OPTIONS}
            testId="select-priority"
          />
        </Field>
        <Field label="Severity">
          <SimpleSelect
            value={severity}
            onChange={(v) => setSeverity(v as SupportTicketDetail["severity"])}
            options={SEVERITY_OPTIONS}
            testId="select-severity"
          />
        </Field>
        <Field label="Category">
          <SimpleSelect
            value={category}
            onChange={(v) => setCategory(v as SupportTicketDetail["category"])}
            options={CATEGORY_OPTIONS}
            testId="select-category"
          />
        </Field>
        <Field label="Changed by">
          <Input
            value={changedByName}
            onChange={(e) => setChangedByName(e.target.value)}
          />
        </Field>
        <Button
          onClick={handleSave}
          disabled={saving}
          data-testid="button-save-status"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AssignmentCard({
  ticket,
  onSave,
}: {
  ticket: SupportTicketDetail;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [supportUser, setSupportUser] = useState(
    ticket.assignedSupportUserId ?? "",
  );
  const [productOwner, setProductOwner] = useState(
    ticket.assignedProductOwnerId ?? "",
  );
  const [developer, setDeveloper] = useState(
    ticket.assignedDeveloperId ?? "",
  );
  const [qa, setQa] = useState(ticket.assignedQaVerifierId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      assignedSupportUserId: supportUser || null,
      assignedProductOwnerId: productOwner || null,
      assignedDeveloperId: developer || null,
      assignedQaVerifierId: qa || null,
    });
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assignment</CardTitle>
        <CardDescription>
          User IDs (full user management arrives later).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Support user">
          <Input
            value={supportUser}
            onChange={(e) => setSupportUser(e.target.value)}
          />
        </Field>
        <Field label="Product owner">
          <Input
            value={productOwner}
            onChange={(e) => setProductOwner(e.target.value)}
          />
        </Field>
        <Field label="Developer">
          <Input
            value={developer}
            onChange={(e) => setDeveloper(e.target.value)}
          />
        </Field>
        <Field label="QA verifier">
          <Input value={qa} onChange={(e) => setQa(e.target.value)} />
        </Field>
        <Button
          onClick={handleSave}
          disabled={saving}
          data-testid="button-save-assignment"
        >
          {saving ? "Saving…" : "Save assignment"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AttachmentsCard({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const attachments = useListSupportTicketAttachments(ticketId);
  const remove = useDeleteSupportTicketAttachment();
  const [uploadedByName, setUploadedByName] = useState("Support");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function selectFile(file: File | null) {
    setError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const err = validateAttachmentFile(file);
    if (err) {
      setSelectedFile(null);
      setError(err);
      return;
    }
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("uploadedByName", uploadedByName.trim() || "Support");
      fd.append("uploadedByRole", "support");
      const resp = await fetch(
        `/api/support/tickets/${ticketId}/attachments`,
        { method: "POST", body: fd },
      );
      if (!resp.ok) {
        let msg = "Could not upload file";
        try {
          const j = (await resp.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        setError(msg);
        return;
      }
      setSelectedFile(null);
      qc.invalidateQueries({
        queryKey: getListSupportTicketAttachmentsQueryKey(ticketId),
      });
    } catch {
      setError("Could not upload file");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(attachmentId: string) {
    try {
      await remove.mutateAsync({ id: ticketId, attachmentId });
      qc.invalidateQueries({
        queryKey: getListSupportTicketAttachmentsQueryKey(ticketId),
      });
    } catch {
      setError("Could not delete attachment");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Attachments</CardTitle>
        <CardDescription>
          Screenshots, recordings, and documents linked to this ticket.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="space-y-2 rounded-md border p-3"
          data-testid="attachment-uploader"
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Uploaded by">
              <Input
                value={uploadedByName}
                onChange={(e) => setUploadedByName(e.target.value)}
                data-testid="input-attachment-uploader"
              />
            </Field>
            <Field label="File">
              <Input
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) =>
                  selectFile(e.target.files?.[0] ?? null)
                }
                data-testid="input-attachment-file"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            {ATTACHMENT_HELP_TEXT}
          </p>
          {selectedFile && (
            <p
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="text-attachment-selected"
            >
              <Paperclip className="h-3 w-3" />
              {selectedFile.name} · {formatFileSize(selectedFile.size)}
            </p>
          )}
          {error && (
            <Alert variant="destructive" data-testid="alert-attachment-error">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              data-testid="button-upload-attachment"
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading…" : "Upload attachment"}
            </Button>
          </div>
        </div>

        {attachments.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading attachments…</p>
        ) : attachments.data && attachments.data.length > 0 ? (
          <ul
            className="divide-y rounded-md border"
            data-testid="attachments-list"
          >
            {attachments.data.map((a: SupportTicketAttachment) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`attachment-${a.id}`}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={a.originalFileName}>
                      {a.originalFileName}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.fileType} · {a.mimeType} · {formatFileSize(a.fileSize)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.uploadedByName ?? "Unknown"}
                    {a.uploadedByRole ? ` (${a.uploadedByRole})` : ""} ·{" "}
                    {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    data-testid={`button-view-attachment-${a.id}`}
                  >
                    <a
                      href={a.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye className="mr-1 h-4 w-4" /> View
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    data-testid={`button-download-attachment-${a.id}`}
                  >
                    <a href={`${a.viewUrl}?download=1`}>
                      <Download className="mr-1 h-4 w-4" /> Download
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(a.id)}
                    data-testid={`button-delete-attachment-${a.id}`}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No attachments yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function NotesCard({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const notes = useListSupportTicketNotes(ticketId);
  const create = useCreateSupportTicketNote();
  const [note, setNote] = useState("");
  const [createdByName, setCreatedByName] = useState("Support");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!note.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({
        id: ticketId,
        data: { note: note.trim(), createdByName: createdByName || null },
      });
      setNote("");
      qc.invalidateQueries({
        queryKey: getListSupportTicketNotesQueryKey(ticketId),
      });
    } catch {
      setError("Could not add note");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Internal notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Textarea
            placeholder="Add an internal note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            data-testid="input-note"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-[200px]"
              value={createdByName}
              onChange={(e) => setCreatedByName(e.target.value)}
              placeholder="Your name"
            />
            <Button
              onClick={handleAdd}
              disabled={create.isPending || !note.trim()}
              data-testid="button-add-note"
            >
              {create.isPending ? "Adding…" : "Add note"}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-2" data-testid="notes-list">
          {notes.isLoading && (
            <p className="text-sm text-muted-foreground">Loading notes…</p>
          )}
          {(notes.data ?? []).length === 0 && !notes.isLoading && (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          )}
          {(notes.data ?? []).map((n) => (
            <div
              key={n.id}
              className="rounded-md border bg-background p-3 text-sm"
            >
              <p className="whitespace-pre-wrap">{n.note}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.createdByName ?? "Anonymous"} · {formatDateTime(n.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusHistoryCard({ ticketId }: { ticketId: string }) {
  const history = useListSupportTicketStatusHistory(ticketId);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Status history</CardTitle>
      </CardHeader>
      <CardContent>
        {history.isLoading && (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        )}
        {(history.data ?? []).length === 0 && !history.isLoading && (
          <p className="text-sm text-muted-foreground">
            No status changes yet.
          </p>
        )}
        <ul className="space-y-2" data-testid="status-history-list">
          {(history.data ?? []).map((h) => (
            <li
              key={h.id}
              className="rounded-md border bg-background p-3 text-sm"
            >
              {h.oldPublicStatus || h.newPublicStatus ? (
                <p>
                  Public:{" "}
                  <span className="font-medium">
                    {humanLabel(PUBLIC_STATUS_LABELS, h.oldPublicStatus ?? "—")}
                  </span>{" "}
                  →{" "}
                  <span className="font-medium">
                    {humanLabel(PUBLIC_STATUS_LABELS, h.newPublicStatus ?? "—")}
                  </span>
                </p>
              ) : null}
              {h.oldInternalStatus || h.newInternalStatus ? (
                <p>
                  Internal:{" "}
                  <span className="font-medium">
                    {humanLabel(
                      INTERNAL_STATUS_LABELS,
                      h.oldInternalStatus ?? "—",
                    )}
                  </span>{" "}
                  →{" "}
                  <span className="font-medium">
                    {humanLabel(
                      INTERNAL_STATUS_LABELS,
                      h.newInternalStatus ?? "—",
                    )}
                  </span>
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {h.changedByName ?? "Anonymous"} · {formatDateTime(h.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type MessageTypeValue =
  (typeof MESSAGE_TYPE_OPTIONS)[number]["value"];
type DirectionValue =
  (typeof MESSAGE_DIRECTION_OPTIONS)[number]["value"];
type ChannelValue = (typeof MESSAGE_CHANNEL_OPTIONS)[number]["value"];
type DeliveryStatusValue =
  (typeof MESSAGE_DELIVERY_STATUS_OPTIONS)[number]["value"];

const TEMPLATE_TO_MESSAGE_TYPE: Record<string, MessageTypeValue> = {
  received: "ticket_received",
  "more-info": "more_info_needed",
  escalated: "escalated_to_engineering",
  fixed: "fixed",
  closed: "closed",
};

const STATUS_SUGGESTION_BY_TYPE: Partial<
  Record<
    MessageTypeValue,
    { publicStatus: string; internalStatus: string; help: string }
  >
> = {
  more_info_needed: {
    publicStatus: "more_info_needed",
    internalStatus: "needs_user_info",
    help: "Suggest setting public status to More info needed and internal to Needs user info.",
  },
  escalated_to_engineering: {
    publicStatus: "being_fixed",
    internalStatus: "engineering_escalation_required",
    help: "Suggest setting public status to Being fixed and internal to Engineering escalation required.",
  },
  fixed: {
    publicStatus: "fixed",
    internalStatus: "fixed_waiting_user_notification",
    help: "Suggest setting public status to Fixed and internal to Fixed (awaiting notification) or User notified.",
  },
  closed: {
    publicStatus: "closed",
    internalStatus: "closed",
    help: "Suggest setting public status to Closed and internal to Closed.",
  },
  resolved: {
    publicStatus: "resolved",
    internalStatus: "resolved",
    help: "Suggest setting public status to Resolved and internal to Resolved.",
  },
};

function CommunicationLogCard({ ticket }: { ticket: SupportTicketDetail }) {
  const qc = useQueryClient();
  const list = useListSupportTicketMessages(ticket.id);
  const create = useCreateSupportTicketMessage();
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [recordChannel, setRecordChannel] = useState<ChannelValue>("manual");
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  // Manual entry form state
  const [direction, setDirection] = useState<DirectionValue>("outbound");
  const [channel, setChannel] = useState<ChannelValue>("manual");
  const [messageType, setMessageType] =
    useState<MessageTypeValue>("custom");
  const [deliveryStatus, setDeliveryStatus] =
    useState<DeliveryStatusValue>("sent_manual");
  const [senderName, setSenderName] = useState("Support");
  const [recipientName, setRecipientName] = useState(
    ticket.reporterName ?? "",
  );
  const [recipientEmail, setRecipientEmail] = useState(
    ticket.reporterEmail ?? "",
  );
  const [recipientWhatsapp, setRecipientWhatsapp] = useState(
    ticket.reporterWhatsapp ?? "",
  );
  const [messageBody, setMessageBody] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const templates = useMemo(
    () =>
      COMM_TEMPLATES.map((t) => ({
        ...t,
        text: fillTemplate(t.body, ticket),
        messageType: TEMPLATE_TO_MESSAGE_TYPE[t.key] ?? "custom",
      })),
    [ticket],
  );

  function invalidate() {
    qc.invalidateQueries({
      queryKey: getListSupportTicketMessagesQueryKey(ticket.id),
    });
  }

  async function recordTemplateAsSent(t: {
    key: string;
    label: string;
    text: string;
    messageType: MessageTypeValue;
  }) {
    setRecordError(null);
    setRecordSaving(true);
    try {
      await create.mutateAsync({
        id: ticket.id,
        data: {
          direction: "outbound",
          channel: recordChannel,
          messageType: t.messageType,
          deliveryStatus: "sent_manual",
          senderName: "Support",
          recipientName: ticket.reporterName ?? null,
          recipientEmail: ticket.reporterEmail ?? null,
          recipientWhatsapp: ticket.reporterWhatsapp ?? null,
          messageBody: t.text,
          relatedPublicStatus: ticket.publicStatus,
          relatedInternalStatus: ticket.internalStatus,
        },
      });
      invalidate();
      setRecordingFor(null);
    } catch {
      setRecordError("Could not record message");
    } finally {
      setRecordSaving(false);
    }
  }

  async function saveManual() {
    if (!messageBody.trim()) return;
    setManualError(null);
    setManualSaving(true);
    try {
      await create.mutateAsync({
        id: ticket.id,
        data: {
          direction,
          channel,
          messageType,
          deliveryStatus,
          senderName: senderName.trim() || null,
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          recipientWhatsapp: recipientWhatsapp.trim() || null,
          messageBody: messageBody.trim(),
          relatedPublicStatus: ticket.publicStatus,
          relatedInternalStatus: ticket.internalStatus,
        },
      });
      invalidate();
      setMessageBody("");
    } catch {
      setManualError("Could not save communication");
    } finally {
      setManualSaving(false);
    }
  }

  const manualSuggestion = STATUS_SUGGESTION_BY_TYPE[messageType];
  const messages: SupportTicketMessage[] = list.data ?? [];

  return (
    <Card className="lg:col-span-2" data-testid="card-communication-log">
      <CardHeader>
        <CardTitle className="text-base">Communication log</CardTitle>
        <CardDescription>
          Copy-ready templates, manual entries, and a timeline of every
          message exchanged about this ticket. Email/WhatsApp sending is not
          wired up yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* A. Quick templates */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Quick message templates</h3>
          {templates.map((m) => {
            const isRecording = recordingFor === m.key;
            const suggestion = STATUS_SUGGESTION_BY_TYPE[m.messageType];
            return (
              <div
                key={m.key}
                className="rounded-md border bg-background p-3"
                data-testid={`template-${m.key}`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{m.label}</p>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton
                      text={m.text}
                      label={`Copy ${m.label.toLowerCase()} message`}
                      testId={`button-copy-${m.key}`}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setRecordError(null);
                        setRecordingFor(isRecording ? null : m.key);
                        setRecordChannel("manual");
                      }}
                      data-testid={`button-record-toggle-${m.key}`}
                    >
                      {isRecording ? "Cancel" : "Record as sent manually"}
                    </Button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {m.text}
                </pre>
                {suggestion && (
                  <p
                    className="mt-2 text-xs text-muted-foreground"
                    data-testid={`hint-${m.key}`}
                  >
                    {suggestion.help}
                  </p>
                )}
                {isRecording && (
                  <div
                    className="mt-3 space-y-2 rounded-md border bg-muted/40 p-2"
                    data-testid={`record-panel-${m.key}`}
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[180px]">
                        <Label className="text-xs text-muted-foreground">
                          Channel
                        </Label>
                        <SimpleSelect
                          value={recordChannel}
                          onChange={(v) =>
                            setRecordChannel(v as ChannelValue)
                          }
                          options={MESSAGE_CHANNEL_OPTIONS}
                          testId={`select-record-channel-${m.key}`}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => recordTemplateAsSent(m)}
                        disabled={recordSaving}
                        data-testid={`button-record-confirm-${m.key}`}
                      >
                        {recordSaving ? "Saving…" : "Confirm sent"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {recordError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{recordError}</AlertDescription>
            </Alert>
          )}
        </section>

        {/* B. Manual entry */}
        <section
          className="space-y-3 border-t pt-4"
          data-testid="manual-entry"
        >
          <h3 className="text-sm font-semibold">Manual communication entry</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Direction">
              <SimpleSelect
                value={direction}
                onChange={(v) => setDirection(v as DirectionValue)}
                options={MESSAGE_DIRECTION_OPTIONS}
                testId="select-manual-direction"
              />
            </Field>
            <Field label="Channel">
              <SimpleSelect
                value={channel}
                onChange={(v) => setChannel(v as ChannelValue)}
                options={MESSAGE_CHANNEL_OPTIONS}
                testId="select-manual-channel"
              />
            </Field>
            <Field label="Message type">
              <SimpleSelect
                value={messageType}
                onChange={(v) => setMessageType(v as MessageTypeValue)}
                options={MESSAGE_TYPE_OPTIONS}
                testId="select-manual-message-type"
              />
            </Field>
            <Field label="Delivery status">
              <SimpleSelect
                value={deliveryStatus}
                onChange={(v) =>
                  setDeliveryStatus(v as DeliveryStatusValue)
                }
                options={MESSAGE_DELIVERY_STATUS_OPTIONS}
                testId="select-manual-delivery-status"
              />
            </Field>
            <Field label="Sender name">
              <Input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                data-testid="input-manual-sender-name"
              />
            </Field>
            <Field label="Recipient name">
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                data-testid="input-manual-recipient-name"
              />
            </Field>
            <Field label="Recipient email">
              <Input
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                data-testid="input-manual-recipient-email"
              />
            </Field>
            <Field label="Recipient WhatsApp">
              <Input
                value={recipientWhatsapp}
                onChange={(e) => setRecipientWhatsapp(e.target.value)}
                data-testid="input-manual-recipient-whatsapp"
              />
            </Field>
          </div>
          <Field label="Message body">
            <Textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={4}
              placeholder="What was said?"
              data-testid="input-manual-body"
            />
          </Field>
          {manualSuggestion && (
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-manual-suggestion"
            >
              {manualSuggestion.help}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={saveManual}
              disabled={manualSaving || !messageBody.trim()}
              data-testid="button-save-manual-message"
            >
              {manualSaving ? "Saving…" : "Save communication"}
            </Button>
            {manualError && (
              <span className="text-xs text-destructive">{manualError}</span>
            )}
          </div>
        </section>

        {/* C. Timeline */}
        <section
          className="space-y-3 border-t pt-4"
          data-testid="messages-timeline"
        >
          <h3 className="text-sm font-semibold">
            Communication timeline ({messages.length})
          </h3>
          {list.isLoading && (
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          )}
          {!list.isLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No communication recorded yet.
            </p>
          )}
          <ul className="space-y-2">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

function MessageRow({ message }: { message: SupportTicketMessage }) {
  const isOutbound = message.direction === "outbound";
  const isInternal = message.direction === "internal";
  const wrapperClass = isInternal
    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
    : isOutbound
      ? "border-sky-300 bg-sky-50 dark:bg-sky-950/30"
      : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30";
  return (
    <li
      className={`rounded-md border p-3 ${wrapperClass}`}
      data-testid={`message-${message.id}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" data-testid={`badge-direction-${message.id}`}>
          {humanLabel(MESSAGE_DIRECTION_LABELS, message.direction)}
        </Badge>
        <Badge variant="secondary">
          {humanLabel(MESSAGE_TYPE_LABELS, message.messageType)}
        </Badge>
        <Badge variant="outline">
          {humanLabel(MESSAGE_CHANNEL_LABELS, message.channel)}
        </Badge>
        <Badge variant="outline">
          {humanLabel(
            MESSAGE_DELIVERY_STATUS_LABELS,
            message.deliveryStatus,
          )}
        </Badge>
        {isInternal && (
          <Badge className="bg-amber-500 text-amber-50">Internal</Badge>
        )}
        <span className="ml-auto text-muted-foreground">
          {formatDateTime(message.createdAt)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        From: {message.senderName ?? "—"}
        {message.senderRole ? ` (${message.senderRole})` : ""} · To:{" "}
        {message.recipientName ?? "—"}
      </p>
      <pre className="mt-2 whitespace-pre-wrap break-words text-sm">
        {message.messageBody}
      </pre>
    </li>
  );
}

function HandoffCard({ ticket }: { ticket: SupportTicketDetail }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Developer handoff</CardTitle>
        <CardDescription>
          Generates a copy-ready handoff. Linear integration arrives later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setText(buildHandoff(ticket))}
            data-testid="button-generate-handoff"
          >
            Generate Developer Handoff
          </Button>
          {text && (
            <CopyButton
              text={text}
              label="Copy handoff"
              testId="button-copy-handoff"
            />
          )}
        </div>
        {text && (
          <pre
            className="whitespace-pre-wrap break-words rounded-md border bg-background p-3 text-xs"
            data-testid="text-handoff"
          >
            {text}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function CopyButton({
  text,
  label,
  testId,
}: {
  text: string;
  label: string;
  testId: string;
}) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      data-testid={testId}
      aria-label={label}
    >
      {copied ? (
        <>
          <Check className="mr-1 h-3.5 w-3.5" /> Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3.5 w-3.5" /> Copy
        </>
      )}
    </Button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SimpleSelect({
  value,
  onChange,
  options,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  testId?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
