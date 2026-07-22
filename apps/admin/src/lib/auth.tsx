import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { adminFetch, getAdminToken, setAdminToken } from "./api";

export type AdminRole = "super_admin" | "ops_admin" | "support_agent";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  totp_enabled?: boolean | number;
}

interface LoginResult {
  requires_2fa?: boolean;
  pending_token?: string;
  must_enroll_2fa?: boolean;
}

interface AdminAuthCtx {
  admin: AdminUser | null;
  loading: boolean;
  mustEnroll2fa: boolean;
  login: (email: string, password: string) => Promise<LoginResult | void>;
  verify2fa: (pendingToken: string, code: string) => Promise<void>;
  bootstrap: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AdminAuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustEnroll2fa, setMustEnroll2fa] = useState(false);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setLoading(false);
      return;
    }
    adminFetch<{ admin: AdminUser }>("/admin/auth/me")
      .then((res) => {
        setAdmin(res.admin);
        setMustEnroll2fa(!(res.admin.totp_enabled === true || res.admin.totp_enabled === 1));
      })
      .catch(() => setAdminToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await adminFetch<{
      token?: string;
      admin: AdminUser;
      requires_2fa?: boolean;
      pending_token?: string;
      must_enroll_2fa?: boolean;
    }>("/admin/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password }),
    });

    if (res.requires_2fa && res.pending_token) {
      return {
        requires_2fa: true,
        pending_token: res.pending_token,
      };
    }

    if (!res.token) throw new Error("لا يوجد رمز دخول");
    setAdminToken(res.token);
    setAdmin(res.admin);
    setMustEnroll2fa(Boolean(res.must_enroll_2fa));
  }, []);

  const verify2fa = useCallback(async (pendingToken: string, code: string) => {
    const res = await adminFetch<{ token: string; admin: AdminUser }>(
      "/admin/auth/2fa/verify",
      {
        method: "POST",
        auth: false,
        body: JSON.stringify({ pending_token: pendingToken, code }),
      },
    );
    setAdminToken(res.token);
    setAdmin(res.admin);
    setMustEnroll2fa(false);
  }, []);

  const bootstrap = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await adminFetch<{
        token: string;
        admin: AdminUser;
        must_enroll_2fa?: boolean;
      }>("/admin/auth/bootstrap", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ name, email, password }),
      });
      setAdminToken(res.token);
      setAdmin(res.admin);
      setMustEnroll2fa(Boolean(res.must_enroll_2fa));
    },
    [],
  );

  const logout = useCallback(() => {
    setAdminToken(null);
    setAdmin(null);
    setMustEnroll2fa(false);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      loading,
      mustEnroll2fa,
      login,
      verify2fa,
      bootstrap,
      logout,
    }),
    [admin, loading, mustEnroll2fa, login, verify2fa, bootstrap, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminAuth outside provider");
  return ctx;
}
