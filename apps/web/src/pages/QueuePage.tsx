import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, assetUrl } from "../lib/api";
import { useQueueWebSocket } from "../hooks/useQueueWebSocket";
import { useAudioAlerts } from "../hooks/useAudioAlerts";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { getTheme, resolveShopTheme, themeVars, type Theme } from "../themes";
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
      className="relative min-h-screen overflow-hidden"
      style={{ ...themeVars(theme), background: theme.bg }}
    >
      <AmbientBackground theme={theme} />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
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
          <ClosedCard theme={theme} reason={shop.closedReason} />
        )}

        {shop.subscription_tier === "free" && <AdBanner theme={theme} />}
        {!(shop.hide_powered_by === 1) && (
          <p className="mt-4 text-center text-[11px] text-slate-400">
            Powered by صفّ
          </p>
        )}
      </div>
    </div>
  );
}

// خلفية زخرفية متحركة (كتل متدرّجة ضبابية) بألوان الهوية التجارية — تمنح
// صفحة العميل حيوية بدلًا من خلفية مسطحة ساكنة.
function AmbientBackground({ theme }: { theme: Theme }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-24 -start-24 h-72 w-72 animate-float rounded-full opacity-40 blur-3xl"
        style={{ background: theme.primary }}
      />
      <div
        className="absolute top-1/3 -end-24 h-64 w-64 animate-float-reverse rounded-full opacity-30 blur-3xl"
        style={{ background: theme.accent }}
      />
      <div
        className="absolute bottom-0 start-1/4 h-56 w-56 animate-float rounded-full opacity-20 blur-3xl"
        style={{ background: theme.primaryDark, animationDelay: "1.5s" }}
      />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(${theme.primaryDark} 1px, transparent 1px)`,
          backgroundSize: "18px 18px",
        }}
      />
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
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold shadow-sm ${
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

// حقل نموذج بأيقونة داخلية — يمنح النموذج طابعًا أكثر احترافية من حقول عادية.
function IconField({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-slate-400">
        {icon}
      </span>
      {children}
    </div>
  );
}

const UserIcon = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" />
  </svg>
);
const PhoneIcon = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" strokeLinecap="round" />
  </svg>
);

function ClosedCard({ theme, reason }: { theme: Theme; reason: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="card animate-scale-in text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-lg font-bold text-rose-500">
        {reason ?? t("queue.shopClosed")}
      </p>
      <p className="mt-1 text-sm" style={{ color: theme.primaryDark, opacity: 0.7 }}>
        {t("queue.closedHint")}
      </p>
    </div>
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
    <form
      onSubmit={submit}
      className="card animate-scale-in space-y-4"
      style={{ accentColor: theme.primary }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{ background: theme.primary }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
        <h2 className="text-lg font-extrabold" style={{ color: theme.primaryDark }}>
          {t("queue.joinTitle")}
        </h2>
      </div>
      <div>
        <label className="label">{t("queue.yourName")}</label>
        <IconField icon={UserIcon}>
          <input
            className="field ps-10"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </IconField>
      </div>
      <div>
        <label className="label">{t("queue.yourPhone")}</label>
        <IconField icon={PhoneIcon}>
          <input
            className="field ps-10"
            dir="ltr"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+9665XXXXXXXX"
            required
          />
        </IconField>
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
          className="mt-1 h-4 w-4 rounded"
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
          className="mt-1 h-4 w-4 rounded"
          checked={form.marketing_consent}
          onChange={(e) =>
            setForm({ ...form, marketing_consent: e.target.checked })
          }
        />
        <span>{t("queue.marketingConsent")}</span>
      </label>
      {error && <p className="text-sm font-bold text-rose-600">{error}</p>}
      <button
        className="btn w-full text-white transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
        style={{ background: theme.primary, boxShadow: `0 10px 24px -8px ${theme.primary}` }}
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
  const initialAheadRef = useRef<number | null>(null);

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

  if (snapshot && initialAheadRef.current === null) {
    initialAheadRef.current = ahead;
  }
  const initialAhead = initialAheadRef.current ?? ahead;
  const progress = initialAhead > 0 ? (initialAhead - ahead) / initialAhead : 1;

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

  if (isMyTurn) {
    return (
      <div className="space-y-4">
        <ConnectionIndicator status={status} />
        <YourTurnCelebration myNumber={myNumber} theme={theme} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConnectionIndicator status={status} />

      <div className="animate-scale-in overflow-hidden rounded-3xl bg-white shadow-soft">
        <div className="relative overflow-hidden px-6 pb-6 pt-7 text-center">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className="h-36 w-36 animate-ring-expand rounded-full border-2"
              style={{ borderColor: theme.accent }}
            />
          </div>
          <div className="relative text-xs font-extrabold uppercase tracking-widest text-slate-400">
            {t("queue.yourNumber")}
          </div>
          <div
            key={myNumber}
            className="relative my-1 animate-pop-in bg-clip-text text-8xl font-black text-transparent"
            style={{
              backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
            }}
          >
            {myNumber}
          </div>
          <div className="relative text-base font-bold" style={{ color: theme.primaryDark }}>
            {ahead > 0
              ? `${t("queue.peopleAhead")}: ${ahead} ${t("queue.person")}`
              : t("queue.almostThere")}
          </div>
        </div>

        <TicketPerforation bg={theme.bg} />

        <div className="px-6 py-5">
          <QueueProgressTrack progress={progress} theme={theme} />
          <PeopleAheadDots ahead={ahead} theme={theme} />

          <div className="mt-5 grid grid-cols-2 gap-4">
            <MiniStat
              label={t("dashboard.currentServing")}
              value={snapshot?.currentServing ?? "—"}
              color={theme.accent}
            />
            <MiniStat
              label={t("queue.estimatedWait")}
              value={`~${etaMinutes}`}
              suffix={t("queue.minutes")}
              color={theme.primary}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// خط تذكرة متقطّع بفراغين دائريين — يمنح البطاقة طابع "تذكرة الدور" الحقيقية.
function TicketPerforation({ bg }: { bg: string }) {
  return (
    <div className="relative h-0">
      <span
        className="absolute top-0 -start-3 h-6 w-6 -translate-y-1/2 rounded-full"
        style={{ background: bg }}
      />
      <span
        className="absolute top-0 -end-3 h-6 w-6 -translate-y-1/2 rounded-full"
        style={{ background: bg }}
      />
      <div className="mx-6 border-t-2 border-dashed border-slate-200" />
    </div>
  );
}

// مسار تقدّم يوضّح رحلة العميل من الانضمام إلى دوره — أوضح وأجمل من نص فقط.
function QueueProgressTrack({ progress, theme }: { progress: number; theme: Theme }) {
  const { t } = useTranslation();
  const pct = Math.min(100, Math.max(4, Math.round(progress * 100)));
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400">
        <span>{t("queue.trackStart")}</span>
        <span>{t("queue.trackEnd")}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-700 ease-out"
          style={{
            insetInlineStart: 0,
            width: `${pct}%`,
            backgroundImage: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
          }}
        />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow transition-all duration-700 ease-out"
          style={{ insetInlineStart: `calc(${pct}% - 8px)`, background: theme.accent }}
        />
      </div>
    </div>
  );
}

// صفوف نقاط تمثّل الأشخاص أمامك — أكثر حيوية من رقم نصّي مجرّد.
function PeopleAheadDots({ ahead, theme }: { ahead: number; theme: Theme }) {
  const visible = Math.min(ahead, 5);
  const extra = ahead - visible;
  if (ahead === 0) return null;
  return (
    <div className="flex items-center -space-x-2 rtl:space-x-reverse">
      {Array.from({ length: visible }).map((_, i) => (
        <span
          key={i}
          className="flex h-7 w-7 animate-dot-bounce items-center justify-center rounded-full border-2 border-white text-white shadow-sm"
          style={{ background: theme.primary, animationDelay: `${i * 0.12}s` }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="8" r="4.5" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        </span>
      ))}
      {extra > 0 && (
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-extrabold text-white shadow-sm"
          style={{ background: theme.primaryDark }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 py-3 text-center">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className="mt-0.5 text-3xl font-extrabold" style={{ color }}>
        {value}
      </div>
      {suffix && <div className="text-[11px] text-slate-400">{suffix}</div>}
    </div>
  );
}

// شاشة احتفالية بالكونفيتي عند حلول دور العميل — بديل الشاشة "الجافة" السابقة.
function YourTurnCelebration({ myNumber, theme }: { myNumber: number; theme: Theme }) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <ConfettiBurst theme={theme} />
      <div
        className="relative animate-pop-in overflow-hidden rounded-3xl px-6 py-10 text-center shadow-soft"
        style={{ backgroundImage: `linear-gradient(160deg, ${theme.primary}, ${theme.primaryDark})` }}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="h-52 w-52 animate-ring-expand rounded-full border-2"
            style={{ borderColor: theme.accent }}
          />
          <span
            className="absolute h-52 w-52 animate-ring-expand rounded-full border-2"
            style={{ borderColor: "#ffffff", animationDelay: "0.7s" }}
          />
        </div>
        <div className="relative text-xs font-extrabold uppercase tracking-widest text-white/70">
          {t("queue.yourNumber")}
        </div>
        <div className="relative my-2 text-8xl font-black text-white">{myNumber}</div>
        <div
          className="relative inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-lg font-extrabold shadow-soft"
          style={{ background: theme.accent, color: theme.primaryDark }}
        >
          🎉 {t("queue.yourTurn")}
        </div>
      </div>
    </div>
  );
}

function ConfettiBurst({ theme }: { theme: Theme }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 20 }).map((_, i) => ({
        left: 4 + Math.random() * 92,
        delay: Math.random() * 0.5,
        duration: 1.2 + Math.random() * 0.9,
        color: [theme.primary, theme.accent, theme.primaryDark, "#ffffff"][i % 4],
        size: 5 + Math.random() * 4,
      })),
    [theme.primary, theme.accent, theme.primaryDark],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 overflow-visible">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-2 animate-confetti rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
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

const RATING_EMOJI = ["😞", "🙁", "😐", "🙂", "🤩"];

function RatingCard({
  sessionToken,
  theme,
}: {
  sessionToken: string;
  theme: Theme;
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (rating < 1) return;
    await apiFetch(`/queue/session/${sessionToken}/rating`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    }).catch(() => undefined);
    setDone(true);
  };

  const activeRating = hovered || rating;

  return (
    <div
      className="card animate-scale-in overflow-hidden text-center"
      style={{ boxShadow: `0 20px 45px -20px ${theme.primary}80` }}
    >
      <div
        className="mx-auto -mt-2 mb-3 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ background: `${theme.accent}33` }}
      >
        ✅
      </div>
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
          <div className="mb-2 text-4xl transition-all">
            {RATING_EMOJI[(activeRating || 3) - 1]}
          </div>
          <div className="mb-4 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                className="text-4xl transition-transform hover:scale-125"
                style={{ color: star <= activeRating ? theme.accent : "#e2e8f0" }}
              >
                ★
              </button>
            ))}
          </div>
          <button
            className="btn w-full text-white"
            style={{ background: theme.primary }}
            onClick={submit}
            disabled={rating < 1}
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
      href="/login"
      className="mt-auto flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
      style={{
        background: `linear-gradient(to left, ${theme.primaryDark}, ${theme.primary})`,
      }}
    >
      رقِّ محلك لباقة Pro — بدون إعلانات + حجز عن بُعد
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
