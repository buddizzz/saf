import { useId } from "react";

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  variant?: "full" | "mark";
  /** استخدم ألوانًا فاتحة للوردمارك عند وضعه على خلفية داكنة. */
  inverted?: boolean;
  className?: string;
}

// شعار صفّ: مسار طابور متعرّج يشكّل حرف "S" بتدرّج تركوازي↔ذهبي، مع ثلاثة
// أشخاص متصاعدين يقفون على الطابور، وذيل نقاط متلاشٍ يمثل استمرارية الصف.
export function Logo({
  size = 40,
  showWordmark = true,
  showTagline = false,
  variant = "full",
  inverted = false,
  className = "",
}: LogoProps) {
  const uid = useId();
  const gradientId = `saf-grad-${uid}`;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        role="img"
        aria-label="شعار صفّ"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="76"
            y1="18"
            x2="14"
            y2="88"
          >
            <stop offset="0%" stopColor="#1f6675" />
            <stop offset="55%" stopColor="#4497a7" />
            <stop offset="100%" stopColor="#e0a24e" />
          </linearGradient>
        </defs>

        {/* مسار الطابور المتعرّج المشكِّل لحرف S */}
        <path
          d="M75,21 C57,7 31,11 29,28 C27,43 47,42 57,42 C70,42 73,57 60,65 C47,73 26,68 19,79"
          stroke={`url(#${gradientId})`}
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ذيل نقاط متلاشٍ يواصل امتداد الطابور */}
        <circle cx="13" cy="85" r="3.4" fill="#e0a24e" />
        <circle cx="7.5" cy="90.5" r="2.4" fill="#e0a24e" opacity="0.65" />
        <circle cx="3.5" cy="94.5" r="1.5" fill="#e0a24e" opacity="0.35" />

        {/* ثلاثة أشخاص يقفون على الطابور بارتفاع متصاعد */}
        <circle cx="47" cy="27" r="3.6" fill="#4497a7" />
        <rect x="43" y="31" width="8" height="11.5" rx="4" fill="#4497a7" />

        <circle cx="63" cy="18" r="4.1" fill="#ebb85c" />
        <rect x="58.4" y="22.5" width="9.2" height="13" rx="4.6" fill="#ebb85c" />

        <circle cx="80" cy="8.5" r="4.7" fill="#d18c34" />
        <rect x="74.7" y="13.5" width="10.6" height="14.8" rx="5.3" fill="#d18c34" />
      </svg>
      {showWordmark && variant === "full" && (
        <div className="leading-none">
          <div className={`text-3xl font-extrabold ${inverted ? "text-white" : "text-brand-800"}`}>
            صفّ
          </div>
          <div
            className={`text-[11px] font-extrabold tracking-[0.25em] ${
              inverted ? "text-white/85" : "text-brand-700"
            }`}
          >
            SAF
          </div>
          {showTagline && (
            <div
              className={`mt-1 text-[11px] font-medium tracking-wide ${
                inverted ? "text-white/65" : "text-slate-500"
              }`}
            >
              خدمة تنظيم انتظار العملاء
            </div>
          )}
        </div>
      )}
    </div>
  );
}
