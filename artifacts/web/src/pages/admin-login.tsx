import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { LogIn } from "lucide-react";
import { useSupportAuth } from "@/components/SupportAuthProvider";
import { PublicHero } from "@/components/PublicHero";
import { PublicShell } from "@/components/PublicShell";

export default function AdminLoginPage() {
  const { login, authenticated, loginConfigured, loading } = useSupportAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && authenticated) {
      navigate("/admin/support/dashboard");
    }
  }, [loading, authenticated, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/admin/support/dashboard");
  };

  const inputClass =
    "w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-[#E5E7EB] placeholder:text-[#5B6675] outline-none transition-colors focus:border-[#38BDF8]/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-[#38BDF8]/10";

  return (
    <PublicShell data-testid="page-admin-login">
      <PublicHero
        title="Support centre"
        titleAccent="admin"
        subtitle="Structured support. Controlled resolution. Internal staff access only."
      />

      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-[#38BDF8]/20 bg-gradient-to-br from-[#0B1824] via-[#08121C] to-[#040A10] p-7 shadow-[0_30px_80px_-36px_rgba(56,189,248,0.35)] sm:p-9">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/70 to-transparent"
            />

            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#38BDF8]/25 bg-[#38BDF8]/[0.08]">
                <LogIn className="h-5 w-5 text-[#38BDF8]" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#7DD3FC]">
                  Eride Dogma Support Centre
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-[#E5E7EB]">
                  Sign in
                </h2>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-[#7B8694]">
              Use your authorised work email to access the support dashboard.
            </p>

          {!loginConfigured && (
              <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-200">
                Internal sign-in is not configured. An administrator must set
                <code className="mx-1 rounded bg-white/10 px-1">SUPPORT_AUTH_PASSWORD</code>
                and the
                <code className="mx-1 rounded bg-white/10 px-1">SUPPORT_*_EMAILS</code>
                environment variables.
              </div>
          )}

            <form className="mt-7 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[#94A3B8]"
                >
                  Work email
                </label>
                <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                  className={inputClass}
                  placeholder="you@company.com"
                data-testid="login-email"
              />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[#94A3B8]"
                >
                  Password
                </label>
                <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                  className={inputClass}
                  placeholder="••••••••"
                data-testid="login-password"
              />
              </div>
              {error && (
                <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-xs leading-relaxed text-red-200">
                  {error}
                </p>
            )}
              <button
              type="submit"
              disabled={submitting || !loginConfigured}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#38BDF8]/50 bg-[#0EA5E9] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgba(14,165,233,0.9)] transition-all hover:border-[#7DD3FC] hover:bg-[#0284C7] focus:outline-none focus:ring-4 focus:ring-[#38BDF8]/20 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="login-submit"
            >
              {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="mt-5 text-center text-xs text-[#7B8694]">
              Need an administrator account?{" "}
              <Link
                href="/admin/support/register"
                className="font-semibold text-[#38BDF8] hover:text-[#7DD3FC]"
              >
                Register here
              </Link>
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
