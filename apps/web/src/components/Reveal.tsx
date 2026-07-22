import { useEffect, useRef, useState } from "react";

interface RevealProps {
  children: React.ReactNode;
  /** تأخير الحركة بالمللي ثانية — يُستخدم لتتابع العناصر المتجاورة. */
  delay?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

// يكشف المحتوى بحركة ناعمة (انزلاق + إزالة ضبابية) عند دخوله نافذة العرض.
export function Reveal({ children, delay = 0, className = "", as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={`${shown ? "reveal-shown" : "reveal-hidden"} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
