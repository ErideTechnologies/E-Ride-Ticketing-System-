import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LifeBuoy } from "lucide-react";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-sm font-medium text-primary">Eride Support</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            How can we help?
          </h1>
          <p className="text-muted-foreground">
            Found a bug or something not working? Let us know and our team will
            take a look.
          </p>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <LifeBuoy className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <CardTitle>Report a problem</CardTitle>
              <CardDescription>
                Submit a support ticket and get a reference you can follow up
                with.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild data-testid="button-report-problem">
              <Link href="/help/report-problem">Report a problem</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
