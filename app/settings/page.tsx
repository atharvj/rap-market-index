"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { RmiButton } from "@/components/RmiPrimitives";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import { Eye, EyeOff, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

export default function SettingsPage() {
  const router = useRouter();
  const { configured, session, user, signOut } = useAuth();
  const { state, avatarUrl, isAdminUser, refreshServerState } = useGame();
  const [username, setUsername] = useState(state.username);
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [profileIsPublic, setProfileIsPublic] = useState(true);
  const [portfolioIsPublic, setPortfolioIsPublic] = useState(true);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [passwordCaptchaToken, setPasswordCaptchaToken] = useState<string | null>(null);
  const [passwordCaptchaResetKey, setPasswordCaptchaResetKey] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteCaptchaToken, setDeleteCaptchaToken] = useState<string | null>(null);
  const [deleteCaptchaResetKey, setDeleteCaptchaResetKey] = useState(0);
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
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rmi-page-head">
          <div className="rmi-kicker">Control Center</div>
          <h1 className="mt-2 text-3xl font-black">Settings</h1>
        </header>
        <section className="rmi-auth-surface market-grid p-5">
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

    if (turnstileSiteKey && !passwordCaptchaToken) {
      setMessage("Complete the security check before requesting a reset email.");
      return;
    }

    const { error } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/account/reset-password`,
      captchaToken: passwordCaptchaToken ?? undefined
    });

    setMessage(error ? error.message : "Password reset email sent.");
    setPasswordCaptchaToken(null);
    setPasswordCaptchaResetKey((current) => current + 1);

    if (!error) {
      setPasswordResetOpen(false);
    }
  }

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    applyThemePreference(value);
  }

  async function savePrivacy(nextProfileIsPublic: boolean, nextPortfolioIsPublic: boolean) {
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
        profileIsPublic: nextProfileIsPublic,
        portfolioIsPublic: nextProfileIsPublic && nextPortfolioIsPublic
      })
    });
    const payload = await response.json();
    setMessage(payload.ok ? "Visibility updated." : payload.error ?? "Could not update visibility.");
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
      body: JSON.stringify({
        confirmation: displayName,
        password: deletePassword,
        captchaToken: deleteCaptchaToken ?? undefined
      })
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setMessage(payload.error ?? "Could not delete account.");
      setDeleting(false);
      setDeleteCaptchaToken(null);
      setDeleteCaptchaResetKey((current) => current + 1);
      return;
    }

    await signOut();
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rmi-page-head">
        <div className="rmi-kicker">Trader Control Center</div>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-paper/55">Identity, access, appearance, and public-profile controls.</p>
      </header>

      <section className="rmi-card market-grid rmi-noise flex items-center justify-between gap-4 p-4 sm:p-5">
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
        <RmiButton href="/account" variant="secondary">Edit Profile</RmiButton>
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
              className="rmi-terminal-input h-9 min-w-0 flex-1 px-3 text-sm font-black"
            />
            <button type="button" onClick={saveUsername} className="rmi-button-secondary px-3 text-sm">
              Save
            </button>
          </div>
        </SettingsRow>
        <SettingsRow label="Email">
          <span className="font-black text-paper/70">{user?.email}</span>
        </SettingsRow>
        <SettingsRow label="Password">
          <div className="flex w-full flex-col items-end gap-3">
            <button
              type="button"
              onClick={() => {
                if (turnstileSiteKey) {
                  setPasswordResetOpen((open) => !open);
                  return;
                }

                void sendPasswordReset();
              }}
              className="rmi-button-secondary px-3 py-1.5 text-sm"
            >
              Change
            </button>
            {passwordResetOpen ? (
              <div className="grid justify-items-end gap-2">
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  onTokenChange={setPasswordCaptchaToken}
                  resetKey={passwordCaptchaResetKey}
                  action="rmi_password_reset"
                />
                <button
                  type="button"
                  onClick={sendPasswordReset}
                  disabled={!passwordCaptchaToken}
                  className="rmi-button-primary px-3 py-2 text-sm disabled:opacity-40"
                >
                  Send Reset Email
                </button>
              </div>
            ) : null}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow label="Theme">
          <select
            value={theme}
            onChange={(event) => chooseTheme(event.target.value as ThemePreference)}
            className="rmi-terminal-input h-9 flex-1 px-3 text-sm font-black"
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Profile Visibility">
        <SettingsRow label="Public Profile">
          <Toggle
            checked={profileIsPublic}
            onChange={(checked) => {
              setProfileIsPublic(checked);
              const nextPortfolioIsPublic = checked ? portfolioIsPublic : false;
              setPortfolioIsPublic(nextPortfolioIsPublic);
              void savePrivacy(checked, nextPortfolioIsPublic);
            }}
            label="Allow traders to open your profile"
          />
        </SettingsRow>
        <SettingsRow label="Public Portfolio">
          <Toggle
            checked={profileIsPublic && portfolioIsPublic}
            onChange={(checked) => {
              setPortfolioIsPublic(checked);
              void savePrivacy(profileIsPublic, checked);
            }}
            disabled={!profileIsPublic}
            label="Show holdings and performance on your profile"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger Zone" danger>
        <SettingsRow label="Delete Account">
          <div className="flex w-full items-center justify-end gap-3">
            {isAdminUser ? <span className="text-xs text-paper/45">Protected operator account</span> : null}
            <button
              type="button"
              onClick={() => {
                setDeleteCaptchaToken(null);
                setDeleteCaptchaResetKey((current) => current + 1);
                setDeleteOpen(true);
              }}
              disabled={isAdminUser}
              className="inline-flex items-center gap-2 rounded-lg border border-ember/60 px-3 py-1.5 text-sm font-black text-ember disabled:cursor-not-allowed disabled:opacity-40"
              title={isAdminUser ? "Administrator accounts must be removed by another administrator." : "Delete account"}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete Account
            </button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {message ? <p className="rounded-md border border-cyan/25 bg-cyan/5 px-4 py-3 text-sm font-semibold text-paper/70">{message}</p> : null}

      {deleteOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <div className="rmi-card market-grid rmi-noise w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 id="delete-account-title" className="text-xl font-black">Delete Account</h2>
              <button type="button" onClick={() => setDeleteOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-paper/55 hover:bg-panelSoft" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-paper/60">
              This permanently removes your profile, watchlist, portfolio, and trade records. Enter your password to continue.
            </p>
            <div className="relative mt-5">
              <input
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                type={showDeletePassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                className="rmi-terminal-input h-11 w-full border-ember/40 px-3 pr-11 text-sm focus:border-ember"
                disabled={deleting}
              />
              <button
                type="button"
                onClick={() => setShowDeletePassword((visible) => !visible)}
                className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-paper/45 hover:bg-panel"
                aria-label={showDeletePassword ? "Hide password" : "Show password"}
              >
                {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-4">
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onTokenChange={setDeleteCaptchaToken}
                resetKey={deleteCaptchaResetKey}
                action="rmi_account_delete"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} className="min-h-10 rounded-lg border border-line px-4 text-sm font-black">Cancel</button>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting || deletePassword.length < 8 || Boolean(turnstileSiteKey && !deleteCaptchaToken)}
                className="min-h-10 rounded-lg bg-ember px-4 text-sm font-black text-white disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SettingsGroup({ title, children, danger = false }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <section>
      <h2 className={danger ? "rmi-data-label mb-2 text-ember" : "rmi-data-label mb-2 text-cyan"}>{title}</h2>
      <div className={danger ? "overflow-hidden rounded-lg border border-ember/50 bg-ember/[0.03]" : "rmi-card overflow-hidden border-l-2 border-l-cyan/50"}>{children}</div>
    </section>
  );
}

function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-cyan/[0.025]">
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
