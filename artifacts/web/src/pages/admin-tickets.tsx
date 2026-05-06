import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useListSupportTickets,
  useListPublicSupportProducts,
  type ListSupportTicketsParams,
  type SupportTicketListItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { AlertTriangle } from "lucide-react";
import { CATEGORY_OPTIONS } from "@/lib/supportOptions";
import {
  CATEGORY_LABELS,
  INTERNAL_STATUS_LABELS,
  INTERNAL_STATUS_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  PUBLIC_STATUS_LABELS,
  PUBLIC_STATUS_OPTIONS,
  REPORTER_TYPE_LABELS,
  humanLabel,
} from "@/lib/supportLabels";

const ALL = "__all__";

type Filters = {
  productId: string;
  priority: string;
  publicStatus: string;
  internalStatus: string;
  category: string;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  productId: ALL,
  priority: ALL,
  publicStatus: ALL,
  internalStatus: ALL,
  category: ALL,
  search: "",
};

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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const products = useListPublicSupportProducts();

  const params: ListSupportTicketsParams = useMemo(() => {
    const p: ListSupportTicketsParams = {};
    if (filters.productId !== ALL) p.productId = filters.productId;
    if (filters.priority !== ALL)
      p.priority = filters.priority as ListSupportTicketsParams["priority"];
    if (filters.publicStatus !== ALL)
      p.publicStatus =
        filters.publicStatus as ListSupportTicketsParams["publicStatus"];
    if (filters.internalStatus !== ALL)
      p.internalStatus =
        filters.internalStatus as ListSupportTicketsParams["internalStatus"];
    if (filters.category !== ALL)
      p.category = filters.category as ListSupportTicketsParams["category"];
    if (filters.search.trim()) p.search = filters.search.trim();
    return p;
  }, [filters]);

  const tickets = useListSupportTickets(params);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const data = tickets.data ?? [];

  const summary = useMemo(() => {
    const productCount = (code: string) =>
      data.filter((t) => t.productCode === code).length;
    return {
      total: data.length,
      triage: data.filter((t) => t.internalStatus === "triage_required").length,
      urgent: data.filter((t) => t.priority === "urgent").length,
      high: data.filter((t) => t.priority === "high").length,
      ema: productCount("EMA"),
      bt8: productCount("8BT"),
      erd: productCount("ERD"),
    };
  }, [data]);

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function handleRowClick(t: SupportTicketListItem) {
    navigate(`/admin/support/tickets/${t.id}`);
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-primary">Eride Admin</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Eride Support Tickets
          </h1>
          <p className="text-muted-foreground">
            View and triage support tickets submitted across Eride products.
          </p>
        </header>

        <section
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
          data-testid="summary-cards"
        >
          <SummaryCard label="Total tickets" value={summary.total} />
          <SummaryCard label="Awaiting triage" value={summary.triage} accent="amber" />
          <SummaryCard label="Urgent" value={summary.urgent} accent="destructive" />
          <SummaryCard label="High priority" value={summary.high} accent="orange" />
          <SummaryCard label="E-Migration Assist" value={summary.ema} />
          <SummaryCard label="8Beauty" value={summary.bt8} />
          <SummaryCard label="Eride General" value={summary.erd} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>
              Narrow the list by product, priority, status, or keyword.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <FilterSelect
                testId="filter-product"
                placeholder="All products"
                value={filters.productId}
                onChange={(v) => update("productId", v)}
                options={[
                  { value: ALL, label: "All products" },
                  ...(products.data ?? []).map((p) => ({
                    value: p.id,
                    label: p.productName,
                  })),
                ]}
              />
              <FilterSelect
                testId="filter-priority"
                placeholder="All priorities"
                value={filters.priority}
                onChange={(v) => update("priority", v)}
                options={[
                  { value: ALL, label: "All priorities" },
                  ...PRIORITY_OPTIONS.map((o) => ({ ...o })),
                ]}
              />
              <FilterSelect
                testId="filter-public-status"
                placeholder="All public statuses"
                value={filters.publicStatus}
                onChange={(v) => update("publicStatus", v)}
                options={[
                  { value: ALL, label: "All public statuses" },
                  ...PUBLIC_STATUS_OPTIONS.map((o) => ({ ...o })),
                ]}
              />
              <FilterSelect
                testId="filter-internal-status"
                placeholder="All internal statuses"
                value={filters.internalStatus}
                onChange={(v) => update("internalStatus", v)}
                options={[
                  { value: ALL, label: "All internal statuses" },
                  ...INTERNAL_STATUS_OPTIONS.map((o) => ({ ...o })),
                ]}
              />
              <FilterSelect
                testId="filter-category"
                placeholder="All categories"
                value={filters.category}
                onChange={(v) => update("category", v)}
                options={[
                  { value: ALL, label: "All categories" },
                  ...CATEGORY_OPTIONS.map((o) => ({ ...o })),
                ]}
              />
              <Input
                placeholder="Search reference, name, summary…"
                value={filters.search}
                onChange={(e) => update("search", e.target.value)}
                data-testid="filter-search"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

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
    </main>
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

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  testId: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={placeholder} />
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
