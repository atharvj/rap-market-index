"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function ResetPasswordPage() {
  const { configured, loading, session } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setMessage("Use at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error } = await getBrowserSupabaseClient().auth.updateUser({ password });
    setMessage(error ? error.message : "Password updated. You can return to RMI.");
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="rmi-auth-surface market-grid mx-auto grid min-h-[420px] max-w-2xl place-items-center p-6">
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-cyan/35 bg-cyan/10 text-cyan motion-safe:animate-pulse">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-bold text-paper/60">Verifying secure recovery link...</p>
        </div>
      </div>
    );
  }

  if (!configured || !session) {
    return (
      <div className="rmi-auth-surface market-grid rmi-noise mx-auto max-w-xl overflow-hidden p-6 sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-md border border-ember/35 bg-ember/10 text-ember">
          <KeyRound className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-3xl font-black">Recovery Link Unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-paper/65">
          This recovery link is missing, invalid, or expired. Request a new reset email from Account Settings.
        </p>
        <div className="mt-5">
          <RmiButton href="/account">Return to Log In</RmiButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(380px,0.65fr)]">
      <header className="rmi-hero market-grid rmi-noise grid content-center p-6 sm:p-8">
        <p className="rmi-kicker"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> RMI Secure Account</p>
        <h1 className="mt-4 text-3xl font-black sm:text-5xl">Choose a New Password</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-paper/65">
          Create a new password for your RMI identity. The update is applied through your encrypted account session.
        </p>
      </header>

      <form onSubmit={submit} className="rmi-auth-surface market-grid grid content-center gap-4 p-5 sm:p-7">
        <div>
          <p className="rmi-data-label text-violet">Credential Reset</p>
          <h2 className="mt-2 text-xl font-black">New Access Key</h2>
        </div>
        <label className="grid gap-2 text-sm font-black">
          New Password
          <span className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rmi-terminal-input h-11 w-full pr-11 font-normal"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-paper/45 hover:text-cyan"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>
        <label className="grid gap-2 text-sm font-black">
          Confirm Password
          <input
            type={showPassword ? "text" : "password"}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="rmi-terminal-input h-11 w-full font-normal"
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" disabled={submitting} className="rmi-button-primary mt-1 h-11 rounded-md text-sm font-black disabled:opacity-60">
          {submitting ? "Updating..." : "Update Password"}
        </button>
        {message ? <p className="rounded-md border border-line bg-panelSoft px-3 py-2 text-sm font-bold text-paper/65">{message}</p> : null}
      </form>
    </div>
  );
}
