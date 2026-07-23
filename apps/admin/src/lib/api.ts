// في التطوير يمرّ عبر بروكسي Vite (/api). في الإنتاج يجب ضبط VITE_API_BASE
// على رابط الـ Worker الكامل (مثل https://api.safapp.net).
const BASE = (import.meta.env.VITE_API_BASE ?? "/api").replace(/\/$/, "");
const TOKEN_KEY = "saf.admin.token";

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
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

export async function adminFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };
  if (auth) {
    const token = getAdminToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...rest, headers: finalHeaders });
  const data = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : null;
  if (!res.ok) {
    throw new ApiError(
      (data && (data.error as string)) || `خطأ (${res.status})`,
      res.status,
    );
  }
  return data as T;
}
