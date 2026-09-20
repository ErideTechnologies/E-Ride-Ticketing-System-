import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { UserPlus } from "lucide-react";
import { useSupportAuth } from "@/components/SupportAuthProvider";
import { PublicHero } from "@/components/PublicHero";
import { PublicShell } from "@/components/PublicShell";

const REGISTER_URL = `${import.meta.env.BASE_URL}api/support/auth/register`;

export default function AdminRegisterPage() {
  const { authenticated, loading, refresh } = useSupportAuth();
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && authenticated) {
      navigate("/admin/support/dashboard");
    }
  }, [authenticated, loading, navigate]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(REGISTER_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          surname: surname.trim(),
          email: email.trim(),
          password,
          confirmPassword,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(body?.error || "Registration failed");
        return;
      }
      await refresh();
      navigate("/admin/support/dashboard");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-sm text-[#E5E7EB] placeholder:text-[#5B6675] outline-none transition-colors focus:border-[#38BDF8]/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-[#38BDF8]/10";

  return (
    <PublicShell data-testid="page-admin-register">
      <PublicHero
        title="Create an"
        titleAccent="admin account"
        subtitle="Register an administrator for the Eride Dogma Support Centre."
      />

      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-lg">
          <div className="relative overflow-hidden rounded-3xl border border-[#38BDF8]/20 bg-gradient-to-br from-[#0B1824] via-[#08121C] to-[#040A10] p-7 shadow-[0_30px_80px_-36px_rgba(56,189,248,0.35)] sm:p-9">
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/70 to-transparent"
            />
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#38BDF8]/25 bg-[#38BDF8]/[0.08]">
                <UserPlus className="h-5 w-5 text-[#38BDF8]" />
              </span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#7DD3FC]">
                  Administrator registration
                </p>
                <h2 className="text-xl font-semibold tracking-tight text-[#E5E7EB]">
                  Your account details
                </h2>
              </div>
            </div>

            <form className="mt-7 space-y-4" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="first-name">
                  <input
                    id="first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className={inputClass}
                    autoComplete="given-name"
                    required
                  />
                </Field>
                <Field label="Surname" htmlFor="surname">
                  <input
                    id="surname"
                    value={surname}
                    onChange={(event) => setSurname(event.target.value)}
                    className={inputClass}
                    autoComplete="family-name"
                    required
                  />
                </Field>
              </div>
              <Field label="Email" htmlFor="register-email">
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password" htmlFor="register-password">
                <input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </Field>
              <Field label="Confirm password" htmlFor="confirm-password">
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </Field>

              {error && (
                <p className="rounded-xl border border-red-400/30 bg-red-400/[0.06] px-4 py-3 text-xs leading-relaxed text-red-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center rounded-xl border border-[#38BDF8]/50 bg-[#0EA5E9] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-14px_rgba(14,165,233,0.9)] transition-all hover:border-[#7DD3FC] hover:bg-[#0284C7] focus:outline-none focus:ring-4 focus:ring-[#38BDF8]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Creating account…" : "Register admin"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-[#7B8694]">
              Already registered?{" "}
              <Link
                href="/admin/support/login"
                className="font-semibold text-[#38BDF8] hover:text-[#7DD3FC]"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[10px] uppercase tracking-[0.22em] text-[#94A3B8]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}