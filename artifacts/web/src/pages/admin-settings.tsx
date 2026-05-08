import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSupportSettings,
  useUpdateSupportSettings,
  getGetSupportSettingsQueryKey,
  type SupportSettings,
} from "@workspace/api-client-react";
import { ArrowLeft, Loader2, Save, AlertTriangle, Check } from "lucide-react";
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

export default function AdminSettingsPage() {
  const query = useGetSupportSettings();

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/admin/support/tickets">
          <Button variant="ghost" size="sm" data-testid="link-back-tickets">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to tickets
          </Button>
        </Link>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-primary">Eride Admin</p>
            <h1
              className="text-3xl font-semibold tracking-tight"
              data-testid="text-settings-title"
            >
              Support Settings
            </h1>
            <p className="text-muted-foreground">
              Configure email defaults, sender identity, and public-ticket
              behaviour for the support workspace.
            </p>
          </div>
          <SupportUserBadge />
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

        <Card data-testid="card-settings-help">
          <CardHeader>
            <CardTitle className="text-base">Heads up</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Settings are Eride-scoped for now. Future organisations can have
            their own settings.
          </CardContent>
        </Card>
      </div>
    </main>
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
