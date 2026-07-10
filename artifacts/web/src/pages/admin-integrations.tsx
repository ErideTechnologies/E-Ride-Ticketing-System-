import { useState } from "react";
import { Link } from "wouter";
import {
  useGetSupportIntegrationsStatus,
  useSendSupportIntegrationEmailTest,
  type SupportIntegrationStatusCard,
  type SupportIntegrationEnvVar,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Send,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SupportUserBadge } from "@/components/SupportUserBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSupportAuth } from "@/components/SupportAuthProvider";

export default function AdminIntegrationsPage() {
  const { user } = useSupportAuth();
  const status = useGetSupportIntegrationsStatus();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold tracking-tight text-foreground"
            data-testid="text-integrations-title"
          >
            Integrations
          </h1>
          <p className="text-sm text-muted-foreground">
            Live snapshot of every external dependency. Secret values are
            never shown — only configured / not-configured.
          </p>
        </div>
      </header>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => status.refetch()}
            disabled={status.isFetching}
            data-testid="button-refresh-status"
          >
            {status.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          {status.data && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-last-checked"
            >
              Last checked {new Date(status.data.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {status.isLoading && (
          <p
            className="flex items-center gap-2 text-muted-foreground"
            data-testid="text-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Loading integration
            status…
          </p>
        )}

        {status.isError && (
          <Alert variant="destructive" data-testid="alert-status-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Could not load integration status. You may not have permission.
            </AlertDescription>
          </Alert>
        )}

        {status.data && (
          <div className="grid gap-4 md:grid-cols-2">
            {status.data.cards.map((card) => (
              <IntegrationCard
                key={card.key}
                card={card}
                callerEmail={user?.email ?? ""}
              />
            ))}
          </div>
        )}
    </div>
  );
}

function StatusBadge({ card }: { card: SupportIntegrationStatusCard }) {
  if (card.configured && !card.fallback) {
    return (
      <Badge
        className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100"
        data-testid={`badge-status-${card.key}`}
      >
        <CheckCircle2 className="mr-1 h-3 w-3" /> Configured
      </Badge>
    );
  }
  if (card.configured && card.fallback) {
    return (
      <Badge
        className="bg-amber-100 text-amber-900 hover:bg-amber-100"
        data-testid={`badge-status-${card.key}`}
      >
        <AlertTriangle className="mr-1 h-3 w-3" /> Fallback
      </Badge>
    );
  }
  if (!card.configured && card.fallback) {
    return (
      <Badge
        className="bg-amber-100 text-amber-900 hover:bg-amber-100"
        data-testid={`badge-status-${card.key}`}
      >
        <AlertTriangle className="mr-1 h-3 w-3" /> Manual
      </Badge>
    );
  }
  return (
    <Badge
      variant="destructive"
      data-testid={`badge-status-${card.key}`}
    >
      <XCircle className="mr-1 h-3 w-3" /> Not configured
    </Badge>
  );
}

function EnvVarRow({ v }: { v: SupportIntegrationEnvVar }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <code className="font-mono text-xs text-muted-foreground">{v.name}</code>
      {v.configured ? (
        <span
          className="inline-flex items-center text-xs text-emerald-700"
          data-testid={`env-${v.name}`}
        >
          <CheckCircle2 className="mr-1 h-3 w-3" /> set
        </span>
      ) : (
        <span
          className="inline-flex items-center text-xs text-muted-foreground"
          data-testid={`env-${v.name}`}
        >
          <XCircle className="mr-1 h-3 w-3" /> not set
        </span>
      )}
    </div>
  );
}

function IntegrationCard({
  card,
  callerEmail,
}: {
  card: SupportIntegrationStatusCard;
  callerEmail: string;
}) {
  return (
    <Card data-testid={`card-integration-${card.key}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{card.label}</CardTitle>
            <CardDescription>
              {describeCard(card)}
            </CardDescription>
          </div>
          <StatusBadge card={card} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {card.requiredEnvVars.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Required
            </p>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              {card.requiredEnvVars.map((v) => (
                <EnvVarRow key={v.name} v={v} />
              ))}
            </div>
          </div>
        )}
        {card.optionalEnvVars.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Optional
            </p>
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
              {card.optionalEnvVars.map((v) => (
                <EnvVarRow key={v.name} v={v} />
              ))}
            </div>
          </div>
        )}
        <CardSpecificDetails card={card} />
        {card.key === "email" && (
          <EmailTestPanel defaultRecipient={callerEmail} />
        )}
        {card.key === "sentry" &&
          card.details["testEndpointShouldBeOffInProd"] === true && (
            <Alert
              variant="destructive"
              data-testid="alert-sentry-test-endpoint"
            >
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Sentry test endpoint is enabled. Disable
                ENABLE_SENTRY_TEST_ENDPOINT in production once verification is
                done.
              </AlertDescription>
            </Alert>
          )}
        {card.key === "attachments" &&
          card.details["mode"] === "local-fallback" && (
            <Alert
              variant="default"
              data-testid="alert-attachments-fallback"
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Local fallback in use. Set SUPPORT_ATTACHMENTS_DIR to a
                persistent volume in production.
              </AlertDescription>
            </Alert>
          )}
      </CardContent>
    </Card>
  );
}

function describeCard(card: SupportIntegrationStatusCard): string {
  switch (card.key) {
    case "auth":
      return "Shared password + per-role email allow-lists for the support workspace.";
    case "publicTicket":
      return "HMAC signing key for the 30-minute public ticket access tokens.";
    case "email":
      return "Outbound email via Resend. Falls back to drafted-only when missing.";
    case "sentry":
      return "Backend + frontend error reporting with PII redaction.";
    case "linear":
      return "Engineering escalation to Linear with per-product team mapping.";
    case "whatsapp":
      return "WhatsApp delivery — manual mode is intentionally OK.";
    case "attachments":
      return "On-disk storage for ticket attachments.";
    case "hermes":
      return "Outbound-only signed webhook to the Hermes agent on ticket lifecycle events. No reporter PII or message content is sent.";
  }
}

function CardSpecificDetails({
  card,
}: {
  card: SupportIntegrationStatusCard;
}) {
  const entries = Object.entries(card.details).filter(
    ([k]) => k !== "warning" && k !== "description",
  );
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Details
      </p>
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-2 py-0.5"
          >
            <span className="text-muted-foreground">{k}</span>
            <span
              className="font-mono"
              data-testid={`detail-${card.key}-${k}`}
            >
              {formatDetailValue(v)}
            </span>
          </div>
        ))}
      </div>
      {typeof card.details["description"] === "string" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {String(card.details["description"])}
        </p>
      )}
    </div>
  );
}

function formatDetailValue(v: unknown): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (v === null || v === undefined) return "—";
  return String(v);
}

function EmailTestPanel({ defaultRecipient }: { defaultRecipient: string }) {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [result, setResult] = useState<
    | null
    | {
        success: boolean;
        disabled: boolean;
        recipient: string;
        sentAt: string;
        providerMessageId?: string | null;
        errorMessage?: string | null;
      }
  >(null);
  const send = useSendSupportIntegrationEmailTest();

  async function onSend() {
    setResult(null);
    try {
      const r = await send.mutateAsync({
        data: { recipient: recipient.trim() || null },
      });
      setResult(r);
    } catch (err) {
      setResult({
        success: false,
        disabled: false,
        recipient,
        sentAt: new Date().toISOString(),
        providerMessageId: null,
        errorMessage:
          err instanceof Error ? err.message : "Could not send test email",
      });
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <Label
        htmlFor="email-test-recipient"
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Send test email
      </Label>
      <div className="flex gap-2">
        <Input
          id="email-test-recipient"
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="you@example.com"
          data-testid="input-email-test-recipient"
          autoComplete="off"
        />
        <Button
          onClick={onSend}
          disabled={send.isPending || !recipient.trim()}
          data-testid="button-send-test-email"
        >
          {send.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send
        </Button>
      </div>
      {result && (
        <div
          className="text-xs"
          data-testid="text-email-test-result"
        >
          {result.disabled ? (
            <span className="text-amber-700">
              Email is disabled. {result.errorMessage}
            </span>
          ) : result.success ? (
            <span className="text-emerald-700">
              Sent to {result.recipient}
              {result.providerMessageId
                ? ` (id: ${result.providerMessageId})`
                : ""}
            </span>
          ) : (
            <span className="text-destructive">
              Failed: {result.errorMessage ?? "unknown error"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
