import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSupportMessageTemplates,
  useGetSupportMessageTemplate,
  useUpdateSupportMessageTemplate,
  usePreviewSupportMessageTemplate,
  getListSupportMessageTemplatesQueryKey,
  getGetSupportMessageTemplateQueryKey,
  type SupportMessageTemplate,
  type SupportTemplateChannel,
  type SupportTemplateKey,
  type ListSupportMessageTemplatesParams,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Loader2,
  Save,
  AlertTriangle,
  Check,
  Eye,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TEMPLATE_KEY_OPTIONS: { value: SupportTemplateKey; label: string }[] = [
  { value: "ticket_received", label: "Ticket received" },
  { value: "under_review", label: "Under review" },
  { value: "more_info_needed", label: "More info needed" },
  { value: "escalated_to_engineering", label: "Escalated to engineering" },
  { value: "fixed", label: "Fixed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "reopened", label: "Reopened" },
  { value: "custom", label: "Custom" },
];
const TEMPLATE_KEY_LABELS = Object.fromEntries(
  TEMPLATE_KEY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<SupportTemplateKey, string>;

const CHANNEL_OPTIONS: { value: SupportTemplateChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
  { value: "in_app", label: "In-app" },
];
const CHANNEL_LABELS = Object.fromEntries(
  CHANNEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<SupportTemplateChannel, string>;

const ALL = "__all";
type ActiveFilter = "all" | "active" | "inactive";

export default function AdminTemplatesPage() {
  const [channel, setChannel] = useState<SupportTemplateChannel | "__all">(ALL);
  const [templateKey, setTemplateKey] = useState<SupportTemplateKey | "__all">(
    ALL,
  );
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: ListSupportMessageTemplatesParams = {};
    if (channel !== ALL) p.channel = channel;
    if (templateKey !== ALL) p.templateKey = templateKey;
    if (activeFilter === "active") p.isActive = true;
    if (activeFilter === "inactive") p.isActive = false;
    return p;
  }, [channel, templateKey, activeFilter]);

  const query = useListSupportMessageTemplates(params);

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/admin/support/tickets">
          <Button variant="ghost" size="sm" data-testid="link-back-tickets">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to tickets
          </Button>
        </Link>
        <header className="space-y-1">
          <p className="text-sm font-medium text-primary">Eride Admin</p>
          <h1
            className="text-3xl font-semibold tracking-tight"
            data-testid="text-templates-title"
          >
            Support Message Templates
          </h1>
          <p className="text-muted-foreground">
            Manage the messages used for support emails and manual user updates.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">Channel</Label>
                <Select
                  value={channel}
                  onValueChange={(v) =>
                    setChannel(v as SupportTemplateChannel | "__all")
                  }
                >
                  <SelectTrigger data-testid="filter-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All channels</SelectItem>
                    {CHANNEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Template key</Label>
                <Select
                  value={templateKey}
                  onValueChange={(v) =>
                    setTemplateKey(v as SupportTemplateKey | "__all")
                  }
                >
                  <SelectTrigger data-testid="filter-template-key">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All keys</SelectItem>
                    {TEMPLATE_KEY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={activeFilter}
                  onValueChange={(v) => setActiveFilter(v as ActiveFilter)}
                >
                  <SelectTrigger data-testid="filter-active">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="inactive">Inactive only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {query.isLoading && (
          <p
            className="flex items-center gap-2 text-muted-foreground"
            data-testid="text-templates-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
          </p>
        )}
        {query.isError && (
          <Alert variant="destructive" data-testid="alert-templates-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Could not load templates.</AlertDescription>
          </Alert>
        )}
        {query.data && query.data.length === 0 && (
          <p className="text-muted-foreground" data-testid="text-templates-empty">
            No templates match the current filters.
          </p>
        )}
        {query.data && query.data.length > 0 && (
          <div className="grid gap-3" data-testid="list-templates">
            {query.data.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onEdit={() => setEditingId(t.id)}
              />
            ))}
          </div>
        )}

        {editingId && (
          <EditTemplateDialog
            id={editingId}
            onClose={() => setEditingId(null)}
          />
        )}
      </div>
    </main>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: SupportMessageTemplate;
  onEdit: () => void;
}) {
  return (
    <Card data-testid={`template-row-${template.id}`}>
      <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-medium"
              data-testid={`text-template-name-${template.id}`}
            >
              {template.templateName}
            </span>
            <Badge variant="outline">
              {TEMPLATE_KEY_LABELS[template.templateKey] ?? template.templateKey}
            </Badge>
            <Badge variant="secondary">
              {CHANNEL_LABELS[template.channel] ?? template.channel}
            </Badge>
            {template.isActive ? (
              <Badge className="bg-emerald-600">Active</Badge>
            ) : (
              <Badge variant="destructive">Inactive</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Updated {new Date(template.updatedAt).toLocaleString()}
          </p>
          {template.subject && (
            <p className="text-xs text-muted-foreground">
              Subject: {template.subject}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          data-testid={`button-edit-template-${template.id}`}
        >
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </Button>
      </CardContent>
    </Card>
  );
}

function EditTemplateDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const query = useGetSupportMessageTemplate(id);
  const update = useUpdateSupportMessageTemplate();
  const previewMutation = usePreviewSupportMessageTemplate();
  const [form, setForm] = useState<{
    templateName: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    isActive: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<{
    renderedSubject?: string | null;
    renderedBodyText: string;
    renderedBodyHtml?: string | null;
    usedSampleTicket: boolean;
  } | null>(null);

  useEffect(() => {
    if (query.data && !form) {
      setForm({
        templateName: query.data.templateName,
        subject: query.data.subject ?? "",
        bodyText: query.data.bodyText,
        bodyHtml: query.data.bodyHtml ?? "",
        isActive: query.data.isActive,
      });
    }
  }, [query.data, form]);

  if (!query.data || !form) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center gap-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading template…
          </CardContent>
        </Card>
      </div>
    );
  }

  const t = query.data;
  const isEmail = t.channel === "email";

  async function doPreview() {
    if (!form) return;
    setError(null);
    try {
      const result = await previewMutation.mutateAsync({
        data: {
          templateKey: t.templateKey,
          channel: t.channel,
          subject: form.subject || null,
          bodyText: form.bodyText,
          bodyHtml: form.bodyHtml || null,
        },
      });
      setPreview(result);
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error ?? e?.message ?? "Preview failed.");
    }
  }

  async function save() {
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        id,
        data: {
          templateName: form.templateName.trim(),
          subject: isEmail ? form.subject.trim() : form.subject.trim() || null,
          bodyText: form.bodyText,
          bodyHtml: form.bodyHtml.trim() ? form.bodyHtml : null,
          isActive: form.isActive,
        },
      });
      qc.invalidateQueries({
        queryKey: getListSupportMessageTemplatesQueryKey(),
      });
      qc.invalidateQueries({
        queryKey: getGetSupportMessageTemplateQueryKey(id),
      });
      setSaved(true);
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error ?? e?.message ?? "Could not save template.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <Card
        className="my-8 w-full max-w-3xl"
        data-testid="template-edit-dialog"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Edit template</CardTitle>
            <CardDescription>
              {TEMPLATE_KEY_LABELS[t.templateKey]} ·{" "}
              {CHANNEL_LABELS[t.channel]}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-edit"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <div>
              <span className="text-muted-foreground">Template key:</span>{" "}
              <span data-testid="text-edit-template-key">{t.templateKey}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Channel:</span>{" "}
              <span data-testid="text-edit-template-channel">{t.channel}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="templateName">Template name</Label>
            <Input
              id="templateName"
              data-testid="input-template-name"
              value={form.templateName}
              onChange={(e) =>
                setForm({ ...form, templateName: e.target.value })
              }
            />
          </div>

          {isEmail && (
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                data-testid="input-template-subject"
                value={form.subject}
                onChange={(e) =>
                  setForm({ ...form, subject: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                You can use variables like{" "}
                <code>{"{{ticketReference}}"}</code>.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bodyText">Body (text)</Label>
            <Textarea
              id="bodyText"
              data-testid="textarea-template-body-text"
              value={form.bodyText}
              onChange={(e) =>
                setForm({ ...form, bodyText: e.target.value })
              }
              rows={10}
            />
            <p className="text-xs text-muted-foreground">
              Variables: <code>{"{{ticketReference}}"}</code>{" "}
              <code>{"{{productName}}"}</code>{" "}
              <code>{"{{productCode}}"}</code>{" "}
              <code>{"{{reporterName}}"}</code>{" "}
              <code>{"{{publicStatus}}"}</code>{" "}
              <code>{"{{issueSummary}}"}</code>{" "}
              <code>{"{{supportDisplayName}}"}</code>{" "}
              <code>{"{{supportEmailReplyTo}}"}</code>.
            </p>
          </div>

          {isEmail && (
            <div className="space-y-1.5">
              <Label htmlFor="bodyHtml">Body (HTML, optional)</Label>
              <Textarea
                id="bodyHtml"
                data-testid="textarea-template-body-html"
                value={form.bodyHtml}
                onChange={(e) =>
                  setForm({ ...form, bodyHtml: e.target.value })
                }
                rows={6}
                placeholder="Leave empty to auto-render from body text."
              />
              <p className="text-xs text-muted-foreground">
                Script tags, iframes, inline event handlers, and javascript:
                URLs are rejected.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="isActive" className="text-sm font-medium">
                Active
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, the system falls back to the built-in template.
              </p>
            </div>
            <Switch
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              data-testid="switch-template-active"
            />
          </div>

          {error && (
            <Alert variant="destructive" data-testid="alert-template-error">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert data-testid="alert-template-saved">
              <Check className="h-4 w-4" />
              <AlertDescription>Template saved.</AlertDescription>
            </Alert>
          )}

          {preview && (
            <Card
              className="bg-muted/40"
              data-testid="card-template-preview"
            >
              <CardHeader>
                <CardTitle className="text-sm">Preview</CardTitle>
                <CardDescription>
                  {preview.usedSampleTicket
                    ? "Rendered with sample ticket data."
                    : "Rendered with real ticket data."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {preview.renderedSubject && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Subject
                    </p>
                    <p data-testid="text-preview-subject">
                      {preview.renderedSubject}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Body
                  </p>
                  <pre
                    className="whitespace-pre-wrap font-sans"
                    data-testid="text-preview-body"
                  >
                    {preview.renderedBodyText}
                  </pre>
                </div>
                {preview.renderedBodyHtml && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      HTML preview
                    </p>
                    <iframe
                      title="HTML preview"
                      className="h-64 w-full rounded border bg-white"
                      sandbox=""
                      srcDoc={preview.renderedBodyHtml}
                      data-testid="iframe-preview-html"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={doPreview}
              disabled={previewMutation.isPending}
              data-testid="button-preview-template"
            >
              {previewMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview
            </Button>
            <Button
              onClick={save}
              disabled={update.isPending}
              data-testid="button-save-template"
            >
              {update.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save template
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
