"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { RmiButton } from "@/components/RmiPrimitives";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const { configured, session, user, signOut } = useAuth();
  const { state, avatarUrl, isAdminUser, refreshServerState } = useGame();
  const [username, setUsername] = useState(state.username);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [profileIsPublic, setProfileIsPublic] = useState(true);
  const [portfolioIsPublic, setPortfolioIsPublic] = useState(true);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const displayName = state.username === "Demo Guest" ? user?.email?.split("@")[0] ?? "Guest" : state.username;

  useEffect(() => {
    setTheme(getStoredThemePreference());
  }, []);

  useEffect(() => {
    if (state.username && state.username !== "Demo Guest") {
      setUsername(state.username);
    }
  }, [state.username]);

  useEffect(() => {
    if (!session) {
      return;
    }

    fetch("/api/profile/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({})
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.ok && payload.profile) {
          setProfileIsPublic(payload.profile.profileIsPublic !== false);
          setPortfolioIsPublic(payload.profile.portfolioIsPublic !== false);
        }
      })
      .catch(() => setMessage("Could not load privacy settings."));
  }, [session]);

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

    if (!/^[A-Za-z0-9_.-]{2,32}$/.test(next)) {
      setMessage("Use 2-32 letters, numbers, periods, hyphens, or underscores.");
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

  async function savePrivacy() {
    if (!session) {
      return;
    }

    const response = await fetch("/api/profile/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        profileIsPublic,
        portfolioIsPublic: profileIsPublic && portfolioIsPublic
      })
    });
    const payload = await response.json();
    setMessage(payload.ok ? "Privacy settings saved." : payload.error ?? "Could not save privacy settings.");
  }

  async function deleteAccount() {
    if (!session || deleting) {
      return;
    }

    setDeleting(true);
    const response = await fetch("/api/profile/delete", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ confirmation: deleteConfirmation, password: deletePassword })
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setMessage(payload.error ?? "Could not delete account.");
      setDeleting(false);
      return;
    }

    await signOut();
    router.replace("/");
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
              maxLength={32}
              pattern="[A-Za-z0-9_.-]{2,32}"
              title="Use 2-32 letters, numbers, periods, hyphens, or underscores."
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

      <SettingsGroup title="Privacy">
        <SettingsRow label="Public Profile">
          <Toggle
            checked={profileIsPublic}
            onChange={(checked) => {
              setProfileIsPublic(checked);
              if (!checked) {
                setPortfolioIsPublic(false);
              }
            }}
            label="Allow traders to open your profile"
          />
        </SettingsRow>
        <SettingsRow label="Public Portfolio">
          <Toggle
            checked={profileIsPublic && portfolioIsPublic}
            onChange={setPortfolioIsPublic}
            disabled={!profileIsPublic}
            label="Show holdings and performance on your profile"
          />
        </SettingsRow>
        <div className="flex justify-end border-t border-line px-4 py-3">
          <button type="button" onClick={savePrivacy} className="rounded-lg bg-paper px-4 py-2 text-sm font-black text-ink">
            Save Privacy
          </button>
        </div>
      </SettingsGroup>

      <section className="rmi-card flex gap-3 p-4 text-sm leading-6 text-paper/65">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-mint" aria-hidden="true" />
        <p>
          Email addresses and trade history are never shown on public profiles. Public portfolio visibility only controls holdings, cash, and performance.
        </p>
      </section>

      <SettingsGroup title="Danger Zone" danger>
        <SettingsRow label="Delete Account">
          <div className="grid w-full max-w-md gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={`Type ${displayName} to confirm`}
              className="h-9 min-w-0 rounded-lg border border-ember/40 bg-panelSoft px-3 text-sm outline-none focus:border-ember"
              disabled={isAdminUser || deleting}
            />
            <input
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              className="h-9 min-w-0 rounded-lg border border-ember/40 bg-panelSoft px-3 text-sm outline-none focus:border-ember sm:row-start-2"
              disabled={isAdminUser || deleting}
            />
            <button
              type="button"
              onClick={deleteAccount}
              disabled={isAdminUser || deleting || deleteConfirmation !== displayName || deletePassword.length < 8}
              className="rounded-lg border border-ember/60 px-3 py-1.5 text-sm font-black text-ember disabled:cursor-not-allowed disabled:opacity-40 sm:row-span-2"
              title={isAdminUser ? "Administrator accounts must be removed by another administrator." : undefined}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
            {isAdminUser ? (
              <p className="text-xs leading-5 text-paper/45 sm:col-span-2">
                Administrator deletion is locked here to prevent the only operator account from being removed accidentally.
              </p>
            ) : null}
          </div>
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

function Toggle({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={disabled ? "flex items-center gap-3 text-paper/35" : "flex items-center gap-3 text-paper/65"}>
      <span className="hidden text-right text-xs font-bold sm:block">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-panelSoft ring-1 ring-line transition peer-checked:bg-mint peer-disabled:opacity-40 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-paper after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}
