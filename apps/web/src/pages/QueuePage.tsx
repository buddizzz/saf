import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { useQueueWebSocket } from "../hooks/useQueueWebSocket";
import { useAudioAlerts } from "../hooks/useAudioAlerts";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import type { PublicShop } from "../lib/types";

const AGE_CATEGORIES = ["13_17", "18_34", "35_54", "55_plus"];

function sessionKey(slug: string) {
  return `saf.session.${slug}`;
}

export function QueuePage() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const [shop, setShop] = useState<PublicShop | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [myNumber, setMyNumber] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ shop: PublicShop }>(`/shops/${slug}`)
      .then((r) => setShop(r.shop))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // استرجاع الجلسة السابقة من localStorage.
  useEffect(() => {
    const saved = localStorage.getItem(sessionKey(slug));
    if (!saved) return;
    apiFetch<{ entry: { queueNumber: number; status: string } }>(
      `/queue/session/${saved}`,
    )
      .then((r) => {
        if (r.entry.status === "waiting" || r.entry.status === "called") {
          setSessionToken(saved);
          setMyNumber(r.entry.queueNumber);
        } else {
          localStorage.removeItem(sessionKey(slug));
        }
      })
      .catch(() => localStorage.removeItem(sessionKey(slug)));
  }, [slug]);

  const onJoined = (token: string, number: number) => {
    localStorage.setItem(sessionKey(slug), token);
    setSessionToken(token);
    setMyNumber(number);
  };

  if (loading) {
    return <Centered>{t("common.loading")}</Centered>;
  }
  if (notFound || !shop) {
    return <Centered>404</Centered>;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Logo size={34} />
        <LanguageSwitcher />
      </header>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-extrabold text-white">
          {shop.name.charAt(0)}
        </div>
        <h1 className="text-2xl font-extrabold text-brand-800">{shop.name}</h1>
        <ShopStatusBadge shop={shop} />
      </div>

      {sessionToken && myNumber !== null ? (
        <QueueStatus
          shopId={shop.id}
          myNumber={myNumber}
          sessionToken={sessionToken}
          avgServiceSeconds={shop.avg_service_seconds}
        />
      ) : shop.isOpen ? (
        <JoinForm slug={slug} onJoined={onJoined} />
      ) : (
        <div className="card text-center">
          <p className="text-lg font-bold text-rose-500">
            {shop.closedReason ?? t("queue.shopClosed")}
          </p>
        </div>
      )}

      {shop.subscription_tier === "free" && <AdBanner />}
    </div>
  );
}

function ShopStatusBadge({ shop }: { shop: PublicShop }) {
  return (
    <span
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${
        shop.isOpen
          ? "bg-emerald-50 text-emerald-600"
          : "bg-rose-50 text-rose-500"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          shop.isOpen ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />
      {shop.isOpen ? "🟢" : "🔴"}
    </span>
  );
}

function JoinForm({
  slug,
  onJoined,
}: {
  slug: string;
  onJoined: (token: string, number: number) => void;
}) {
  const { t } = useTranslation();
  const { unlock } = useAudioAlerts();
  const [form, setForm] = useState({
    name: "",
    phone: "+9665",
    gender: "male",
    age_category: "18_34",
    consent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError(t("queue.consent"));
      return;
    }
    unlock(); // فتح قفل الصوت على iOS عند أول تفاعل
    setBusy(true);
    try {
      const res = await apiFetch<{ queueNumber: number; sessionToken: string }>(
        "/queue/join",
        { method: "POST", body: JSON.stringify({ slug, ...form }) },
      );
      onJoined(res.sessionToken, res.queueNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h2 className="text-lg font-extrabold text-brand-800">
        {t("queue.joinTitle")}
      </h2>
      <div>
        <label className="label">{t("queue.yourName")}</label>
        <input
          className="field"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label">{t("queue.yourPhone")}</label>
        <input
          className="field"
          dir="ltr"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+9665XXXXXXXX"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t("queue.gender")}</label>
          <select
            className="field"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="male">{t("queue.male")}</option>
            <option value="female">{t("queue.female")}</option>
          </select>
        </div>
        <div>
          <label className="label">{t("queue.ageCategory")}</label>
          <select
            className="field"
            value={form.age_category}
            onChange={(e) =>
              setForm({ ...form, age_category: e.target.value })
            }
          >
            {AGE_CATEGORIES.map((age) => (
              <option key={age} value={age}>
                {age.replace("_", "–").replace("plus", "+")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })}
        />
        <span>{t("queue.consent")}</span>
      </label>
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? t("common.loading") : t("queue.join")}
      </button>
    </form>
  );
}

function QueueStatus({
  shopId,
  myNumber,
  sessionToken,
  avgServiceSeconds,
}: {
  shopId: string;
  myNumber: number;
  sessionToken: string;
  avgServiceSeconds: number;
}) {
  const { t } = useTranslation();
  const { snapshot, status } = useQueueWebSocket(shopId);
  const { playApproaching, playYourTurn } = useAudioAlerts();
  const approachedRef = useRef(false);
  const turnRef = useRef(false);

  const myEntry = snapshot?.entries.find((e) => e.queueNumber === myNumber);
  const ahead =
    snapshot?.entries.filter(
      (e) =>
        e.queueNumber < myNumber &&
        (e.status === "waiting" || e.status === "called"),
    ).length ?? 0;
  const isMyTurn = snapshot?.currentServing === myNumber;
  const served = myEntry?.status === "served";
  const etaMinutes = Math.round((ahead * avgServiceSeconds) / 60);

  useEffect(() => {
    if (!snapshot) return;
    if (isMyTurn && !turnRef.current) {
      turnRef.current = true;
      playYourTurn();
    } else if (!isMyTurn && ahead > 0 && ahead <= 2 && !approachedRef.current) {
      approachedRef.current = true;
      playApproaching();
    }
  }, [snapshot, isMyTurn, ahead, playApproaching, playYourTurn]);

  if (served) {
    return <RatingCard sessionToken={sessionToken} />;
  }

  return (
    <div className="space-y-4">
      <ConnectionIndicator status={status} />

      <div
        className={`card text-center transition ${
          isMyTurn ? "ring-4 ring-gold-400" : ""
        }`}
      >
        <div className="text-sm font-bold text-slate-500">
          {t("queue.yourNumber")}
        </div>
        <div className="my-2 text-7xl font-extrabold text-brand-700">
          {myNumber}
        </div>
        {isMyTurn ? (
          <div className="rounded-xl bg-gold-100 py-3 text-xl font-extrabold text-gold-700">
            {t("queue.yourTurn")}
          </div>
        ) : (
          <div className="text-brand-700">
            <span className="text-lg font-bold">
              {t("queue.peopleAhead")}: {ahead} {t("queue.person")}
            </span>
          </div>
        )}
      </div>

      {!isMyTurn && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card text-center">
            <div className="text-xs font-bold text-slate-500">
              {t("dashboard.currentServing")}
            </div>
            <div className="mt-1 text-3xl font-extrabold text-gold-500">
              {snapshot?.currentServing ?? "—"}
            </div>
          </div>
          <div className="card text-center">
            <div className="text-xs font-bold text-slate-500">
              {t("queue.estimatedWait")}
            </div>
            <div className="mt-1 text-3xl font-extrabold text-brand-700">
              ~{etaMinutes}
            </div>
            <div className="text-xs text-slate-400">{t("queue.minutes")}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionIndicator({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "connected") return null;
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-2 text-center text-sm font-bold text-amber-600">
      {status === "connecting" ? t("queue.connecting") : t("queue.reconnecting")}
    </div>
  );
}

function RatingCard({ sessionToken }: { sessionToken: string }) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (rating < 1) return;
    await apiFetch(`/queue/session/${sessionToken}/rating`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }).catch(() => undefined);
    setDone(true);
  };

  return (
    <div className="card text-center">
      <p className="mb-2 text-lg font-extrabold text-emerald-600">
        {t("queue.served")}
      </p>
      {done ? (
        <p className="text-brand-700">{t("queue.thanksRating")}</p>
      ) : (
        <>
          <p className="mb-3 font-bold text-brand-800">{t("queue.rateTitle")}</p>
          <div className="mb-4 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className={`text-4xl transition ${
                  star <= rating ? "text-gold-400" : "text-slate-200"
                }`}
              >
                ★
              </button>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={submit}>
            {t("queue.submitRating")}
          </button>
        </>
      )}
    </div>
  );
}

function AdBanner() {
  return (
    <a
      href="#"
      className="mt-auto block rounded-xl bg-gradient-to-l from-brand-700 to-brand-500 px-4 py-3 text-center text-sm font-bold text-white"
    >
      رقِّ محلك لباقة Pro — بدون إعلانات + حجز عن بُعد ✨
    </a>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-brand-600">
      {children}
    </div>
  );
}
