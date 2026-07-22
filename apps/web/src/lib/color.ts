// أدوات صغيرة لمعالجة الألوان لدعم تخصيص الهوية التجارية (ألوان مخصّصة).

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return h.padEnd(6, "0").slice(0, 6);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// يُغمّق لونًا بنسبة (0-1) — يُستخدم لاستنتاج "primaryDark" من لون أساسي واحد.
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

// يحدّد إن كان اللون فاتحًا (لاختيار لون نص أبيض/أسود متباين فوقه).
export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}
