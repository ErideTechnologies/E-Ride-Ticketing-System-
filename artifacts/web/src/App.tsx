import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupportAuthProvider } from "@/components/SupportAuthProvider";
import { RequireSupportAuth } from "@/components/RequireSupportAuth";
import { PublicLoginGate } from "@/components/PublicLoginGate";
import NotFound from "@/pages/not-found";
import HelpPage from "@/pages/help";
import ReportProblemPage from "@/pages/report-problem";
import ReportProblemConfirmationPage from "@/pages/report-problem-confirmation";
import TrackTicketPage from "@/pages/track-ticket";
import PublicTicketPage from "@/pages/public-ticket";
import AdminLoginPage from "@/pages/admin-login";
import AdminTicketsPage from "@/pages/admin-tickets";
import AdminTicketDetailPage from "@/pages/admin-ticket-detail";
import AdminWallboardPage from "@/pages/admin-wallboard";
import AdminTemplatesPage from "@/pages/admin-templates";
import AdminSettingsPage from "@/pages/admin-settings";
import AdminIntegrationsPage from "@/pages/admin-integrations";
import ErrorBoundaryTestPage from "@/pages/error-boundary-test";

// Frontend smoke route. Only mounted outside production builds. To enable
// in production for one-off Sentry verification, build with
// VITE_ENABLE_BOUNDARY_TEST=true.
const BOUNDARY_TEST_ENABLED =
  import.meta.env.MODE !== "production" ||
  import.meta.env["VITE_ENABLE_BOUNDARY_TEST"] === "true";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/help" />} />
      <Route path="/help">
        <PublicLoginGate>
          <HelpPage />
        </PublicLoginGate>
      </Route>
      <Route path="/help/report-problem">
        <PublicLoginGate>
          <ReportProblemPage />
        </PublicLoginGate>
      </Route>
      <Route path="/help/report-problem/confirmation">
        <PublicLoginGate>
          <ReportProblemConfirmationPage />
        </PublicLoginGate>
      </Route>
      <Route path="/help/track-ticket">
        <PublicLoginGate>
          <TrackTicketPage />
        </PublicLoginGate>
      </Route>
      <Route path="/help/ticket/:ticketReference">
        <PublicLoginGate>
          <PublicTicketPage />
        </PublicLoginGate>
      </Route>
      <Route path="/admin/support/login" component={AdminLoginPage} />
      <Route path="/admin/support/wallboard">
        <RequireSupportAuth>
          <AdminWallboardPage />
        </RequireSupportAuth>
      </Route>
      <Route path="/admin/support/templates">
        <RequireSupportAuth roles={["support_admin"]}>
          <AdminTemplatesPage />
        </RequireSupportAuth>
      </Route>
      <Route path="/admin/support/settings">
        <RequireSupportAuth roles={["support_admin"]}>
          <AdminSettingsPage />
        </RequireSupportAuth>
      </Route>
      <Route path="/admin/support/integrations">
        <RequireSupportAuth roles={["support_admin"]}>
          <AdminIntegrationsPage />
        </RequireSupportAuth>
      </Route>
      <Route path="/admin/support/tickets">
        <RequireSupportAuth>
          <AdminTicketsPage />
        </RequireSupportAuth>
      </Route>
      <Route path="/admin/support/tickets/:id">
        <RequireSupportAuth>
          <AdminTicketDetailPage />
        </RequireSupportAuth>
      </Route>
      {BOUNDARY_TEST_ENABLED && (
        <Route path="/__boundary-test" component={ErrorBoundaryTestPage} />
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SupportAuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </SupportAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
