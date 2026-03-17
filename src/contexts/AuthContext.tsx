import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isApiEnabled } from "@/config/api";
import * as api from "@/services/api";
import type { AuthUser, UserRole } from "@/types/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canWrite: boolean;
  canManageUsers: boolean;
  canSeeCadastro: boolean;
  canSeeGovernance: boolean;
  canImport: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function clearStoredToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(api.AUTH_TOKEN_STORAGE_KEY);
}

function setStoredToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(api.AUTH_TOKEN_STORAGE_KEY, token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      try {
        if (!isApiEnabled()) {
          const response = await api.getMe();
          setUser(response.user);
          return;
        }
        const token = typeof window !== "undefined" ? window.localStorage.getItem(api.AUTH_TOKEN_STORAGE_KEY) : "";
        if (!token) return;
        const response = await api.getMe();
        setUser(response.user);
      } catch {
        clearStoredToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setStoredToken(response.token);
    setUser(response.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      clearStoredToken();
      setUser(null);
    }
  };

  const value = useMemo<AuthContextType>(() => {
    const role = user?.role;
    const canWrite = role === "admin" || role === "pmo";
    const canManageUsers = canWrite;
    return {
      user,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      canWrite,
      canManageUsers,
      canSeeCadastro: canWrite,
      canSeeGovernance: canWrite,
      canImport: canWrite,
      hasRole: (...roles: UserRole[]) => !!role && roles.includes(role),
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
