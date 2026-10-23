import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const Ctx = createContext(null);
const USER_KEY = 'clinic.user';
export const useApp = () => useContext(Ctx);

const readUser = () => {
  try { return getToken() ? JSON.parse(localStorage.getItem(USER_KEY)) : null; } catch { return null; }
};

export function AppProvider({ children }) {
  const [user, setUserState] = useState(readUser);
  const [booting, setBooting] = useState(() => !!getToken() && !readUser());
  const [clinic, setClinic] = useState(null);
  const [toasts, setToasts] = useState([]);

  const setUser = useCallback((u) => {
    setUserState(u);
    try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch { /* private mode */ }
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); }, [setUser]);
  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  useEffect(() => {
    api('/clinic').then((c) => {
      setClinic(c);
      document.title = c.settings.clinic_name;
    }).catch(() => {});
    if (!getToken()) return;
    api('/auth/me').then(({ user }) => setUser(user)).catch(() => {}).finally(() => setBooting(false));
  }, [setUser]);

  const login = useCallback((token, u) => { setToken(token); setUser(u); }, [setUser]);

  const toast = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const isStaff = !!user && user.role !== 'patient';
  const value = { user, setUser, booting, login, logout, toast, toasts, clinic, setClinic, isStaff, settings: clinic?.settings || {} };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Fetch on mount and whenever deps change; returns { data, error, loading, reload, setData }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false })
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })), []);
  return { ...state, reload, setData };
}
