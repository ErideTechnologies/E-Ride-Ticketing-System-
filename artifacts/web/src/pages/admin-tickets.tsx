import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListSupportTickets,
  type SupportTicketListItem,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  CATEGORY_LABELS,
  INTERNAL_STATUS_LABELS,
  PRIORITY_LABELS,
  PUBLIC_STATUS_LABELS,
  REPORTER_TYPE_LABELS,
  SLA_STATUS_LABELS,
  formatSlaDuration,
  humanLabel,
  slaStatusBadgeClass,
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

function rowAccentClass(t: SupportTicketListItem): string {
  if (t.priority === "urgent") return "border-l-4 border-l-destructive";
  if (t.priority === "high") return "border-l-4 border-l-orange-500";
  if (t.internalStatus === "triage_required")
    return "border-l-4 border-l-amber-400";
  return "border-l-4 border-l-transparent";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminTicketsPage() {
  const [, navigate] = useLocation();
  const tickets = useListSupportTickets();

  const data = tickets.data ?? [];

  const summary = useMemo(() => {
    return {
      total: data.length,
      triage: data.filter((t) => t.internalStatus === "triage_required").length,
      urgent: data.filter((t) => t.priority === "urgent").length,
      high: data.filter((t) => t.priority === "high").length,
      overdue: data.filter((t) => t.sla?.slaStatus === "breached").length,
      dueSoon: data.filter((t) => t.sla?.slaStatus === "approaching").length,
    };
  }, [data]);

  function handleRowClick(t: SupportTicketListItem) {
    navigate(`/admin/support/tickets/${t.id}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Support Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            View and triage support tickets.
          </p>
        </div>
      </header>

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        data-testid="summary-cards"
      >
          <SummaryCard label="Total tickets" value={summary.total} />
          <SummaryCard label="Awaiting triage" value={summary.triage} accent="amber" />
          <SummaryCard label="Urgent" value={summary.urgent} accent="destructive" />
          <SummaryCard label="High priority" value={summary.high} accent="orange" />
          <SummaryCard label="SLA overdue" value={summary.overdue} accent="destructive" />
          <SummaryCard label="SLA due soon" value={summary.dueSoon} accent="amber" />
        </section>

        <section data-testid="tickets-section">
          {tickets.isLoading && (
            <p className="py-12 text-center text-muted-foreground">
              Loading support tickets…
            </p>
          )}

          {tickets.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                We could not load support tickets. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {!tickets.isLoading && !tickets.isError && data.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No support tickets found.
              </CardContent>
            </Card>
          )}

          {!tickets.isLoading && !tickets.isError && data.length > 0 && (
            <>
              <div className="hidden overflow-hidden rounded-md border bg-background lg:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Summary</th>
                      <th className="px-3 py-2">Reporter</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Public</th>
                      <th className="px-3 py-2">Internal</th>
                      <th className="px-3 py-2">SLA</th>
                      <th className="px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => handleRowClick(t)}
                        className={`cursor-pointer border-t hover:bg-muted/40 ${rowAccentClass(t)}`}
                        data-testid={`ticket-row-${t.ticketReference}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs font-semibold">
                          {t.ticketReference}
                        </td>
                        <td className="px-3 py-2">{t.productName}</td>
                        <td className="px-3 py-2 max-w-sm truncate" title={t.issueSummary}>
                          {t.issueSummary}
                        </td>
                        <td className="px-3 py-2">
                          <div>{t.reporterName}</div>
                          <div className="text-xs text-muted-foreground">
                            {humanLabel(REPORTER_TYPE_LABELS, t.reporterType)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {humanLabel(CATEGORY_LABELS, t.category)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={priorityBadgeClass(t.priority)}>
                            {humanLabel(PRIORITY_LABELS, t.priority)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {humanLabel(PUBLIC_STATUS_LABELS, t.publicStatus)}
                        </td>
                        <td className="px-3 py-2">
                          {humanLabel(INTERNAL_STATUS_LABELS, t.internalStatus)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <SlaCell sla={t.sla} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(t.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 lg:hidden">
                {data.map((t) => (
                  <Card
                    key={t.id}
                    onClick={() => handleRowClick(t)}
                    className={`cursor-pointer ${rowAccentClass(t)}`}
                    data-testid={`ticket-card-${t.ticketReference}`}
                  >
                    <CardContent className="space-y-2 pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">
                          {t.ticketReference}
                        </span>
                        <Badge className={priorityBadgeClass(t.priority)}>
                          {humanLabel(PRIORITY_LABELS, t.priority)}
                        </Badge>
                      </div>
                      <p className="font-medium">{t.issueSummary}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.productName} · {humanLabel(CATEGORY_LABELS, t.category)}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">
                          Public: {humanLabel(PUBLIC_STATUS_LABELS, t.publicStatus)}
                        </Badge>
                        <Badge variant="outline">
                          Internal: {humanLabel(INTERNAL_STATUS_LABELS, t.internalStatus)}
                        </Badge>
                        <SlaCell sla={t.sla} compact />
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t.reporterName} ·{" "}
                          {humanLabel(REPORTER_TYPE_LABELS, t.reporterType)}
                        </span>
                        <span>{formatDateTime(t.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "destructive" | "orange" | "amber";
}) {
  const accentColor =
    accent === "destructive"
      ? "text-destructive"
      : accent === "orange"
        ? "text-orange-600"
        : accent === "amber"
          ? "text-amber-600"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-semibold ${accentColor}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SlaCell({
  sla,
  compact,
}: {
  sla: SupportTicketListItem["sla"] | null | undefined;
  compact?: boolean;
}) {
  if (!sla) return <span className="text-muted-foreground">—</span>;
  const label = humanLabel(SLA_STATUS_LABELS, sla.slaStatus);
  let detail: string | null = null;
  if (sla.slaStatus === "breached" && sla.overdueMinutes != null) {
    detail = `${formatSlaDuration(sla.overdueMinutes)} over`;
  } else if (
    (sla.slaStatus === "approaching" || sla.slaStatus === "on_track") &&
    sla.minutesUntilDue != null
  ) {
    detail = `${formatSlaDuration(sla.minutesUntilDue)} left`;
  }
  return (
    <div className={compact ? "inline-flex items-center gap-1" : "space-y-1"}>
      <Badge className={slaStatusBadgeClass(sla.slaStatus)} data-testid="badge-sla">
        {label}
      </Badge>
      {detail && (
        <span className="text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}
