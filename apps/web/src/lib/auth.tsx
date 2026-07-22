import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, getToken, setToken } from "./api";

export interface Owner {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  owner: Owner | null;
  loading: boolean;
  login: (token: string, owner: Owner) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<{ owner: Owner }>("/auth/me", { auth: true })
      .then((res) => setOwner(res.owner))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token: string, nextOwner: Owner) => {
    setToken(token);
    setOwner(nextOwner);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setOwner(null);
  }, []);

  const value = useMemo(
    () => ({ owner, loading, login, logout }),
    [owner, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
