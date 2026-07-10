import { Link } from "wouter";
import {
  useGetSupportWallboard,
  useGetSupportSlaSummary,
  useListSupportTickets,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Inbox, ListChecks } from "lucide-react";
import { humanLabel, INTERNAL_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/supportLabels";
import { Button } from "@/components/ui/button";

export default function AdminDashboardPage() {
  const wallboardQuery = useGetSupportWallboard();
  const slaQuery = useGetSupportSlaSummary();
  const recentTicketsQuery = useListSupportTickets();

  const wallboard = wallboardQuery.data;
  const sla = slaQuery.data;
  const recentTickets = recentTicketsQuery.data?.slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ticketing Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Get a high-level view of current support operations.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard 
          title="Total Open Tickets" 
          value={wallboard?.summary.totalOpenTickets ?? 0} 
          icon={Inbox}
        />
        <SummaryCard 
          title="Awaiting Triage" 
          value={wallboard?.summary.awaitingTriage ?? 0} 
          icon={ListChecks}
          alert={wallboard?.summary.awaitingTriage ? (wallboard.summary.awaitingTriage > 5) : false}
        />
        <SummaryCard 
          title="Urgent Priority" 
          value={wallboard?.summary.urgentTickets ?? 0} 
          icon={AlertTriangle}
          alert={wallboard?.summary.urgentTickets ? (wallboard.summary.urgentTickets > 0) : false}
        />
        <SummaryCard 
          title="SLA Breached" 
          value={wallboard?.summary.slaBreached ?? 0} 
          icon={Clock}
          alert={wallboard?.summary.slaBreached ? (wallboard.summary.slaBreached > 0) : false}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product Breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Open Tickets by Product</CardTitle>
          </CardHeader>
          <CardContent>
            {wallboard?.productBreakdown.length ? (
              <div className="space-y-4">
                {wallboard.productBreakdown.map(prod => (
                  <div key={prod.productId} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="font-medium text-sm">{prod.productName}</div>
                      <div className="text-xs text-muted-foreground">{prod.productCode}</div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div className="text-center">
                        <div className="font-semibold">{prod.openTickets}</div>
                        <div className="text-xs text-muted-foreground">Open</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-destructive">{prod.urgentTickets}</div>
                        <div className="text-xs text-muted-foreground">Urgent</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">No open tickets across products.</div>
            )}
          </CardContent>
        </Card>

        {/* SLA Status overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">SLA Performance</CardTitle>
          </CardHeader>
          <CardContent>
             {sla ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">On Track</span>
                  <span className="font-medium">{sla.totals.onTrack}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground text-amber-600">Approaching Breach</span>
                  <span className="font-medium text-amber-600">{sla.totals.approaching}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground text-destructive">Breached</span>
                  <span className="font-medium text-destructive">{sla.totals.breached}</span>
                </div>
              </div>
             ) : (
               <div className="text-sm text-muted-foreground py-4">Loading SLA data...</div>
             )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Tickets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg">Recent Tickets</CardTitle>
            <CardDescription>Latest support requests across all queues.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/support/tickets">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentTickets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Summary</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentTickets.map(t => (
                    <tr key={t.id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/admin/support/tickets/${t.id}`}>
                          <span className="font-mono text-xs font-semibold cursor-pointer hover:underline text-primary">
                            {t.ticketReference}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">{t.productCode}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={t.issueSummary}>
                        {t.issueSummary}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-normal">
                          {humanLabel(INTERNAL_STATUS_LABELS, t.internalStatus)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={
                          t.priority === 'urgent' ? 'bg-destructive/10 text-destructive border-transparent' : 
                          t.priority === 'high' ? 'bg-orange-100 text-orange-700 border-transparent' : 'border-transparent'
                        }>
                          {humanLabel(PRIORITY_LABELS, t.priority)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              No recent tickets found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, alert = false }: { title: string, value: number, icon: any, alert?: boolean }) {
  return (
    <Card className={alert ? "border-destructive/50 bg-destructive/5" : ""}>
      <CardContent className="p-6 flex flex-row items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={`text-3xl font-bold tracking-tight ${alert ? "text-destructive" : ""}`}>{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${alert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}