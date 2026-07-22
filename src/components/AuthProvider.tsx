"use client";

import { getBrowserSupabaseClient, isBrowserSupabaseConfigured } from "@/lib/supabase/client";
import { formatAuthErrorMessage } from "@/lib/auth-errors";
import { getEmailDomainSuggestion, isDisposableEmailAddress } from "@/lib/email-address";
import { EMAIL_CONFIRMATION_PENDING_KEY, isObfuscatedExistingSignup } from "@/lib/auth-signup";
import { getUsernameValidationError, normalizeUsernameInput } from "@/lib/username";
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

      if (
        verifiedSession &&
        window.localStorage.getItem(EMAIL_CONFIRMATION_PENDING_KEY) &&
        window.location.pathname !== "/account/confirmed"
      ) {
        setSession(null);
        setLoading(false);
        return;
      }

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
      if (
        nextSession &&
        window.localStorage.getItem(EMAIL_CONFIRMATION_PENDING_KEY) &&
        window.location.pathname !== "/account/confirmed"
      ) {
        setSession(null);
        return;
      }

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

      window.localStorage.removeItem(EMAIL_CONFIRMATION_PENDING_KEY);
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

      const normalizedUsername = normalizeUsernameInput(username);
      const usernameValidationError = getUsernameValidationError(normalizedUsername);

      if (usernameValidationError) {
        return { ok: false, message: usernameValidationError };
      }

      try {
        const availabilityResponse = await fetch("/api/auth/username-availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: normalizedUsername })
        });
        const availability = await availabilityResponse.json() as {
          ok?: boolean;
          available?: boolean;
          error?: string;
        };

        if (!availabilityResponse.ok || !availability.ok || !availability.available) {
          return {
            ok: false,
            message: availability.error ?? "Could not check that username."
          };
        }
      } catch {
        return { ok: false, message: "Could not check that username. Try again." };
      }

      const supabase = getBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/account/confirmed`,
          captchaToken,
          data: {
            username: normalizedUsername,
            username_is_user_selected: true
          }
        }
      });

      if (error) {
        return { ok: false, message: formatAuthErrorMessage(error.message) };
      }

      if (isObfuscatedExistingSignup(data.user)) {
        return {
          ok: false,
          message: "This email is already registered. Log in or reset your password."
        };
      }

      if (data.session) {
        await supabase.auth.signOut();
      }

      window.localStorage.setItem(EMAIL_CONFIRMATION_PENDING_KEY, email.normalize("NFKC").trim().toLowerCase());
      setSession(null);
      return {
        ok: true,
        message: "RMI sent a confirmation link. Open it to finish creating your account."
      };
    },
    [configured]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!configured) {
      return { ok: false, message: "Supabase is not configured yet." };
    }

    window.localStorage.removeItem(EMAIL_CONFIRMATION_PENDING_KEY);
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
