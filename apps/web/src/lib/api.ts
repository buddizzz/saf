// عميل HTTP بسيط يتعامل مع الـ Worker ويرفق رمز الدخول.
// في التطوير: يمرّ عبر بروكسي Vite (/api). في الإنتاج: يجب ضبط
// VITE_API_BASE على رابط الـ Worker الكامل (مثل https://api.safapp.net)
// لأن الواجهة والـ API ينشران على نطاقين مختلفين على Cloudflare Pages/Workers.
const BASE = (import.meta.env.VITE_API_BASE?.trim() || "/api").replace(/\/$/, "");
const TOKEN_KEY = "saf.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...rest, headers: finalHeaders });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      (data && (data.error as string)) || `خطأ في الطلب (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// رفع ملف (مثل شعار المحل) عبر multipart/form-data — بدون تحديد Content-Type
// حتى يضبطه المتصفح تلقائيًا مع boundary الصحيح.
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.set("file", file);
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const message =
      (data && (data.error as string)) || `خطأ في الطلب (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// يحوّل مسار أصل نسبي (مثل شعار محل قادم من /assets/...) إلى رابط كامل
// يمرّ عبر نفس بروكسي /api المستخدم لبقية الطلبات.
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${BASE}${path}`;
}

// عنوان الـ WebSocket للطابور. في التطوير يمرّ عبر بروكسي Vite على نفس
// المنفذ. في الإنتاج يُبنى من VITE_API_BASE (نطاق الـ Worker المنفصل).
export function queueWsUrl(shopId: string): string {
  if (/^https?:\/\//.test(BASE)) {
    const wsBase = BASE.replace(/^http/, "ws");
    return `${wsBase}/queue/${shopId}/ws?shopId=${shopId}`;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${BASE}/queue/${shopId}/ws?shopId=${shopId}`;
}
