"use client";

import { getBrowserSupabaseClient, isBrowserSupabaseConfigured } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AuthResult = {
  ok: boolean;
  message: string;
};

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isBrowserSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = getBrowserSupabaseClient();

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && !data.session.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession && !nextSession.user.email_confirmed_at) {
        setSession(null);
        void supabase.auth.signOut();
        return;
      }

      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [configured]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!configured) {
        return { ok: false, message: "Supabase is not configured yet." };
      }

      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return { ok: false, message: error.message };
      }

      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        setSession(null);
        return { ok: false, message: "Confirm your email address before logging in." };
      }

      setSession(data.session);
      return { ok: true, message: "Signed in." };
    },
    [configured]
  );

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      if (!configured) {
        return { ok: false, message: "Supabase is not configured yet." };
      }

      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/account?confirmed=1`,
          data: {
            username
          }
        }
      });

      if (error) {
        return { ok: false, message: error.message };
      }

      if (data.session) {
        await supabase.auth.signOut();
      }

      setSession(null);
      return {
        ok: true,
        message: "Account created. Open the confirmation email and click the verification link before logging in."
      };
    },
    [configured]
  );

  const signOut = useCallback(async () => {
    if (!configured) {
      return;
    }

    await getBrowserSupabaseClient().auth.signOut();
  }, [configured]);

  const value = useMemo(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      signOut
    }),
    [configured, loading, session, signIn, signOut, signUp]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
