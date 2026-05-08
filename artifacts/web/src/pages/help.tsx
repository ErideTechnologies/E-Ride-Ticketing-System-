import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LifeBuoy, Search } from "lucide-react";
import { PublicHero } from "@/components/PublicHero";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PublicHero
        align="center"
        title="How can we help?"
        subtitle="Found a bug or something not working? Let us know and our team will take a look."
        data-testid="hero-help"
      />

      <div className="mx-auto -mt-8 max-w-2xl space-y-5 px-4 pb-16 sm:-mt-10">
        <Card
          className="relative overflow-hidden border-[#E5E7EB] bg-white shadow-sm transition-shadow hover:shadow-md"
          data-testid="card-report-problem"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[#8FA1B5] to-[#5F7182]"
          />
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 pl-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] ring-1 ring-[#E5E7EB]">
              <LifeBuoy className="h-5 w-5 text-[#1F2933]" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-[#0B0F14]">Report a problem</CardTitle>
              <CardDescription className="text-[#64748B]">
                Submit a support ticket and get a reference you can follow up
                with.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pl-6">
            <Button
              asChild
              data-testid="button-report-problem"
              className="bg-[#0B0F14] text-white hover:bg-[#050505] focus-visible:ring-[#8FA1B5]"
            >
              <Link href="/help/report-problem">Report a problem</Link>
            </Button>
          </CardContent>
        </Card>

        <Card
          className="relative overflow-hidden border-[#E5E7EB] bg-white shadow-sm transition-shadow hover:shadow-md"
          data-testid="card-track-ticket"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] bg-[#3B4652]"
          />
          <CardHeader className="flex flex-row items-start gap-3 space-y-0 pl-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] ring-1 ring-[#E5E7EB]">
              <Search className="h-5 w-5 text-[#1F2933]" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-[#0B0F14]">
                Track an existing ticket
              </CardTitle>
              <CardDescription className="text-[#64748B]">
                Look up the latest status using your reference and contact
                details.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pl-6">
            <Button
              asChild
              variant="outline"
              data-testid="button-track-ticket"
              className="border-[#CBD5E1] bg-white text-[#1F2933] hover:bg-[#F8FAFC] focus-visible:ring-[#8FA1B5]"
            >
              <Link href="/help/track-ticket">Track my ticket</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
