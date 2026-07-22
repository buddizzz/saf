import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../lib/api";
import { useQueueWebSocket } from "../hooks/useQueueWebSocket";
import { useAudioAlerts } from "../hooks/useAudioAlerts";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { getTheme, resolveShopTheme, themeVars, type Theme } from "../themes";
import { assetUrl } from "../lib/api";
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

  const theme = useMemo(
    () => (shop ? resolveShopTheme(shop) : getTheme(null)),
    [shop],
  );

  const onJoined = (token: string, number: number) => {
    localStorage.setItem(sessionKey(slug), token);
    setSessionToken(token);
    setMyNumber(number);
  };

  if (loading) return <Centered>{t("common.loading")}</Centered>;
  if (notFound || !shop) return <Centered>404</Centered>;

  return (
    <div
      className="min-h-screen"
      style={{ ...themeVars(theme), background: theme.bg }}
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
        <header className="mb-6 flex items-center justify-between">
          <Logo size={26} showWordmark={false} className="opacity-60" />
          <LanguageSwitcher />
        </header>

        <div className="mb-6 animate-fade-in text-center">
          <BrandMark shop={shop} theme={theme} />
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: theme.primaryDark }}
          >
            {shop.name}
          </h1>
          {shop.tagline && (
            <p
              className="mx-auto mt-1 max-w-xs text-sm font-medium opacity-80"
              style={{ color: theme.primaryDark }}
            >
              {shop.tagline}
            </p>
          )}
          <ShopStatusBadge shop={shop} />
        </div>

        {sessionToken && myNumber !== null ? (
          <QueueStatus
            shopId={shop.id}
            myNumber={myNumber}
            sessionToken={sessionToken}
            avgServiceSeconds={shop.avg_service_seconds}
            theme={theme}
          />
        ) : shop.isOpen ? (
          <JoinForm slug={slug} onJoined={onJoined} theme={theme} />
        ) : (
          <div className="card text-center">
            <p className="text-lg font-bold text-rose-500">
              {shop.closedReason ?? t("queue.shopClosed")}
            </p>
          </div>
        )}

        {shop.subscription_tier === "free" && <AdBanner theme={theme} />}
      </div>
    </div>
  );
}

// شعار المحل الفعلي إن وُجد، وإلا حرف الاسم الأول بلون الهوية التجارية.
function BrandMark({ shop, theme }: { shop: PublicShop; theme: Theme }) {
  const logo = assetUrl(shop.logo_url);
  return (
    <div
      className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-2xl font-extrabold text-white shadow-soft"
      style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})` }}
    >
      {logo ? (
        <img src={logo} alt={shop.name} className="h-full w-full object-cover" />
      ) : (
        shop.name.charAt(0)
      )}
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
          shop.isOpen ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
        }`}
      />
      {shop.isOpen ? "🟢" : "🔴"}
    </span>
  );
}

function JoinForm({
  slug,
  onJoined,
  theme,
}: {
  slug: string;
  onJoined: (token: string, number: number) => void;
  theme: Theme;
}) {
  const { t } = useTranslation();
  const { unlock } = useAudioAlerts();
  const [form, setForm] = useState({
    name: "",
    phone: "+9665",
    gender: "male",
    age_category: "18_34",
    consent: false,
    marketing_consent: false,
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
    unlock();
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
      <h2 className="text-lg font-extrabold" style={{ color: theme.primaryDark }}>
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
            onChange={(e) => setForm({ ...form, age_category: e.target.value })}
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
        <span>
          {t("queue.consent")}{" "}
          <Link
            to="/privacy"
            target="_blank"
            className="font-bold underline"
            style={{ color: theme.primary }}
          >
            {t("queue.privacyLink")}
          </Link>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.marketing_consent}
          onChange={(e) =>
            setForm({ ...form, marketing_consent: e.target.checked })
          }
        />
        <span>{t("queue.marketingConsent")}</span>
      </label>
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      <button
        className="btn w-full text-white"
        style={{ background: theme.primary }}
        disabled={busy}
      >
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
  theme,
}: {
  shopId: string;
  myNumber: number;
  sessionToken: string;
  avgServiceSeconds: number;
  theme: Theme;
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
    return <RatingCard sessionToken={sessionToken} theme={theme} />;
  }

  return (
    <div className="space-y-4">
      <ConnectionIndicator status={status} />

      <div
        className={`card animate-scale-in text-center transition-shadow duration-500 ${
          isMyTurn ? "ring-4" : ""
        }`}
        style={
          isMyTurn
            ? { boxShadow: `0 0 0 4px ${theme.accent}`, borderColor: theme.accent }
            : undefined
        }
      >
        <div className="text-sm font-bold text-slate-500">
          {t("queue.yourNumber")}
        </div>
        <div
          className="my-2 bg-clip-text text-7xl font-extrabold text-transparent"
          style={{
            backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
          }}
        >
          {myNumber}
        </div>
        {isMyTurn ? (
          <div
            className="animate-pulse rounded-xl py-3 text-xl font-extrabold"
            style={{ background: theme.accent, color: theme.primaryDark }}
          >
            {t("queue.yourTurn")}
          </div>
        ) : (
          <div style={{ color: theme.primaryDark }}>
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
            <div
              className="mt-1 text-3xl font-extrabold"
              style={{ color: theme.accent }}
            >
              {snapshot?.currentServing ?? "—"}
            </div>
          </div>
          <div className="card text-center">
            <div className="text-xs font-bold text-slate-500">
              {t("queue.estimatedWait")}
            </div>
            <div
              className="mt-1 text-3xl font-extrabold"
              style={{ color: theme.primary }}
            >
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

function RatingCard({
  sessionToken,
  theme,
}: {
  sessionToken: string;
  theme: Theme;
}) {
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
        <p style={{ color: theme.primaryDark }}>{t("queue.thanksRating")}</p>
      ) : (
        <>
          <p className="mb-3 font-bold" style={{ color: theme.primaryDark }}>
            {t("queue.rateTitle")}
          </p>
          <div className="mb-4 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="text-4xl transition"
                style={{ color: star <= rating ? theme.accent : "#e2e8f0" }}
              >
                ★
              </button>
            ))}
          </div>
          <button
            className="btn w-full text-white"
            style={{ background: theme.primary }}
            onClick={submit}
          >
            {t("queue.submitRating")}
          </button>
        </>
      )}
    </div>
  );
}

function AdBanner({ theme }: { theme: Theme }) {
  return (
    <a
      href="#"
      className="mt-auto block rounded-xl px-4 py-3 text-center text-sm font-bold text-white"
      style={{
        background: `linear-gradient(to left, ${theme.primaryDark}, ${theme.primary})`,
      }}
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
