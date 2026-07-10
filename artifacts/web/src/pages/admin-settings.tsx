import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSupportSettings,
  useUpdateSupportSettings,
  getGetSupportSettingsQueryKey,
  type SupportSettings,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Loader2,
  Save,
  AlertTriangle,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SupportUserBadge } from "@/components/SupportUserBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AdminSettingsPage() {
  const query = useGetSupportSettings();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold tracking-tight text-foreground"
            data-testid="text-settings-title"
          >
            Support Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure email defaults, sender identity, and public-ticket
            behaviour for the support workspace.
          </p>
        </div>
      </header>

        {query.isLoading && (
          <p
            className="flex items-center gap-2 text-muted-foreground"
            data-testid="text-settings-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
          </p>
        )}

        {query.isError && (
          <Alert variant="destructive" data-testid="alert-settings-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Could not load settings.</AlertDescription>
          </Alert>
        )}

        {query.data && <SettingsForm settings={query.data} />}

        <Card data-testid="card-settings-integrations-link">
          <CardHeader>
            <CardTitle className="text-base">Integrations</CardTitle>
            <CardDescription>
              Verify which external services (email, Sentry, Linear, WhatsApp,
              attachments) are configured. No secrets are shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/support/integrations">
              <Button
                variant="outline"
                size="sm"
                data-testid="link-integrations"
              >
                Open integrations status
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card data-testid="card-settings-help">
          <CardHeader>
            <CardTitle className="text-base">Heads up</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Settings are Eride-scoped for now. Future organisations can have
            their own settings.
          </CardContent>
        </Card>

        <DangerZone />
    </div>
  );
}

function DangerZone() {
  const qc = useQueryClient();
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function purge() {
    if (pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch("/api/support/admin/purge-tickets", {
        method: "POST",
        credentials: "include",
      });
      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        deletedTickets?: number;
        error?: string;
        attachmentDirsFailed?: number;
      };
      if (!resp.ok || data.success === false) {
        setError(
          data.error ??
            `Purge failed (HTTP ${resp.status}). The endpoint may be disabled.`,
        );
      } else {
        setResult(
          `Deleted ${data.deletedTickets ?? 0} ticket(s). The list will now be empty and numbering restarts at 000001.`,
        );
        qc.invalidateQueries();
        setOpen(false);
        setConfirmText("");
      }
    } catch {
      setError("Network error while contacting the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      className="border-destructive/40"
      data-testid="card-settings-danger-zone"
    >
      <CardHeader>
        <CardTitle className="text-base text-destructive">
          Danger zone
        </CardTitle>
        <CardDescription>
          Permanently delete every support ticket and its attachments. This
          cannot be undone. Ticket numbering restarts at 000001.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <Alert data-testid="alert-purge-result">
            <Check className="h-4 w-4" />
            <AlertDescription>{result}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" data-testid="alert-purge-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              data-testid="button-purge-tickets"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete all tickets
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all support tickets?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes every ticket, message, note,
                attachment, and history entry. It cannot be undone. Type{" "}
                <span className="font-semibold">DELETE</span> below to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              data-testid="input-purge-confirm"
            />
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-purge-cancel">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText !== "DELETE" || pending}
                onClick={(e) => {
                  e.preventDefault();
                  void purge();
                }}
                data-testid="button-purge-confirm"
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function SettingsForm({ settings }: { settings: SupportSettings }) {
  const qc = useQueryClient();
  const update = useUpdateSupportSettings();
  const [form, setForm] = useState({
    supportDisplayName: settings.supportDisplayName,
    supportEmailFrom: settings.supportEmailFrom,
    supportEmailReplyTo: settings.supportEmailReplyTo,
    defaultSenderName: settings.defaultSenderName,
    defaultSenderRole: settings.defaultSenderRole,
    publicTicketTokenTtlMinutes: settings.publicTicketTokenTtlMinutes,
    allowPublicReplies: settings.allowPublicReplies,
    allowPublicAttachments: settings.allowPublicAttachments,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      supportDisplayName: settings.supportDisplayName,
      supportEmailFrom: settings.supportEmailFrom,
      supportEmailReplyTo: settings.supportEmailReplyTo,
      defaultSenderName: settings.defaultSenderName,
      defaultSenderRole: settings.defaultSenderRole,
      publicTicketTokenTtlMinutes: settings.publicTicketTokenTtlMinutes,
      allowPublicReplies: settings.allowPublicReplies,
      allowPublicAttachments: settings.allowPublicAttachments,
    });
  }, [settings]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setSaved(false);
    setError(null);
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        data: {
          supportDisplayName: form.supportDisplayName.trim(),
          supportEmailFrom: form.supportEmailFrom.trim(),
          supportEmailReplyTo: form.supportEmailReplyTo.trim(),
          defaultSenderName: form.defaultSenderName.trim(),
          defaultSenderRole: form.defaultSenderRole.trim(),
          publicTicketTokenTtlMinutes: Number(form.publicTicketTokenTtlMinutes),
          allowPublicReplies: form.allowPublicReplies,
          allowPublicAttachments: form.allowPublicAttachments,
        },
      });
      qc.invalidateQueries({ queryKey: getGetSupportSettingsQueryKey() });
      setSaved(true);
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e?.data?.error ?? e?.message ?? "Could not save settings.");
    }
  }

  return (
    <div className="space-y-6">
      <Card data-testid="card-email-settings">
        <CardHeader>
          <CardTitle className="text-base">Email settings</CardTitle>
          <CardDescription>
            Used as the from / reply-to addresses on outgoing support email.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Support display name" id="supportDisplayName">
            <Input
              id="supportDisplayName"
              data-testid="input-support-display-name"
              value={form.supportDisplayName}
              onChange={(e) => set("supportDisplayName", e.target.value)}
            />
          </Field>
          <Field
            label="From email"
            id="supportEmailFrom"
            help={`Plain "support@example.com" or "Display Name <support@example.com>".`}
          >
            <Input
              id="supportEmailFrom"
              data-testid="input-support-email-from"
              value={form.supportEmailFrom}
              onChange={(e) => set("supportEmailFrom", e.target.value)}
            />
          </Field>
          <Field label="Reply-to email" id="supportEmailReplyTo">
            <Input
              id="supportEmailReplyTo"
              data-testid="input-support-email-reply-to"
              value={form.supportEmailReplyTo}
              onChange={(e) => set("supportEmailReplyTo", e.target.value)}
            />
          </Field>
          <Field label="Default sender name" id="defaultSenderName">
            <Input
              id="defaultSenderName"
              data-testid="input-default-sender-name"
              value={form.defaultSenderName}
              onChange={(e) => set("defaultSenderName", e.target.value)}
            />
          </Field>
          <Field label="Default sender role" id="defaultSenderRole">
            <Input
              id="defaultSenderRole"
              data-testid="input-default-sender-role"
              value={form.defaultSenderRole}
              onChange={(e) => set("defaultSenderRole", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card data-testid="card-public-ticket-settings">
        <CardHeader>
          <CardTitle className="text-base">Public ticket settings</CardTitle>
          <CardDescription>
            Behaviour of the public ticket tracking experience.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            label="Public ticket token TTL (minutes)"
            id="publicTicketTokenTtlMinutes"
            help="Between 5 and 1440 minutes."
          >
            <Input
              id="publicTicketTokenTtlMinutes"
              data-testid="input-token-ttl"
              type="number"
              min={5}
              max={1440}
              value={form.publicTicketTokenTtlMinutes}
              onChange={(e) =>
                set("publicTicketTokenTtlMinutes", Number(e.target.value))
              }
            />
          </Field>
          <SwitchRow
            id="allowPublicReplies"
            label="Allow public replies"
            description="Reporters can post replies from the public ticket page."
            checked={form.allowPublicReplies}
            onChange={(v) => set("allowPublicReplies", v)}
            testId="switch-allow-public-replies"
          />
          <SwitchRow
            id="allowPublicAttachments"
            label="Allow public attachments"
            description="Reporters can upload attachments from the public ticket page."
            checked={form.allowPublicAttachments}
            onChange={(v) => set("allowPublicAttachments", v)}
            testId="switch-allow-public-attachments"
          />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" data-testid="alert-settings-save-error">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert data-testid="alert-settings-saved">
          <Check className="h-4 w-4" />
          <AlertDescription>Settings saved.</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={update.isPending}
          data-testid="button-save-settings"
        >
          {update.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}
