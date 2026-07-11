"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { RmiButton } from "@/components/RmiPrimitives";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import { useEffect, useState, type ReactNode } from "react";

export default function SettingsPage() {
  const { configured, session, user } = useAuth();
  const { state, avatarUrl, isAdminUser, refreshServerState } = useGame();
  const [username, setUsername] = useState(state.username);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const displayName = state.username === "Demo Guest" ? user?.email?.split("@")[0] ?? "Guest" : state.username;

  useEffect(() => {
    setTheme(getStoredThemePreference());
  }, []);

  if (!configured || !session) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-black">Settings</h1>
        <section className="rmi-card p-5">
          <p className="text-sm font-bold text-paper/70">Sign in to manage your account.</p>
          <div className="mt-4">
            <RmiButton href="/account">Log in</RmiButton>
          </div>
        </section>
      </div>
    );
  }

  async function saveUsername() {
    const next = username.trim();

    if (next.length < 2) {
      setMessage("Display name must be at least 2 characters.");
      return;
    }

    const ok = await refreshServerState(next);
    setMessage(ok ? "Profile saved." : "Could not save profile.");
  }

  async function sendPasswordReset() {
    if (!user?.email) {
      setMessage("No email is attached to this account.");
      return;
    }

    const { error } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/account/reset-password`
    });

    setMessage(error ? error.message : "Password reset email sent.");
  }

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    applyThemePreference(value);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-3xl font-black">Settings</h1>

      <section className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar avatarUrl={avatarUrl} label={displayName} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-black">{displayName}</p>
              {isAdminUser ? <AdminBadge compact /> : null}
            </div>
            <p className="truncate text-xs font-bold text-paper/55">{user?.email}</p>
          </div>
        </div>
        <RmiButton href="/account" variant="secondary">Edit profile</RmiButton>
      </section>

      <SettingsGroup title="Account">
        <SettingsRow label="Display name">
          <div className="flex flex-1 gap-2">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panelSoft px-3 text-sm font-black outline-none focus:border-cyan"
            />
            <button type="button" onClick={saveUsername} className="rounded-lg border border-line px-3 text-sm font-black hover:border-cyan">
              Save
            </button>
          </div>
        </SettingsRow>
        <SettingsRow label="Email">
          <span className="font-black text-paper/70">{user?.email}</span>
        </SettingsRow>
        <SettingsRow label="Password">
          <button type="button" onClick={sendPasswordReset} className="rounded-lg border border-line px-3 py-1.5 text-sm font-black hover:border-cyan">
            Change
          </button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow label="Theme">
          <select
            value={theme}
            onChange={(event) => chooseTheme(event.target.value as ThemePreference)}
            className="h-9 flex-1 rounded-lg border border-line bg-panelSoft px-3 text-sm font-black outline-none"
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger Zone" danger>
        <SettingsRow label="Delete account">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg border border-line px-3 py-1.5 text-sm text-paper/40"
            title="Account deletion will be enabled before public launch."
          >
            Unavailable in Beta
          </button>
        </SettingsRow>
      </SettingsGroup>

      {message ? <p className="text-sm font-bold text-paper/65">{message}</p> : null}
    </div>
  );
}

function SettingsGroup({ title, children, danger = false }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <section>
      <h2 className={danger ? "mb-2 text-sm font-black text-ember" : "mb-2 text-sm font-black text-paper/65"}>{title}</h2>
      <div className={danger ? "overflow-hidden rounded-xl border border-ember/50" : "rmi-card overflow-hidden"}>{children}</div>
    </section>
  );
}

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <span className="text-sm font-black">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}
