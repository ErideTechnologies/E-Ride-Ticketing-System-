import { Component, type ErrorInfo, type ReactNode } from "react";
import { Sentry } from "@/lib/sentry";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean; eventId: string | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, eventId: null };

  static getDerivedStateFromError(): State {
    return { hasError: true, eventId: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    let eventId: string | null = null;
    try {
      eventId = Sentry.captureException(error, {
        extra: { componentStack: info.componentStack },
      });
    } catch {
      // never let Sentry capture itself crash the boundary
    }
    this.setState({ eventId });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { eventId } = this.state;
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        data-testid="error-boundary-fallback"
      >
        <div className="max-w-md rounded-lg border bg-background p-6 text-center shadow-sm">
          <h1
            className="mb-2 text-xl font-semibold"
            data-testid="error-boundary-title"
          >
            Something went wrong.
          </h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Our team has been notified. Please try again or report the problem
            if it continues.
          </p>
          {eventId && (
            <p
              className="mb-4 font-mono text-xs text-muted-foreground"
              data-testid="error-boundary-reference"
            >
              Reference: {eventId}
            </p>
          )}
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              data-testid="button-error-reload"
            >
              Try again
            </Button>
            <a href={`${import.meta.env.BASE_URL}help/report-problem`}>
              <Button data-testid="button-error-report-problem">
                Report a Problem
              </Button>
            </a>
          </div>
        </div>
      </main>
    );
  }
}
