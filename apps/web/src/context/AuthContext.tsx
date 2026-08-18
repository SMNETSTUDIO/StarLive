import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { get, post } from "../lib/api";

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  banned: boolean;
  muted: boolean;
  isSuperAdmin?: boolean;
  roleId?: string;
  permissions?: string[];
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  login: (account: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await get<{ user: User | null }>("/auth/me");
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (account: string, password: string) => {
    const r = await post<{ user: User }>("/auth/login", { account, password });
    setUser(r.user);
  }, []);

  const register = useCallback(
    async (username: string, password: string, email?: string) => {
      const r = await post<{ user: User }>("/auth/register", { username, password, email });
      setUser(r.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await post("/auth/logout");
    setUser(null);
  }, []);

  const isAdmin = !!user?.isSuperAdmin || (user?.permissions?.length ?? 0) > 0;

  return (
    <AuthContext.Provider
      value={{ user, loading, isAdmin, refresh, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
