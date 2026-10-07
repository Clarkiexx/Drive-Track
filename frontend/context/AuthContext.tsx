"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  authService,
  type AuthSession,
  type AuthUser,
  type DriverLoginInput,
  type StaffLoginInput,
} from "@/services/auth.service";
import { homeForRole, type Role } from "@/constants/roles";
import {
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  clearSession,
  getStoredToken,
  persistToken,
  registerUnauthorizedHandler,
  syncAuthCookie,
} from "@/lib/axios";

/**
 * Session state for the unified PWA (all three roles).
 *
 * Mirrors driver-app/src/context/AuthContext.js:
 *   - token + profile survive a reload (localStorage, here instead of SecureStore),
 *   - mustChangePassword is restored from storage so a refresh can't skip the
 *     Change Password screen (the backend still 403s every other call anyway),
 *   - any 401 signs the app out (lib/axios.ts 401 interceptor + this handler).
 *
 * The token is additionally mirrored into the `drivetrack_token` cookie so
 * proxy.ts can guard routes server-side — the backend itself never sees it.
 */

export type { AuthUser };

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  /** True while a driver still owes a password change (JWT flag included). */
  mustChangePassword: boolean;
  isAuthenticated: boolean;
  login: (role: Role, credentials: DriverLoginInput | StaffLoginInput) => Promise<AuthSession>;
  logout: () => void;
  /** Clears the forced-change flag locally (call after changePassword). */
  clearMustChangePassword: () => void;
  /** Applies a fresh token issued by POST /auth/driver/change-password. */
  applyToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Fallback used when localStorage holds a token but no profile JSON (older
 * session, cleared storage). Reads the JWT claims only — no signature check
 * happens here, the backend remains the authority on every request.
 */
function userFromToken(token: string): AuthUser | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as { id?: number; role?: Role; mustChangePassword?: boolean };
    if (typeof claims.id !== "number" || !claims.role) return null;
    return {
      id: claims.id,
      role: claims.role,
      firstName: "",
      lastName: "",
      mustChangePassword: claims.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore a previous session once, after hydration: localStorage can only be
  // read on the client, and the restore commits state — so the work runs in a
  // deferred callback rather than synchronously in the effect body
  // (react-hooks/set-state-in-effect). The initial render therefore always
  // matches the server (user=null, isLoading=true).
  useEffect(() => {
    const restoreSession = () => {
      const storedToken = getStoredToken();

      if (!storedToken) {
        // No token but possibly a stale user/cookie left behind — clear both.
        clearSession();
        setIsLoading(false);
        return;
      }

      let storedUser: AuthUser | null = null;
      try {
        const raw = localStorage.getItem(USER_STORAGE_KEY);
        if (raw) storedUser = JSON.parse(raw) as AuthUser;
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
      }

      if (!storedUser) storedUser = userFromToken(storedToken);

      if (storedUser) setUser(storedUser);
      setToken(storedToken);
      syncAuthCookie(); // self-heal an expired mirror cookie
      setIsLoading(false);
    };

    const timer = window.setTimeout(restoreSession, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 401 anywhere → drop the session (navigation back to /login is handled by
  // the lib/axios.ts interceptor, mirroring the driver-app 401 handling).
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
    });
    return () => registerUnauthorizedHandler(null);
  }, []);

  const persistSession = useCallback((session: AuthSession) => {
    persistToken(session.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
    setUser(session.user);
    setToken(session.token);
  }, []);

  const login = useCallback(
    async (role: Role, credentials: DriverLoginInput | StaffLoginInput): Promise<AuthSession> => {
      const session = await authService.login(role, credentials);
      persistSession(session);
      // A driver whose mustChangePassword flag is set is sent to the change
      // screen INSTEAD of their role home. The backend's auth middleware 403s
      // every route except POST /auth/driver/change-password for such a token
      // (backend/src/middleware/auth.js), and the flag defaults to true for
      // every new, admin-created or password-reset driver — so landing on
      // /home here produced a signed-in app where every request failed and the
      // dashboard rendered a confident "All Clear" over the failures.
      if (session.user.mustChangePassword) {
        router.replace("/change-password");
        return session;
      }
      // Role-aware landing: driver → /home, enforcer → /enforcer,
      // admin → /admin/dashboard.
      router.replace(homeForRole(session.user.role));
      return session;
    },
    [persistSession, router]
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
    router.replace("/login");
  }, [router]);

  const clearMustChangePassword = useCallback(() => {
    setUser((current) => {
      if (!current || !current.mustChangePassword) return current;
      const next = { ...current, mustChangePassword: false };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const applyToken = useCallback(
    (nextToken: string) => {
      persistToken(nextToken);
      setToken(nextToken);
      // The fresh JWT from change-password has mustChangePassword=false.
      setUser((current) => {
        if (!current) return userFromToken(nextToken);
        const next = { ...current, mustChangePassword: false };
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      mustChangePassword: user?.mustChangePassword === true,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      clearMustChangePassword,
      applyToken,
    }),
    [user, token, isLoading, login, logout, clearMustChangePassword, applyToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
