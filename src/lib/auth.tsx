import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Role } from './types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  role: Role | null;
  displayName: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load(s: Session | null) {
      setSession(s);
      if (!s) {
        setRole(null);
        setDisplayName(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('role, display_name')
        .eq('user_id', s.user.id)
        .maybeSingle();
      if (!alive) return;
      setRole((data?.role as Role) ?? null);
      setDisplayName(data?.display_name ?? null);
      setLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setLoading(true);
      load(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ loading, session, role, displayName, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
