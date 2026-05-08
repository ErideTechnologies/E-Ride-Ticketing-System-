import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useSupportAuth } from "@/components/SupportAuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdminLoginPage() {
  const { login, authenticated, loginConfigured, loading } = useSupportAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && authenticated) {
      navigate("/admin/support/tickets");
    }
  }, [loading, authenticated, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email.trim(), password, name.trim() || undefined);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/admin/support/tickets");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="space-y-2">
          <p className="dogma-eyebrow">Eride Dogma Support Centre</p>
          <CardTitle>Sign in</CardTitle>
          <p className="text-xs text-muted-foreground">
            Structured support. Controlled resolution. Internal staff access only.
          </p>
        </CardHeader>
        <CardContent>
          {!loginConfigured && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Internal sign-in is not configured. An administrator must set
                <code className="mx-1 rounded bg-slate-200 px-1">SUPPORT_AUTH_PASSWORD</code>
                and the
                <code className="mx-1 rounded bg-slate-200 px-1">SUPPORT_*_EMAILS</code>
                environment variables.
              </AlertDescription>
            </Alert>
          )}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">Display name (optional)</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How your name appears in audit logs"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={submitting || !loginConfigured}
              className="w-full"
              data-testid="login-submit"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
