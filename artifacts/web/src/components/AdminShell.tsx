import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Ticket, 
  FileText, 
  Settings, 
  Webhook, 
  MonitorUp, 
  Menu,
  X,
  Package
} from "lucide-react";
import { SupportUserBadge } from "@/components/SupportUserBadge";
import { useSupportAuth } from "@/components/SupportAuthProvider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const [location] = useLocation();
  const { user } = useSupportAuth();
  const isAdmin = user?.role === "support_admin";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/admin/support/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/support/tickets", label: "Tickets", icon: Ticket },
    ...(isAdmin ? [
      { href: "/admin/support/templates", label: "Templates", icon: FileText },
      { href: "/admin/support/settings", label: "Settings", icon: Settings },
      { href: "/admin/support/integrations", label: "Integrations", icon: Webhook },
    ] : []),
  ];

  const externalItems = [
    { href: "/admin/support/wallboard", label: "Live Wallboard", icon: MonitorUp },
  ];

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4 sm:px-6">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Package className="h-5 w-5" />
          </div>
          <span className="text-sm tracking-tight">Support Centre</span>
        </div>
      </div>
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          <div className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Overview
          </div>
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href) && (item.href !== "/admin/support/dashboard" || location === "/admin/support/dashboard");
            return (
              <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                <span
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-accent/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </span>
              </Link>
            );
          })}

          <div className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-6 mb-2">
            Displays
          </div>
          {externalItems.map((item) => (
            <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer">
              <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer">
                <item.icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </span>
            </a>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50/50">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-white md:flex">
        <NavContent />
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 items-center justify-between border-b bg-white px-4 sm:px-6">
          <div className="flex items-center gap-4 md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <NavContent />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2 font-semibold">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground">
                <Package className="h-4 w-4" />
              </div>
              <span className="text-sm tracking-tight">Support Centre</span>
            </div>
          </div>
          
          {/* Top Bar Actions */}
          <div className="ml-auto flex items-center gap-4">
            <SupportUserBadge />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}