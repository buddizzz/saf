interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  variant?: "full" | "mark";
  className?: string;
}

// شعار صفّ: علامة مستوحاة من الطابور (خطوط متعرجة + أشخاص) بالألوان التركوازي والذهبي.
export function Logo({
  size = 40,
  showWordmark = true,
  variant = "full",
  className = "",
}: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="شعار صفّ"
      >
        {/* مسار الطابور المتعرّج */}
        <path
          d="M46 14H26a8 8 0 0 0 0 16h12a8 8 0 0 1 0 16H18"
          stroke="#1f6675"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M46 22H28a4 4 0 0 0 0 8h10a8 8 0 0 1 0 16H18"
          stroke="#e0a24e"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {/* شخصان في المقدمة */}
        <circle cx="41" cy="16" r="4" fill="#1f6675" />
        <rect x="37" y="21" width="8" height="12" rx="4" fill="#1f6675" />
        <circle cx="52" cy="18" r="3.5" fill="#e0a24e" />
        <rect x="48.5" y="22" width="7" height="11" rx="3.5" fill="#e0a24e" />
        {/* نقاط الاستمرارية */}
        <circle cx="18" cy="52" r="2.2" fill="#1f6675" />
        <circle cx="26" cy="52" r="2.2" fill="#1f6675" opacity="0.6" />
        <circle cx="34" cy="52" r="2.2" fill="#1f6675" opacity="0.3" />
      </svg>
      {showWordmark && variant === "full" && (
        <div className="leading-none">
          <div className="text-2xl font-extrabold text-brand-700">صفّ</div>
          <div className="text-[10px] font-bold tracking-[0.3em] text-gold-500">
            SAF
          </div>
        </div>
      )}
    </div>
  );
}
