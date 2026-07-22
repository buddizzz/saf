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
}

interface AdminAuthCtx {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  bootstrap: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AdminAuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setLoading(false);
      return;
    }
    adminFetch<{ admin: AdminUser }>("/admin/auth/me")
      .then((res) => setAdmin(res.admin))
      .catch(() => setAdminToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await adminFetch<{ token: string; admin: AdminUser }>(
      "/admin/auth/login",
      {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email, password }),
      },
    );
    setAdminToken(res.token);
    setAdmin(res.admin);
  }, []);

  const bootstrap = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await adminFetch<{ token: string; admin: AdminUser }>(
        "/admin/auth/bootstrap",
        {
          method: "POST",
          auth: false,
          body: JSON.stringify({ name, email, password }),
        },
      );
      setAdminToken(res.token);
      setAdmin(res.admin);
    },
    [],
  );

  const logout = useCallback(() => {
    setAdminToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ admin, loading, login, bootstrap, logout }),
    [admin, loading, login, bootstrap, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminAuth outside provider");
  return ctx;
}
