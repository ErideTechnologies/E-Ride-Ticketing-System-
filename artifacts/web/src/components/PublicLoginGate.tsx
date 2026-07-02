import { useState, type ReactNode } from "react";
import { LogIn } from "lucide-react";
import { useSupportAuth } from "@/components/SupportAuthProvider";
import { PublicShell } from "@/components/PublicShell";
import { PublicHero } from "@/components/PublicHero";

/**
 * Authentication gate for the public support surfaces (`/help*`).
 *
 * When unauthenticated, the landing/cards/report/track pages are replaced by
 * an "Eride Support" branded sign-in screen. On successful login the wrapped
 * page renders automatically (the auth provider refreshes session state), so
 * the user lands back on whichever ticketing page they requested.
 *
 * Reuses the existing support-auth session (work email + SUPPORT_AUTH_PASSWORD)
 * — the same credentials as the internal dashboard. No new API is introduced.
 */
export function PublicLoginGate({ children }: { children: ReactNode }) {
  const { authenticated, loading, login, loginConfigured } = useSupportAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <PublicShell data-testid="page-public-login-loading">
        <div className="flex min-h-[50vh] items-center justify-center font-mono text-[11px] uppercase tracking-[0.28em] text-[#7B8694]">
          Loading…
        </div>
      </PublicShell>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
    }
    // On success the provider flips `authenticated` to true and this gate
    // re-renders the requested page — no manual redirect needed.
  };

  const inputClass =
    "w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-[#E5E7EB] placeholder:text-[#5B6675] outline-none transition-colors focus:border-[#38BDF8]/50 focus:bg-white/[0.05]";

  return (
    <PublicShell data-testid="page-public-login">
      <PublicHero
        title="Sign in to"
        titleAccent="continue"
        subtitle="Use your work email to access the internal ticketing system."
      />

      <section className="px-5 pb-20 sm:px-8" data-testid="section-login">
        <div className="mx-auto max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#0B1218] via-[#080D13] to-[#04080C] p-7 sm:p-9">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/40 to-transparent"
            />

            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
                <LogIn className="h-5 w-5 text-[#38BDF8]" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#7B8694]">
                  Internal access
                </p>
                <h2 className="text-lg font-semibold tracking-tight text-[#E5E7EB]">
                  Eride Support
                </h2>
              </div>
            </div>

            {!loginConfigured && (
              <div
                className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-200"
                data-testid="login-not-configured"
              >
                Sign-in is not configured. An administrator must set the
                {" "}
                <code className="rounded bg-white/10 px-1">
                  SUPPORT_AUTH_PASSWORD
                </code>{" "}
                and{" "}
                <code className="rounded bg-white/10 px-1">SUPPORT_*_EMAILS</code>{" "}
                environment variables.
              </div>
            )}

            <form className="mt-7 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <label
                  htmlFor="public-login-email"
                  className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[#7B8694]"
                >
                  Work email
                </label>
                <input
                  id="public-login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="you@company.com"
                  data-testid="public-login-email"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="public-login-password"
                  className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[#7B8694]"
                >
                  Password
                </label>
                <input
                  id="public-login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="••••••••"
                  data-testid="public-login-password"
                />
              </div>

              {error && (
                <p
                  className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-xs leading-relaxed text-red-200"
                  data-testid="public-login-error"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !loginConfigured}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/[0.12] px-4 py-3 text-sm font-semibold text-[#E5E7EB] transition-all hover:border-[#38BDF8]/60 hover:bg-[#38BDF8]/[0.18] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="public-login-submit"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="mt-5 text-xs leading-relaxed text-[#7B8694]">
              Use your work email to access the internal ticketing system.
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
