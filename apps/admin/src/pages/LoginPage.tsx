import { FormEvent, useState } from "react";
import { useAdminAuth } from "../lib/auth";
import { ApiError, adminFetch } from "../lib/api";

export function LoginPage() {
  const { login, bootstrap, verify2fa } = useAdminAuth();
  const [mode, setMode] = useState<"login" | "bootstrap" | "2fa">("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    code: "",
  });
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "2fa" && pendingToken) {
        await verify2fa(pendingToken, form.code);
        return;
      }
      if (mode === "bootstrap") {
        await bootstrap(form.name, form.email, form.password);
        return;
      }
      const result = await login(form.email, form.password);
      if (result?.requires_2fa && result.pending_token) {
        setPendingToken(result.pending_token);
        setMode("2fa");
      }
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
            دخول مخصّص لفريق المنصة فقط. التحقق بخطوتين إلزامي بعد التفعيل.
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
          {mode !== "2fa" && (
            <>
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
            </>
          )}
          {mode === "2fa" && (
            <div>
              <label className="label">رمز المصادقة (6 أرقام)</label>
              <input
                className="field font-mono tracking-widest"
                dir="ltr"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                autoFocus
              />
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy
              ? "…"
              : mode === "login"
                ? "دخول"
                : mode === "2fa"
                  ? "تأكيد 2FA"
                  : "إنشاء Super Admin"}
          </button>
        </form>

        {mode !== "2fa" && (
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
        )}
      </div>
    </div>
  );
}

export function TwoFactorSetupCard() {
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setErr(null);
    const res = await adminFetch<{ secret: string; otpauth_url: string }>(
      "/admin/auth/2fa/setup",
      { method: "POST" },
    );
    setSecret(res.secret);
    setOtpauth(res.otpauth_url);
  };

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await adminFetch("/admin/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setMsg("تم تفعيل التحقق بخطوتين");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "فشل التفعيل");
    }
  };

  return (
    <div className="panel space-y-3">
      <h3 className="font-bold">التحقق بخطوتين (2FA)</h3>
      <p className="text-sm text-ink-700/70">
        إلزامي لحسابات لوحة المنصة. استخدم تطبيق Authenticator.
      </p>
      {!secret ? (
        <button className="btn-primary" type="button" onClick={() => void start()}>
          بدء الإعداد
        </button>
      ) : (
        <form onSubmit={enable} className="space-y-3">
          <div className="rounded-lg bg-ink-50 p-3 font-mono text-xs break-all" dir="ltr">
            {secret}
          </div>
          {otpauth && (
            <a className="text-xs text-accent-600 underline" href={otpauth} dir="ltr">
              فتح otpauth
            </a>
          )}
          <input
            className="field font-mono"
            dir="ltr"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button className="btn-primary">تفعيل</button>
        </form>
      )}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {err && <p className="text-sm text-rose-700">{err}</p>}
    </div>
  );
}
