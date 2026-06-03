import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type ApiUser } from '../lib/api';

interface AuthState {
  user: ApiUser | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
  /** True when no account exists yet (show the "create first account" form). */
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  /** Creates the first account, then logs in with the same credentials. */
  register: (username: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // On mount, resolve the current session; if there isn't one, find out whether
  // the system still needs its first account.
  useEffect(() => {
    (async () => {
      try {
        setUser(await api.me());
      } catch {
        try {
          setNeedsSetup(await api.needsSetup());
        } catch {
          /* API unreachable — login form will surface the error on submit */
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    setUser(await api.login(username, password));
  };

  const register = async (username: string, password: string, fullName?: string) => {
    await api.register(username, password, fullName);
    // Registration doesn't set a session cookie, so log in right after.
    setUser(await api.login(username, password));
    setNeedsSetup(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, needsSetup, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
