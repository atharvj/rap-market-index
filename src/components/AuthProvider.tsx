"use client";

import { getBrowserSupabaseClient, isBrowserSupabaseConfigured } from "@/lib/supabase/client";
import { formatAuthErrorMessage } from "@/lib/auth-errors";
import { getEmailDomainSuggestion, isDisposableEmailAddress } from "@/lib/email-address";
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
  signIn: (email: string, password: string, captchaToken?: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, username: string, captchaToken?: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
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
      if (!data.session) {
        setSession(null);
        setLoading(false);
        return;
      }

      const { data: verified, error } = await supabase.auth.getUser();
      const verifiedUser = verified.user;
      const verifiedSession = error || !verifiedUser ? null : data.session;

      if (verifiedSession && verifiedUser && !verifiedUser.email_confirmed_at) {
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(verifiedSession);
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
    async (email: string, password: string, captchaToken?: string) => {
      if (!configured) {
        return { ok: false, message: "Supabase is not configured yet." };
      }

      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined
      });

      if (error) {
        return { ok: false, message: formatAuthErrorMessage(error.message) };
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
    async (email: string, password: string, username: string, captchaToken?: string) => {
      if (!configured) {
        return { ok: false, message: "Supabase is not configured yet." };
      }

      const suggestedEmail = getEmailDomainSuggestion(email);

      if (suggestedEmail) {
        return {
          ok: false,
          message: `Check the email address. Did you mean ${suggestedEmail}?`
        };
      }

      if (isDisposableEmailAddress(email)) {
        return {
          ok: false,
          message: "Use a permanent email address. Temporary email services are not allowed."
        };
      }

      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/account?confirmed=1`,
          captchaToken,
          data: {
            username,
            username_is_user_selected: true
          }
        }
      });

      if (error) {
        return { ok: false, message: formatAuthErrorMessage(error.message) };
      }

      if (data.session) {
        await supabase.auth.signOut();
      }

      setSession(null);
      return {
        ok: true,
        message:
          "If this email is new, RMI sent a confirmation link. If you already have an account, log in or reset your password."
      };
    },
    [configured]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!configured) {
      return { ok: false, message: "Supabase is not configured yet." };
    }

    const { error } = await getBrowserSupabaseClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        scopes: "openid email profile",
        queryParams: {
          prompt: "select_account"
        }
      }
    });

    return error
      ? { ok: false, message: formatAuthErrorMessage(error.message) }
      : { ok: true, message: "Redirecting to Google..." };
  }, [configured]);

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
      signInWithGoogle,
      signOut
    }),
    [configured, loading, session, signIn, signInWithGoogle, signOut, signUp]
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
