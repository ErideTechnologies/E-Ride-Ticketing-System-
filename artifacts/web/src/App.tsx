import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HelpPage from "@/pages/help";
import ReportProblemPage from "@/pages/report-problem";
import AdminTicketsPage from "@/pages/admin-tickets";
import AdminTicketDetailPage from "@/pages/admin-ticket-detail";
import AdminWallboardPage from "@/pages/admin-wallboard";
import ErrorBoundaryTestPage from "@/pages/error-boundary-test";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/help" />} />
      <Route path="/help" component={HelpPage} />
      <Route path="/help/report-problem" component={ReportProblemPage} />
      <Route path="/admin/support/wallboard" component={AdminWallboardPage} />
      <Route path="/admin/support/tickets" component={AdminTicketsPage} />
      <Route path="/admin/support/tickets/:id" component={AdminTicketDetailPage} />
      <Route path="/__boundary-test" component={ErrorBoundaryTestPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
