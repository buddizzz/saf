import { FormEvent, useState } from "react";
import { useAdminAuth } from "../lib/auth";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { login, bootstrap } = useAdminAuth();
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await bootstrap(form.name, form.email, form.password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "فشل الدخول");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-500">
            Platform Admin
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">صفّ — لوحة المنصة</h1>
          <p className="mt-2 text-sm text-ink-700/70">
            دخول مخصّص لفريق المنصة فقط. لا تستخدم حساب صاحب المحل هنا.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "bootstrap" && (
            <div>
              <label className="label">الاسم</label>
              <input
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}
          <div>
            <label className="label">البريد</label>
            <input
              className="field"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">كلمة المرور</label>
            <input
              className="field"
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={mode === "bootstrap" ? 10 : 1}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "…" : mode === "login" ? "دخول" : "إنشاء Super Admin"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm font-medium text-accent-600 hover:underline"
          onClick={() =>
            setMode((m) => (m === "login" ? "bootstrap" : "login"))
          }
        >
          {mode === "login"
            ? "أول تشغيل؟ أنشئ Super Admin"
            : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
    </div>
  );
}
