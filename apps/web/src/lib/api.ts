// عميل HTTP بسيط يتعامل مع الـ Worker عبر البروكسي (/api) ويرفق رمز الدخول.
const BASE = "/api";
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

// عنوان الـ WebSocket للطابور (يمرّ عبر بروكسي Vite في التطوير).
export function queueWsUrl(shopId: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/queue/${shopId}/ws?shopId=${shopId}`;
}
