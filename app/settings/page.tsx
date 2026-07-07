"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { applyThemePreference, getStoredThemePreference, type ThemePreference } from "@/lib/theme";
import clsx from "clsx";
import {
  CheckCircle2,
  ChevronRight,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  WalletCards,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const settingsNav = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "security", label: "Password & Security", icon: KeyRound },
  { id: "appearance", label: "Appearance", icon: Monitor },
  { id: "portfolio", label: "Portfolio", icon: WalletCards }
];

export default function SettingsPage() {
  const { configured, session, user, signOut } = useAuth();
  const { state, avatarUrl, isAdminUser, refreshServerState } = useGame();
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const profileName = session && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Guest";
  const accountEmail = user?.email ?? "";

  useEffect(() => {
    const preference = getStoredThemePreference();
    setThemePreference(preference);
    setResolvedTheme(applyThemePreference(preference));
  }, []);

  useEffect(() => {
    if (session && profileName !== "Guest") {
      setUsername(profileName);
    }
  }, [profileName, session]);

  async function updateUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextUsername = username.trim();

    if (nextUsername.length < 2) {
      setMessage("Username must be at least 2 characters.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const ok = await refreshServerState(nextUsername);
    setSubmitting(false);
    setMessage(ok ? "Username updated." : "Could not update username.");
  }

  async function sendPasswordReset() {
    if (!user?.email) {
      setMessage("No email is attached to this account.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const { error } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/account`
    });

    setSubmitting(false);
    setMessage(error ? error.message : "Password reset email sent.");
  }

  function chooseTheme(preference: ThemePreference) {
    setThemePreference(preference);
    setResolvedTheme(applyThemePreference(preference));
  }

  if (!configured || !session) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <section className="rounded border border-line bg-panel p-6 shadow-market">
          <p className="text-[11px] font-black uppercase tracking-wide text-brass">Settings</p>
          <h1 className="mt-2 text-3xl font-black">Sign in to manage your account.</h1>
          <Link
            href="/account"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded bg-paper px-4 text-sm font-black text-ink"
          >
            Sign in
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <section className="overflow-hidden rounded border border-line bg-panel shadow-market">
        <div className="grid min-h-[760px] md:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-line bg-panelSoft p-4 md:border-b-0 md:border-r">
            <div className="mb-5 flex items-center gap-3">
              <UserAvatar avatarUrl={avatarUrl} label={profileName} size="md" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-black">{profileName}</p>
                  {isAdminUser ? <AdminBadge compact /> : null}
                </div>
                <p className="truncate text-xs font-bold text-paper/45">{accountEmail}</p>
              </div>
            </div>
            <nav className="grid gap-1">
              {settingsNav.map((item) => {
                const Icon = item.icon;

                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex min-h-9 items-center gap-2 rounded px-3 text-sm font-black text-paper/65 hover:bg-panel hover:text-paper"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </a>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 bg-panel p-5 sm:p-7">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-brass">User settings</p>
                <h1 className="mt-2 text-3xl font-black">Account settings</h1>
              </div>
              <Link
                href="/account"
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded border border-line bg-panelSoft px-3 text-xs font-black hover:border-cyan"
              >
                Manage profile
              </Link>
            </div>

            <SettingsSection id="account" title="Account Info">
              <form className="grid gap-4" onSubmit={updateUsername}>
                <SettingsRow label="Username">
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      minLength={2}
                      maxLength={32}
                      className="h-10 min-w-0 flex-1 rounded border border-line bg-panelSoft px-3 text-sm font-bold outline-none focus:border-cyan"
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded bg-cyan px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </SettingsRow>
                <SettingsRow label="Email">
                  <span className="truncate font-black text-paper/70">{accountEmail}</span>
                </SettingsRow>
                <SettingsRow label="Role">
                  <span className="inline-flex items-center gap-2 font-black">
                    {isAdminUser ? <AdminBadge /> : "Trader"}
                  </span>
                </SettingsRow>
              </form>
            </SettingsSection>

            <SettingsSection id="security" title="Password & Security">
              <SettingsRow label="Password">
                <button
                  type="button"
                  onClick={sendPasswordReset}
                  disabled={submitting}
                  className="inline-flex min-h-10 items-center justify-center rounded border border-line bg-panelSoft px-4 text-sm font-black hover:border-cyan disabled:cursor-wait disabled:opacity-60"
                >
                  Send reset email
                </button>
              </SettingsRow>
              <SettingsAction
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Account standing"
                detail="Your account is all good."
                tone="positive"
              />
            </SettingsSection>

            <SettingsSection id="appearance" title="Appearance">
              <div className="grid gap-3 sm:grid-cols-3">
                <ThemeCard
                  label="Light"
                  icon={<Sun className="h-5 w-5" />}
                  selected={themePreference === "light"}
                  onClick={() => chooseTheme("light")}
                />
                <ThemeCard
                  label="Dark"
                  icon={<Moon className="h-5 w-5" />}
                  selected={themePreference === "dark"}
                  onClick={() => chooseTheme("dark")}
                />
                <ThemeCard
                  label={`System (${resolvedTheme})`}
                  icon={<Monitor className="h-5 w-5" />}
                  selected={themePreference === "system"}
                  onClick={() => chooseTheme("system")}
                />
              </div>
            </SettingsSection>

            <SettingsSection id="portfolio" title="Portfolio">
              <SettingsAction
                icon={<WalletCards className="h-5 w-5" />}
                title="Fantasy portfolio"
                detail="Portfolio resets and admin cleanup are handled from protected operations."
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/portfolio"
                  className="inline-flex min-h-10 items-center justify-center rounded border border-line bg-panelSoft px-4 text-sm font-black hover:border-cyan"
                >
                  View portfolio
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-ember/45 bg-ember/10 px-4 text-sm font-black text-ember"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </SettingsSection>

            <SettingsSection title="Account Controls">
              <SettingsAction
                icon={<XCircle className="h-5 w-5" />}
                title="Close account"
                detail="Account deletion will be enabled after launch policies are finalized."
                tone="danger"
                action={<button className="rounded bg-ember/20 px-4 py-2 text-sm font-black text-ember opacity-50" disabled>Disabled</button>}
              />
            </SettingsSection>

            {message ? <p className="mt-5 rounded border border-line bg-panelSoft px-4 py-3 text-sm font-black text-paper/70">{message}</p> : null}
          </main>
        </div>
      </section>
    </div>
  );
}

function SettingsSection({
  id,
  title,
  children
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-b border-line py-6 first:pt-0 last:border-b-0">
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      {children}
    </section>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
      <span className="text-sm font-black text-paper/70">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SettingsAction({
  icon,
  title,
  detail,
  tone = "neutral",
  action
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: "neutral" | "positive" | "danger";
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-line bg-panelSoft p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={clsx(
            "grid h-10 w-10 shrink-0 place-items-center rounded",
            tone === "positive" ? "bg-mint/12 text-mint" : tone === "danger" ? "bg-ember/12 text-ember" : "bg-panel text-paper/55"
          )}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black">{title}</span>
          <span className="mt-1 block text-sm font-bold leading-5 text-paper/50">{detail}</span>
        </span>
      </div>
      {action ?? <ChevronRight className="h-5 w-5 shrink-0 text-paper/35" aria-hidden="true" />}
    </div>
  );
}

function ThemeCard({
  label,
  icon,
  selected,
  onClick
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "grid gap-3 rounded border p-4 text-left",
        selected ? "border-mint bg-mint/10" : "border-line bg-panelSoft hover:border-cyan"
      )}
    >
      <span className="grid h-24 place-items-center rounded border border-line bg-panel">
        <span className="grid h-12 w-16 place-items-center rounded bg-panelSoft text-paper/65">{icon}</span>
      </span>
      <span className="flex items-center gap-2 text-sm font-black">
        {selected ? <CheckCircle2 className="h-4 w-4 text-mint" /> : <span className="h-4 w-4 rounded-full border border-paper/35" />}
        {label}
      </span>
    </button>
  );
}
