import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setApiAccessToken } from '../api.js';

const AuthContext = createContext(null);
const STORAGE_KEY = 'ai-dj-engine-auth';

function readAuth() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored) return null;
    return stored.user ? { user: stored.user } : null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    throw error;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readAuth);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: session.user }));
    }
    else localStorage.removeItem(STORAGE_KEY);
    setApiAccessToken(session?.token);
  }, [session]);

  useEffect(() => {
    function handleSessionRefresh(event) {
      setSession((current) => current && ({
        ...current,
        token: event.detail.token,
        user: event.detail.user || current.user,
      }));
    }

    function handleSessionExpired() {
      setApiAccessToken(null);
      setSession(null);
    }

    window.addEventListener('ai-dj:session-refreshed', handleSessionRefresh);
    window.addEventListener('ai-dj:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('ai-dj:session-refreshed', handleSessionRefresh);
      window.removeEventListener('ai-dj:session-expired', handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (!session?.user || session.token) return undefined;
    let active = true;
    api.refresh().catch(() => {
      if (active) setSession(null);
    });
    return () => {
      active = false;
    };
  }, []);

  async function login(email, password) {
    setAuthError('');
    const result = await api.login({ email, password });
    setSession({ token: result.token, user: result.user });
    return result.user;
  }

  async function register({ displayName, email, password }) {
    setAuthError('');
    const result = await api.register({ displayName, email, password });
    setSession({ token: result.token, user: result.user });
    return result.user;
  }

  function updateUser(updates) {
    setSession((current) => current && ({ ...current, user: { ...current.user, ...updates } }));
  }

  async function logout() {
    let logoutError;
    try {
      await api.logout();
    } catch (error) {
      logoutError = error;
    }
    setApiAccessToken(null);
    setSession(null);
    if (logoutError) throw logoutError;
  }

  const value = useMemo(() => ({
    user: session?.user || null,
    token: session?.token || null,
    authError,
    setAuthError,
    login,
    register,
    updateUser,
    logout,
  }), [session, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
