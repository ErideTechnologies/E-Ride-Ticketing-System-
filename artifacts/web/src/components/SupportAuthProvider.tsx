import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type SupportAuthState,
  type SupportPermission,
  type SupportSessionUser,
  userHasPermission,
} from "@/lib/supportAuth";

const ME_URL = `${import.meta.env.BASE_URL}api/support/auth/me`;
const LOGIN_URL = `${import.meta.env.BASE_URL}api/support/auth/login`;
const LOGOUT_URL = `${import.meta.env.BASE_URL}api/support/auth/logout`;

interface SupportAuthContextValue extends SupportAuthState {
  loading: boolean;
  refresh: () => Promise<void>;
  login: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  hasPermission: (permission: SupportPermission) => boolean;
}

const Ctx = createContext<SupportAuthContextValue | null>(null);

const EMPTY_STATE: SupportAuthState = {
  authenticated: false,
  user: null,
  permissions: [],
  loginConfigured: true,
};

export function SupportAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SupportAuthState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(ME_URL, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        setState(EMPTY_STATE);
      } else {
        const data = (await res.json()) as SupportAuthState;
        setState({
          authenticated: !!data.authenticated,
          user: data.user ?? null,
          permissions: data.permissions ?? [],
          loginConfigured: data.loginConfigured ?? true,
        });
      }
    } catch {
      setState(EMPTY_STATE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback<SupportAuthContextValue["login"]>(
    async (email, password, name) => {
      const res = await fetch(LOGIN_URL, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      if (!res.ok) {
        let msg = "Sign in failed";
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") msg = body.error;
        } catch {
          /* ignore */
        }
        return { ok: false, error: msg };
      }
      await refresh();
      return { ok: true };
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(LOGOUT_URL, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setState(EMPTY_STATE);
      await refresh();
    }
  }, [refresh]);

  const value = useMemo<SupportAuthContextValue>(
    () => ({
      ...state,
      loading,
      refresh,
      login,
      logout,
      hasPermission: (p) => userHasPermission(state.user, p),
    }),
    [state, loading, refresh, login, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSupportAuth(): SupportAuthContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSupportAuth must be used inside SupportAuthProvider");
  }
  return ctx;
}

export function useSupportUser(): SupportSessionUser | null {
  return useSupportAuth().user;
}
