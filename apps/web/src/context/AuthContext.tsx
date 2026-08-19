import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  // context value 用 useMemo 稳定引用：避免 Provider 因父级重渲染时
  // 生成新对象导致所有 useAuth 消费者无谓重渲染
  const value = useMemo(
    () => ({ user, loading, isAdmin, refresh, login, register, logout }),
    [user, loading, isAdmin, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
