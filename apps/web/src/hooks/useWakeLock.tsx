import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Screen Wake Lock أثناء إدارة الطابور + فيديو صامت 1px كـ fallback.
 */
export function useWakeLock(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }

    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
          if (cancelled) {
            await lock.release();
            return;
          }
          setActive(true);
          lock.addEventListener("release", () => setActive(false));
          return;
        }
      } catch {
        // fallback أدناه
      }

      // Fallback: فيديو صامت حلقي يمنع السكون على بعض المتصفحات القديمة
      const video = document.createElement("video");
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.loop = true;
      video.style.cssText =
        "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0";
      // إطار أسود صغير كـ data URI
      video.src =
        "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSRtZGF0YQAAAFptgQEaAhkBGkFvbWRpYQAAAAFPYXNwAAAAAQAAAAEAAAAQcGlsc0AAAAAMYXZjMQAAAAFpc29tAAAAAKhpc29tAAAAABhzdHNkAAAAAAAAAACZYXZjEAAAAADtZGF0YQAAAOZtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAACQHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABXXgnQAAAAAAAEAAAA=";
      document.body.appendChild(video);
      videoRef.current = video;
      void video.play().then(() => setActive(true)).catch(() => undefined);
    };

    void request();

    const onVis = () => {
      if (document.visibilityState === "visible" && enabled) void request();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.remove();
        videoRef.current = null;
      }
      setActive(false);
    };
  }, [enabled]);

  return active;
}

export function InstallHint() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [hidden, setHidden] = useState(
    () => localStorage.getItem("saf.a2hs.hide") === "1",
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (hidden || !deferred) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-[min(420px,92vw)] rounded-2xl border border-brand-100 bg-white p-4 shadow-soft">
      <p className="text-sm font-bold text-brand-800">{t("pwa.installTitle")}</p>
      <p className="mt-1 text-xs text-slate-500">{t("pwa.installBody")}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1 text-sm"
          onClick={async () => {
            await deferred.prompt();
            setDeferred(null);
          }}
        >
          {t("pwa.installCta")}
        </button>
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => {
            localStorage.setItem("saf.a2hs.hide", "1");
            setHidden(true);
          }}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
