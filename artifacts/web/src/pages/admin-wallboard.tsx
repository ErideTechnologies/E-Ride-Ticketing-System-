import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetSupportWallboard,
  getGetSupportWallboardQueryKey,
  type SupportWallboardTicket,
  type SupportWallboardProductBreakdown,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  INTERNAL_STATUS_LABELS,
  PRIORITY_LABELS,
  PUBLIC_STATUS_LABELS,
  REPORTER_TYPE_LABELS,
  humanLabel,
} from "@/lib/supportLabels";

const REFRESH_INTERVAL_MS = 60_000;

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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

function ticketAccentClass(t: SupportWallboardTicket): string {
  if (t.priority === "urgent")
    return "border-l-8 border-l-destructive bg-destructive/5";
  if (t.priority === "high") return "border-l-8 border-l-orange-500";
  if (t.internalStatus === "triage_required" || t.internalStatus === "new")
    return "border-l-8 border-l-amber-400";
  return "border-l-8 border-l-transparent";
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminWallboardPage() {
  const wallboard = useGetSupportWallboard({
    query: {
      queryKey: getGetSupportWallboardQueryKey(),
      refetchInterval: REFRESH_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const data = wallboard.data;
  const lastUpdated = useMemo(
    () => (data ? new Date(data.lastUpdated) : null),
    [data],
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6">
        <header
          className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
          data-testid="wallboard-header"
        >
          <div>
            <h1
              className="text-3xl font-bold tracking-tight sm:text-5xl"
              data-testid="text-wallboard-title"
            >
              Eride Support Command Centre
            </h1>
            <p className="mt-2 text-base text-slate-300 sm:text-lg">
              Live support and bug ticket visibility across Eride products.
            </p>
          </div>
          <div className="flex flex-col gap-1 text-right text-sm text-slate-300 sm:text-base">
            <p
              className="text-2xl font-semibold tabular-nums text-slate-100 sm:text-4xl"
              data-testid="text-wallboard-clock"
            >
              {formatTime(now)}
            </p>
            <p>{formatDate(now)}</p>
            <p
              className="inline-flex items-center justify-end gap-2 text-xs text-slate-400 sm:text-sm"
              data-testid="text-wallboard-last-updated"
            >
              {wallboard.isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {lastUpdated
                ? `Last updated ${formatTime(lastUpdated)}`
                : "Loading…"}
              · auto-refresh every 60s
            </p>
            <div className="mt-2 flex justify-end">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"
                data-testid="link-full-dashboard"
              >
                <Link href="/admin/support/tickets">
                  View Full Ticket Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        {wallboard.error && (
          <Alert
            variant="destructive"
            className="border-destructive bg-destructive/20 text-destructive-foreground"
            data-testid="alert-wallboard-error"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Could not load wallboard data. Retrying…
            </AlertDescription>
          </Alert>
        )}

        {!data && wallboard.isLoading && (
          <p
            className="flex items-center gap-2 text-slate-300"
            data-testid="text-wallboard-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" /> Loading wallboard…
          </p>
        )}

        {data && (
          <>
            <section data-testid="wallboard-kpis">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-8">
                <KpiCard
                  testId="kpi-open"
                  label="Open Tickets"
                  value={data.summary.totalOpenTickets}
                  tone="default"
                />
                <KpiCard
                  testId="kpi-urgent"
                  label="Urgent"
                  value={data.summary.urgentTickets}
                  tone="urgent"
                />
                <KpiCard
                  testId="kpi-high"
                  label="High Priority"
                  value={data.summary.highPriorityTickets}
                  tone="high"
                />
                <KpiCard
                  testId="kpi-triage"
                  label="Awaiting Triage"
                  value={data.summary.awaitingTriage}
                  tone="warn"
                />
                <KpiCard
                  testId="kpi-needs-info"
                  label="Needs User Info"
                  value={data.summary.needsUserInfo}
                  tone="default"
                />
                <KpiCard
                  testId="kpi-eng"
                  label="Engineering Escalations"
                  value={data.summary.engineeringEscalationRequired}
                  tone="warn"
                />
                <KpiCard
                  testId="kpi-qa"
                  label="In QA"
                  value={data.summary.inQaVerification}
                  tone="default"
                />
                <KpiCard
                  testId="kpi-waiting-notify"
                  label="Waiting User Notification"
                  value={data.summary.fixedWaitingUserNotification}
                  tone="info"
                />
              </div>
            </section>

            <section data-testid="wallboard-product-breakdown">
              <SectionHeading
                title="Product breakdown"
                subtitle={`${data.productBreakdown.length} active products`}
              />
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.productBreakdown.map((p) => (
                  <ProductCard key={p.productId} product={p} />
                ))}
                {data.productBreakdown.length === 0 && (
                  <p className="text-slate-300">No active products configured.</p>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <TicketListCard
                title="Urgent / High Priority"
                subtitle="Newest open urgent or high tickets"
                tickets={data.urgentHighTickets}
                emptyMessage="No urgent tickets."
                testId="list-urgent-high"
                tone="urgent"
              />
              <TicketListCard
                title="Awaiting Triage"
                subtitle="Newest tickets needing first review"
                tickets={data.awaitingTriageTickets}
                emptyMessage="Triage queue clear."
                testId="list-awaiting-triage"
                tone="warn"
              />
              <TicketListCard
                title="Waiting User Notification"
                subtitle="Fixed and ready to notify the reporter"
                tickets={data.waitingUserNotificationTickets}
                emptyMessage="No user notifications pending."
                testId="list-waiting-notify"
                tone="info"
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number;
  tone: "default" | "urgent" | "high" | "warn" | "info";
  testId: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: "border-slate-800 bg-slate-900",
    urgent:
      value > 0
        ? "border-destructive bg-destructive/20 text-destructive-foreground animate-pulse"
        : "border-slate-800 bg-slate-900",
    high:
      value > 0
        ? "border-orange-500/60 bg-orange-500/15"
        : "border-slate-800 bg-slate-900",
    warn:
      value > 0
        ? "border-amber-400/50 bg-amber-400/10"
        : "border-slate-800 bg-slate-900",
    info:
      value > 0
        ? "border-sky-500/50 bg-sky-500/10"
        : "border-slate-800 bg-slate-900",
  };
  return (
    <Card
      className={`border-2 ${toneClasses[tone]} text-slate-100 shadow-lg`}
      data-testid={testId}
    >
      <CardContent className="p-3 sm:p-5">
        <p className="text-xs uppercase tracking-wide text-slate-300 sm:text-sm">
          {label}
        </p>
        <p
          className="mt-2 text-4xl font-bold tabular-nums sm:text-6xl"
          data-testid={`${testId}-value`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
      {subtitle && (
        <p className="text-xs text-slate-400 sm:text-sm">{subtitle}</p>
      )}
    </div>
  );
}

function ProductCard({
  product,
}: {
  product: SupportWallboardProductBreakdown;
}) {
  return (
    <Card
      className="border-slate-800 bg-slate-900 text-slate-100 shadow-lg"
      data-testid={`product-${product.productCode}`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>{product.productName}</span>
          <Badge
            variant="outline"
            className="border-slate-700 text-slate-300"
          >
            {product.productCode}
          </Badge>
        </CardTitle>
        <CardDescription className="text-slate-400">
          {product.openTickets} open ticket{product.openTickets === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-5 gap-2 pt-0 text-center">
        <ProductStat label="Open" value={product.openTickets} />
        <ProductStat
          label="Urgent"
          value={product.urgentTickets}
          tone="urgent"
        />
        <ProductStat
          label="High"
          value={product.highPriorityTickets}
          tone="high"
        />
        <ProductStat
          label="Triage"
          value={product.awaitingTriage}
          tone="warn"
        />
        <ProductStat
          label="Resolved Today"
          value={product.resolvedToday}
          tone="info"
        />
      </CardContent>
    </Card>
  );
}

function ProductStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "urgent" | "high" | "warn" | "info";
}) {
  const colour: Record<typeof tone, string> = {
    default: "text-slate-100",
    urgent: value > 0 ? "text-destructive-foreground" : "text-slate-400",
    high: value > 0 ? "text-orange-400" : "text-slate-400",
    warn: value > 0 ? "text-amber-300" : "text-slate-400",
    info: value > 0 ? "text-sky-300" : "text-slate-400",
  };
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums ${colour[tone]}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}

function TicketListCard({
  title,
  subtitle,
  tickets,
  emptyMessage,
  testId,
  tone,
}: {
  title: string;
  subtitle: string;
  tickets: SupportWallboardTicket[];
  emptyMessage: string;
  testId: string;
  tone: "urgent" | "warn" | "info";
}) {
  const toneBorder: Record<typeof tone, string> = {
    urgent: "border-destructive/60",
    warn: "border-amber-400/40",
    info: "border-sky-500/40",
  };
  return (
    <Card
      className={`border-2 ${toneBorder[tone]} bg-slate-900 text-slate-100 shadow-lg`}
      data-testid={testId}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-slate-400">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tickets.length === 0 ? (
          <p
            className="text-slate-300"
            data-testid={`${testId}-empty`}
          >
            {emptyMessage}
          </p>
        ) : (
          tickets.map((t) => <TicketRow key={t.id} ticket={t} />)
        )}
      </CardContent>
    </Card>
  );
}

function TicketRow({ ticket }: { ticket: SupportWallboardTicket }) {
  return (
    <Link
      href={`/admin/support/tickets/${ticket.id}`}
      className="block"
      data-testid={`wallboard-ticket-${ticket.id}`}
    >
      <div
        className={`rounded-md bg-slate-950/40 p-3 transition hover:bg-slate-800/60 ${ticketAccentClass(
          ticket,
        )}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge className={priorityBadgeClass(ticket.priority)}>
              {humanLabel(PRIORITY_LABELS, ticket.priority)}
            </Badge>
            <span className="font-mono text-xs text-slate-300">
              {ticket.ticketReference}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {timeAgo(ticket.createdAt)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-100">
          {ticket.issueSummary}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>{ticket.productName}</span>
          <span>·</span>
          <span>
            Public: {humanLabel(PUBLIC_STATUS_LABELS, ticket.publicStatus)}
          </span>
          <span>·</span>
          <span>
            Internal: {humanLabel(INTERNAL_STATUS_LABELS, ticket.internalStatus)}
          </span>
          <span>·</span>
          <span>{humanLabel(REPORTER_TYPE_LABELS, ticket.reporterType)}</span>
        </div>
      </div>
    </Link>
  );
}
