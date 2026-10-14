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
  clearSession,
  currentRole,
  getStoredToken,
  getStoredUser,
  persistToken,
  persistUser,
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
 * Concurrent sessions: each role owns independent storage keys
 * (lib/axios.ts TOKEN_STORAGE_KEYS/USER_STORAGE_KEYS), and this tab hydrates
 * ONLY the role its route prefix belongs to (/admin → admin, /home +
 * driver auth flows → driver, /enforcer → enforcer; bare / and /login fall
 * back to the most recently used role). One AuthContext instance still
 * represents exactly one role — sibling tabs keep their own.
 *
 * Each role's token is additionally mirrored into a same-named cookie so
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

  // Restore this tab's role session once, after hydration: localStorage can
  // only be read on the client, and the restore commits state — so the work
  // runs in a deferred callback rather than synchronously in the effect body
  // (react-hooks/set-state-in-effect). The initial render therefore always
  // matches the server (user=null, isLoading=true).
  useEffect(() => {
    const restoreSession = () => {
      // This tab's role only — never another role's keys (that would let one
      // tab impersonate another). Bare pages (/, /login) resolve via the
      // most-recently-used role with a stored token.
      const role = currentRole();

      if (!role) {
        setIsLoading(false);
        return;
      }

      const storedToken = getStoredToken(role);

      if (!storedToken) {
        // No token for THIS role, but possibly stale remnants of it left
        // behind — clear only this role's slots, never sibling roles'.
        clearSession(role);
        setIsLoading(false);
        return;
      }

      let storedUser = getStoredUser<AuthUser>(role);

      if (!storedUser) storedUser = userFromToken(storedToken);

      if (storedUser) setUser(storedUser);
      setToken(storedToken);
      syncAuthCookie(role); // self-heal an expired mirror cookie
      setIsLoading(false);
    };

    const timer = window.setTimeout(restoreSession, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 401 for THIS tab's role clears its React state (the lib/axios.ts
  // interceptor already cleared that role's storage; navigation back to
  // /login is handled there too, mirroring the driver-app 401 handling).
  // Sibling tabs run their own provider instance with their own role state.
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
    });
    return () => registerUnauthorizedHandler(null);
  }, []);

  const persistSession = useCallback((session: AuthSession) => {
    // The login role is explicit — the session lands ONLY in that role's
    // slots, so signing in as an enforcer here cannot overwrite a driver
    // session living in another tab.
    const role = session.user.role;
    persistToken(session.token, role);
    persistUser(role, session.user);
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
    // Signs out ONLY this tab's role. Role comes from live state first (the
    // common case), falling back to this tab's route prefix.
    const role = user?.role ?? currentRole();
    clearSession(role);
    setUser(null);
    setToken(null);
    router.replace("/login");
  }, [router, user?.role]);

  const clearMustChangePassword = useCallback(() => {
    setUser((current) => {
      if (!current || !current.mustChangePassword) return current;
      const next = { ...current, mustChangePassword: false };
      persistUser(current.role, next);
      return next;
    });
  }, []);

  const applyToken = useCallback(
    (nextToken: string) => {
      // Driver-only flow (POST /auth/driver/change-password): the fresh token
      // replaces the token in the driver's slots only.
      const role: Role = "driver";
      persistToken(nextToken, role);
      setToken(nextToken);
      // The fresh JWT from change-password has mustChangePassword=false.
      setUser((current) => {
        if (!current) return userFromToken(nextToken);
        const next = { ...current, mustChangePassword: false };
        persistUser(current.role, next);
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
