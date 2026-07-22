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
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto flex max-w-md flex-col px-6 py-8">
        <h1 className="mb-6 text-2xl font-extrabold text-brand-800">{title}</h1>
        <div className="card">{children}</div>
      </main>
    </div>
  );
}
