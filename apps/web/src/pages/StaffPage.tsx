import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { useQueueWebSocket } from "../hooks/useQueueWebSocket";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ShopAvatar } from "../components/ShopAvatar";

interface StaffSession {
  token: string;
  shopId: string;
  shopName: string;
  staffName: string;
  theme_id: string;
  theme_custom: string | null;
  logo_url: string | null;
  tagline: string | null;
}

function staffKey(slug: string) {
  return `saf.staff.${slug}`;
}

export function StaffPage() {
  const { slug = "" } = useParams();
  const [session, setSession] = useState<StaffSession | null>(() => {
    const saved = localStorage.getItem(staffKey(slug));
    return saved ? (JSON.parse(saved) as StaffSession) : null;
  });

  const onLogin = (next: StaffSession) => {
    localStorage.setItem(staffKey(slug), JSON.stringify(next));
    setSession(next);
  };

  const onLogout = () => {
    localStorage.removeItem(staffKey(slug));
    setSession(null);
  };

  return session ? (
    <StaffQueueView session={session} onLogout={onLogout} />
  ) : (
    <StaffLogin slug={slug} onLogin={onLogin} />
  );
}

function StaffLogin({
  slug,
  onLogin,
}: {
  slug: string;
  onLogin: (session: StaffSession) => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{
        token: string;
        staff: { name: string };
        shop: {
          id: string;
          name: string;
          theme_id: string;
          theme_custom: string | null;
          logo_url: string | null;
          tagline: string | null;
        };
      }>("/staff/login", {
        method: "POST",
        body: JSON.stringify({ slug, pin }),
      });
      onLogin({
        token: res.token,
        shopId: res.shop.id,
        shopName: res.shop.name,
        staffName: res.staff.name,
        theme_id: res.shop.theme_id,
        theme_custom: res.shop.theme_custom,
        logo_url: res.shop.logo_url,
        tagline: res.shop.tagline,
      });
    } catch {
      setError(t("staff.wrongPin"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Logo size={34} />
        <LanguageSwitcher />
      </header>
      <h1 className="mb-6 animate-fade-in text-3xl font-black tracking-tight text-brand-950">
        {t("staff.title")}
      </h1>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">{t("staff.pin")}</label>
          <input
            className="field text-center text-2xl tracking-[0.5em]"
            dir="ltr"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            required
          />
        </div>
        {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? t("common.loading") : t("staff.login")}
        </button>
      </form>
    </div>
  );
}

function StaffQueueView({
  session,
  onLogout,
}: {
  session: StaffSession;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const { snapshot } = useQueueWebSocket(session.shopId);

  const control = async (action: "next" | "skip" | "complete") => {
    await apiFetch(`/queue/${session.shopId}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
    }).catch(() => undefined);
  };

  const waiting = snapshot?.entries.filter((e) => e.status === "waiting") ?? [];

  return (
    <div className="mx-auto max-w-md px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Logo size={34} />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button className="btn-ghost" onClick={onLogout}>
            {t("staff.logout")}
          </button>
        </div>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <ShopAvatar shop={{ ...session, name: session.shopName }} size={44} />
        <div>
          <h1 className="text-xl font-extrabold text-brand-800">
            {session.shopName}
          </h1>
          <p className="text-sm text-slate-500">{session.staffName}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="card text-center">
          <div className="text-sm font-bold text-slate-500">
            {t("dashboard.currentServing")}
          </div>
          <div className="mt-1 text-5xl font-extrabold text-brand-700">
            {snapshot?.currentServing ?? "—"}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-sm font-bold text-slate-500">
            {t("dashboard.waiting")}
          </div>
          <div className="mt-1 text-5xl font-extrabold text-gold-500">
            {waiting.length}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary flex-1" onClick={() => control("next")}>
          {t("dashboard.callNext")}
        </button>
        <button className="btn-ghost" onClick={() => control("skip")}>
          {t("dashboard.skip")}
        </button>
        <button className="btn-gold" onClick={() => control("complete")}>
          {t("dashboard.complete")}
        </button>
      </div>
    </div>
  );
}
