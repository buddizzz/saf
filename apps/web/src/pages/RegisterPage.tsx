import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { useAuth, type Owner } from "../lib/auth";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ token: string; owner: Owner }>(
        "/auth/register",
        { method: "POST", body: JSON.stringify(form) },
      );
      login(res.token, res.owner);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("auth.registerTitle")}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">{t("auth.name")}</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">{t("auth.email")}</label>
          <input
            className="field"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">{t("auth.password")}</label>
          <input
            className="field"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={8}
            required
          />
        </div>
        <div>
          <label className="label">{t("auth.phone")}</label>
          <input
            className="field"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+9665XXXXXXXX"
          />
        </div>
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t("common.loading") : t("auth.submitRegister")}
        </button>
        <Link
          to="/login"
          className="block text-center text-sm font-bold text-brand-600 hover:underline"
        >
          {t("auth.haveAccount")}
        </Link>
      </form>
    </AuthShell>
  );
}

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-5">
        <header className="mx-auto flex w-full max-w-md items-center justify-between py-5 lg:mx-0">
          <Link to="/">
            <Logo />
          </Link>
          <LanguageSwitcher />
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <h1 className="mb-6 animate-fade-in text-2xl font-extrabold text-brand-800">
            {title}
          </h1>
          <div className="card animate-scale-in">{children}</div>
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 lg:flex lg:items-center lg:justify-center">
        <div className="pointer-events-none absolute -top-24 end-[-4rem] h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-4rem] start-[-2rem] h-72 w-72 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="relative z-10 max-w-sm px-10 text-center text-white">
          <Logo size={96} showWordmark={false} className="mx-auto mb-6" />
          <p className="text-xl font-extrabold leading-relaxed">
            {t("auth.brandPitch")}
          </p>
        </div>
      </div>
    </div>
  );
}
