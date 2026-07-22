import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { useAuth, type Owner } from "../lib/auth";
import { AuthShell } from "./RegisterPage";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ token: string; owner: Owner }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      login(res.token, res.owner);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("auth.loginTitle")}>
      <form onSubmit={submit} className="space-y-4">
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
            required
          />
        </div>
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t("common.loading") : t("auth.submitLogin")}
        </button>
        <Link
          to="/register"
          className="block text-center text-sm font-bold text-brand-600 hover:underline"
        >
          {t("auth.noAccount")}
        </Link>
      </form>
    </AuthShell>
  );
}
