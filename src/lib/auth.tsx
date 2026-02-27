'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabaseClient';

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

interface AdminCacheEntry {
  user: AdminUser;
  cachedAt: number;
}

interface AuthContextType {
  user: AdminUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ADMIN_CACHE_KEY = 'lavika_admin_cache_v1';
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => {
        timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function readAdminCache(userId: string): AdminUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(ADMIN_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AdminCacheEntry;
    const isExpired = Date.now() - parsed.cachedAt > ADMIN_CACHE_TTL_MS;

    if (isExpired || parsed.user.id !== userId) {
      window.sessionStorage.removeItem(ADMIN_CACHE_KEY);
      return null;
    }

    return parsed.user;
  } catch {
    return null;
  }
}

function writeAdminCache(user: AdminUser) {
  if (typeof window === 'undefined') return;

  const payload: AdminCacheEntry = {
    user,
    cachedAt: Date.now(),
  };

  window.sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(payload));
}

function clearAdminCache() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ADMIN_CACHE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const adminCheckInFlight = useRef<Map<string, Promise<boolean>>>(new Map());
  const router = useRouter();

  const checkAdminStatus = useCallback(async (userId: string, userEmail: string): Promise<boolean> => {
    const cachedUser = readAdminCache(userId);
    if (cachedUser) {
      setUser(cachedUser);
      setIsAdmin(true);
      return true;
    }

    const existingCheck = adminCheckInFlight.current.get(userId);
    if (existingCheck) {
      return existingCheck;
    }

    const checkPromise = (async () => {
      try {
        const { data } = await supabase
          .from('dev_admins')
          .select('user_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (data) {
          const adminUser: AdminUser = {
            id: data.user_id,
            email: userEmail,
            name: userEmail.split('@')[0],
          };

          setUser(adminUser);
          setIsAdmin(true);
          writeAdminCache(adminUser);
          return true;
        }

        clearAdminCache();
        setUser(null);
        setIsAdmin(false);
        return false;
      } catch (err) {
        console.error('Error checking admin status:', err);
        clearAdminCache();
        setUser(null);
        setIsAdmin(false);
        return false;
      } finally {
        adminCheckInFlight.current.delete(userId);
      }
    })();

    adminCheckInFlight.current.set(userId, checkPromise);
    return checkPromise;
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await withTimeout(
            checkAdminStatus(session.user.id, session.user.email || ''),
            AUTH_TIMEOUT_MS,
            false
          );
        }
      } catch (err) {
        console.error('Auth init error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (session?.user) {
          await withTimeout(
            checkAdminStatus(session.user.id, session.user.email || ''),
            AUTH_TIMEOUT_MS,
            false
          );
        } else {
          setUser(null);
          setIsAdmin(false);
        }
        setIsLoading(false);
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAdminStatus]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setIsLoading(false);
        return { error: error.message };
      }

      if (data.user) {
        const isUserAdmin = await checkAdminStatus(data.user.id, data.user.email || '');
        
        if (!isUserAdmin) {
          await supabase.auth.signOut();
          setIsLoading(false);
          return { error: 'Accesso negato: utente non autorizzato' };
        }
      }

      setIsLoading(false);
      return { error: null };
    } catch (err) {
      console.error('Sign in error:', err);
      setIsLoading(false);

      const rawMessage = err instanceof Error ? err.message : 'Errore durante il login';
      const normalized = rawMessage.toLowerCase();

      if (normalized.includes('failed to fetch') || normalized.includes('load failed')) {
        return {
          error: 'Connessione a Supabase non riuscita. Verifica URL/KEY pubbliche o eventuali blocchi di rete.',
        };
      }

      return { error: rawMessage };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAdminCache();
    setUser(null);
    setIsAdmin(false);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
