"use client";

import { useAuth } from "@/components/AuthProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { useState, type FormEvent } from "react";

export default function ResetPasswordPage() {
  const { configured, loading, session } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    return <p className="text-sm text-paper/60">Checking your recovery link...</p>;
  }

  if (!configured || !session) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-3xl font-black">Reset Password</h1>
        <p className="text-sm leading-6 text-paper/65">
          This recovery link is missing, invalid, or expired. Request a new reset email from Settings.
        </p>
        <RmiButton href="/account">Return to Log In</RmiButton>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">RMI Account</p>
        <h1 className="mt-2 text-3xl font-black">Choose a New Password</h1>
        <p className="mt-2 text-sm leading-6 text-paper/65">Enter a new password for your Rap Market Index account.</p>
      </header>

      <form onSubmit={submit} className="rmi-card grid gap-3 p-5">
        <label className="grid gap-2 text-sm font-black">
          New Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-lg border border-line bg-panelSoft px-3 font-normal outline-none focus:border-cyan"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-black">
          Confirm Password
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="h-11 rounded-lg border border-line bg-panelSoft px-3 font-normal outline-none focus:border-cyan"
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" disabled={submitting} className="mt-2 h-11 rounded-lg bg-paper text-sm font-black text-ink disabled:opacity-60">
          {submitting ? "Updating..." : "Update Password"}
        </button>
        {message ? <p className="text-sm text-paper/65">{message}</p> : null}
      </form>
    </div>
  );
}
