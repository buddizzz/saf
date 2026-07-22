import { useCallback, useRef } from "react";

// تنبيهات صوتية عبر Web Audio API (نغمة رنين مولّدة، بلا ملفات صوتية)
// مع اهتزاز، وفتح قفل الصوت على iOS عند أول تفاعل مستخدم.
export function useAudioAlerts() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  }, []);

  // يُستدعى عند أول تفاعل (إرسال النموذج) لفتح قفل الصوت على iOS.
  const unlock = useCallback(() => {
    const ctx = ensureCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }, [ensureCtx]);

  const beep = useCallback(
    (frequency: number, start: number, duration: number) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + start + duration,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    },
    [ensureCtx],
  );

  // رنّة واحدة قصيرة عند اقتراب الدور.
  const playApproaching = useCallback(() => {
    void ensureCtx()?.resume();
    beep(660, 0, 0.3);
    navigator.vibrate?.(150);
  }, [beep, ensureCtx]);

  // رنّة مزدوجة أوضح + اهتزاز عند بدء الدور.
  const playYourTurn = useCallback(() => {
    void ensureCtx()?.resume();
    beep(880, 0, 0.25);
    beep(880, 0.3, 0.35);
    navigator.vibrate?.([200, 100, 200]);
  }, [beep, ensureCtx]);

  return { unlock, playApproaching, playYourTurn };
}
