"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { formatCurrency } from "@/lib/formatters";
import { LockKeyhole, LogOut, Mail, Server, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export default function AccountPage() {
  const { configured, loading, session, user, signIn, signOut, signUp } = useAuth();
  const { state, refreshServerState } = useGame();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const profileName = session && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Not signed in";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("mode") === "signup") {
      setMode("signup");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result =
      mode === "signin" ? await signIn(email, password) : await signUp(email, password, username || email);
    setMessage(result.message);
    setSubmitting(false);

    if (result.ok) {
      await refreshServerState(username || undefined);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brass">Account</p>
        <h1 className="mt-2 text-4xl font-black">Player profile</h1>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-line bg-panel p-4 shadow-market">
          <p className="text-xs font-bold uppercase tracking-wide text-paper/50">Player</p>
          <p className="mt-2 text-2xl font-black">{profileName}</p>
          <p className="mt-1 text-sm text-paper/50">
            {user?.email ?? "Create an account or sign in to trade."}
          </p>
        </div>
        <div className="rounded border border-line bg-panel p-4 shadow-market">
          <p className="text-xs font-bold uppercase tracking-wide text-paper/50">Cash</p>
          <p className="mt-2 text-2xl font-black number-tabular">{formatCurrency(state.cashBalance)}</p>
          <p className="mt-1 text-sm text-paper/50">{session ? "Cloud profile" : "Sign in required"}</p>
        </div>
      </section>

      {!configured ? (
        <section className="rounded border border-line bg-panel p-5 shadow-market">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded bg-brass text-white">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black">Unsaved demo mode active</h2>
              <p className="mt-2 text-sm leading-6 text-paper/60">
                Add Supabase values to `.env.local` when you are ready for cloud accounts and saved portfolios.
              </p>
            </div>
          </div>
        </section>
      ) : session ? (
        <section className="rounded border border-line bg-panel p-5 shadow-market">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">{user?.email}</h2>
              <p className="mt-1 text-sm text-paper/50">Signed in with a saved trading profile.</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-ember/45 bg-ember/10 px-4 font-black text-ember"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded border border-line bg-panel p-5 shadow-market">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded border border-line bg-panelSoft p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded px-3 py-2 text-sm font-black ${
                mode === "signin" ? "bg-cyan text-white" : "text-paper/50"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded px-3 py-2 text-sm font-black ${
                mode === "signup" ? "bg-cyan text-white" : "text-paper/50"
              }`}
            >
              Create
            </button>
          </div>

          <form className="grid gap-4" onSubmit={submit}>
            {mode === "signup" ? (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-paper/50">Username</span>
                <input
                  className="mt-2 h-11 w-full rounded border border-line bg-panelSoft px-3 outline-none focus:border-cyan"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  minLength={2}
                  maxLength={32}
                  required
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-paper/50">Email</span>
              <div className="mt-2 flex h-11 items-center rounded border border-line bg-panelSoft px-3 focus-within:border-cyan">
                <Mail className="mr-2 h-4 w-4 text-paper/40" />
                <input
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-paper/50">Password</span>
              <div className="mt-2 flex h-11 items-center rounded border border-line bg-panelSoft px-3 focus-within:border-cyan">
                <LockKeyhole className="mr-2 h-4 w-4 text-paper/40" />
                <input
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  required
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading || submitting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded bg-mint px-4 font-black text-white disabled:cursor-wait disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {message ? <p className="mt-4 text-sm font-bold text-paper/60">{message}</p> : null}
        </section>
      )}
    </div>
  );
}
