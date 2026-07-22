"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { RmiButton } from "@/components/RmiPrimitives";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { formatCurrency } from "@/lib/formatters";
import { formatAuthErrorMessage } from "@/lib/auth-errors";
import { getEmailDomainWarning } from "@/lib/email-address";
import { getUsernameValidationError, normalizeUsernameInput, USERNAME_REQUIREMENTS } from "@/lib/username";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { Camera, CalendarDays, Eye, EyeOff, ImagePlus, LogOut, Plus, Search, Star, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ProfileDetailsResponse = {
  ok: boolean;
  error?: string;
  profile?: {
    bio?: string;
    favoriteArtistIds?: string[];
    avatarUrl?: string;
    isAdmin?: boolean;
  };
};

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="rmi-auth-surface mx-auto h-80 max-w-xl motion-safe:animate-pulse" />}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, loading: authLoading, session, user, signIn, signInWithGoogle, signOut, signUp } = useAuth();
  const { state, portfolioValue, holdings, isAdminUser, avatarUrl, refreshServerState } = useGame();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [bio, setBio] = useState("");
  const [favoriteArtistIds, setFavoriteArtistIds] = useState<string[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const displayName = session && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Trader";
  const emailDomainWarning = mode === "signup" ? getEmailDomainWarning(email) : null;
  const favoriteArtists = useMemo(
    () =>
      favoriteArtistIds
        .map((artistId) => state.artists.find((artist) => artist.id === artistId))
        .filter((artist): artist is (typeof state.artists)[number] => Boolean(artist)),
    [favoriteArtistIds, state.artists]
  );
  const favoriteSuggestions = useMemo(() => {
    const normalized = favoriteQuery.trim().toLowerCase();

    return state.artists
      .filter(
        (artist) =>
          !favoriteArtistIds.includes(artist.id) &&
          (!normalized ||
            artist.name.toLowerCase().includes(normalized) ||
            artist.ticker.toLowerCase().includes(normalized))
      )
      .sort((first, second) => {
        if (normalized) {
          const firstStarts =
            first.name.toLowerCase().startsWith(normalized) || first.ticker.toLowerCase().startsWith(normalized);
          const secondStarts =
            second.name.toLowerCase().startsWith(normalized) || second.ticker.toLowerCase().startsWith(normalized);

          if (firstStarts !== secondStarts) {
            return firstStarts ? -1 : 1;
          }
        }

        return first.name.localeCompare(second.name);
      })
      .slice(0, 8);
  }, [favoriteArtistIds, favoriteQuery, state.artists]);

  useEffect(() => {
    setMode(searchParams.get("mode") === "signup" ? "signup" : "signin");
    setCaptchaToken(null);
    setCaptchaResetKey((current) => current + 1);
  }, [searchParams]);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = hash.get("error_description");

    if (authError) {
      setMode("signin");
      setMessage(authError.replace(/\+/g, " "));
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return;
    }

    if (searchParams.get("confirmed") === "1") {
      setMessage("Finishing email confirmation...");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("confirmed") !== "1" || !session) {
      return;
    }

    let active = true;
    setMessage("Email confirmed. Signing you in...");

    void refreshServerState().then(() => {
      if (active) {
        router.replace("/");
      }
    });

    return () => {
      active = false;
    };
  }, [refreshServerState, router, searchParams, session]);

  useEffect(() => {
    if (!configured || !session) {
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
      .then((response) => response.json() as Promise<ProfileDetailsResponse>)
      .then((payload) => {
        if (payload.ok && payload.profile) {
          setBio(payload.profile.bio ?? "");
          setFavoriteArtistIds(payload.profile.favoriteArtistIds ?? []);
        }
      })
      .catch(() => setMessage("Could not load profile details."));
  }, [configured, session]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (turnstileSiteKey && !captchaToken) {
      setMessage("Complete the security check before continuing.");
      return;
    }

    setSubmitting(true);
    const normalizedEmail = email.trim();
    const normalizedUsername = normalizeUsernameInput(username);

    if (mode === "signup") {
      const validationError = getUsernameValidationError(normalizedUsername);

      if (validationError) {
        setUsernameMessage(validationError);
        setSubmitting(false);
        return;
      }
    }

    setUsernameMessage("");
    const result =
      mode === "signin"
        ? await signIn(normalizedEmail, password, captchaToken ?? undefined)
        : await signUp(normalizedEmail, password, normalizedUsername, captchaToken ?? undefined);
    if (mode === "signup" && /username/i.test(result.message)) {
      setUsernameMessage(result.message);
    }
    setMessage(result.message);
    setConfirmationPending(mode === "signup" && result.ok);
    setSubmitting(false);
    setCaptchaToken(null);
    setCaptchaResetKey((current) => current + 1);

    if (result.ok && mode === "signin") {
      await refreshServerState(username || undefined);
      router.replace("/");
    }
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("Enter your email address first.");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      setMessage("Complete the security check before requesting a reset email.");
      return;
    }

    const { error } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/account/reset-password`,
      captchaToken: captchaToken ?? undefined
    });

    setMessage(
      error
        ? formatAuthErrorMessage(error.message)
        : "If an RMI account uses this email, a password reset link has been sent."
    );
    setCaptchaToken(null);
    setCaptchaResetKey((current) => current + 1);
  }

  async function resendConfirmation() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("Enter your email address first.");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      setMessage("Complete the security check before resending the confirmation email.");
      return;
    }

    const { error } = await getBrowserSupabaseClient().auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/account/confirmed`,
        captchaToken: captchaToken ?? undefined
      }
    });

    setMessage(
      error
        ? formatAuthErrorMessage(error.message)
        : "If this address has an unconfirmed RMI account, a new confirmation link has been sent."
    );
    setCaptchaToken(null);
    setCaptchaResetKey((current) => current + 1);
  }

  async function continueWithGoogle() {
    setSubmitting(true);
    const result = await signInWithGoogle();
    setMessage(result.message);

    if (!result.ok) {
      setSubmitting(false);
    }
  }

  async function saveProfile(nextFavoriteArtistIds = favoriteArtistIds) {
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
        profileBio: bio,
        favoriteArtistIds: nextFavoriteArtistIds
      })
    });
    const payload = (await response.json()) as ProfileDetailsResponse;
    setMessage(payload.ok ? "Profile saved." : payload.error ?? "Could not save profile.");
    await refreshServerState();
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file || !session) {
      return;
    }

    const allowedTypes: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    };
    const extension = allowedTypes[file.type];

    if (!extension || file.size > 3 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG, WebP, or GIF image under 3 MB.");
      return;
    }

    const formData = new FormData();
    formData.set("avatar", file, `avatar.${extension}`);
    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`
      },
      body: formData
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      setMessage(payload.error ?? "Could not upload profile picture.");
      return;
    }

    setMessage("Profile picture updated.");
    await refreshServerState();
  }

  if (configured && authLoading) {
    return (
      <div className="rmi-auth-surface mx-auto max-w-xl space-y-4 p-6" role="status" aria-label="Loading account">
        <div className="rmi-skeleton h-4 w-28 rounded-sm" />
        <div className="rmi-skeleton h-9 w-56 rounded-sm" />
        <div className="rmi-skeleton h-11 w-full rounded-md" />
        <div className="rmi-skeleton h-11 w-full rounded-md" />
        <div className="rmi-skeleton h-11 w-full rounded-md" />
      </div>
    );
  }

  if (!configured || !session) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <header className="text-center">
          <div className="rmi-kicker justify-center">RMI Account</div>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            {mode === "signup" ? "Create your RMI account." : "Welcome back."}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-paper/60">
            {mode === "signup"
              ? "Create a verified profile, build a watchlist, and start with fantasy cash."
              : "Access your portfolio, watchlist, and personalized market desk."}
          </p>
        </header>

        {mode === "signup" ? (
          <div className="rounded-[var(--radius-panel)] border border-brass/35 bg-brass/10 px-4 py-3 text-sm leading-6 text-paper/75">
            <p className="font-bold text-paper">Testing RMI? Continue with Google.</p>
            <p>
              Email confirmation delivery is limited during the testing period. Google sign-in is the reliable way to join right now.
            </p>
          </div>
        ) : null}

        <form onSubmit={submitAuth} className="rmi-auth-surface grid gap-3 p-5 sm:p-7">
          <div className="mb-2 border-b border-line/70 pb-4">
            <p className="rmi-data-label">Account</p>
            <p className="mt-1 text-sm font-semibold">{mode === "signup" ? "Create account" : "Sign in"}</p>
          </div>
          {mode === "signup" ? (
            <>
              <input
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setUsernameMessage("");
                }}
                className="rmi-terminal-input h-11 px-3 text-sm font-bold"
                placeholder="Username"
                autoComplete="username"
                pattern="[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*"
                title={USERNAME_REQUIREMENTS}
                minLength={2}
                maxLength={32}
                required
              />
              {usernameMessage ? (
                <p className="-mt-1 text-xs font-semibold text-ember" aria-live="polite">{usernameMessage}</p>
              ) : null}
            </>
          ) : null}
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            className="rmi-terminal-input h-11 px-3 text-sm font-bold"
            placeholder="Email"
            autoComplete="email"
            required
          />
          {emailDomainWarning ? (
            <p className="-mt-1 text-xs font-bold text-brass">{emailDomainWarning}</p>
          ) : null}
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              className="rmi-terminal-input h-11 w-full px-3 pr-11 text-sm font-bold"
              placeholder="Password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-paper/45 hover:bg-panel hover:text-paper"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onTokenChange={setCaptchaToken}
            resetKey={captchaResetKey}
            action={mode === "signup" ? "rmi_signup" : "rmi_login"}
          />
          <button type="submit" disabled={submitting} className="rmi-button-primary h-11 text-sm disabled:opacity-60">
            {mode === "signup" ? "Sign up" : "Log in"}
          </button>
          <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-paper/35" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <button
            type="button"
            onClick={continueWithGoogle}
            disabled={submitting}
            className="rmi-button-secondary h-11 text-sm disabled:opacity-60"
          >
            Continue with Google
          </button>
          {mode === "signin" ? (
            <button type="button" onClick={sendPasswordReset} className="text-sm text-paper/60 hover:text-cyan">
              Forgot your password?
            </button>
          ) : null}
          {confirmationPending ? (
            <button type="button" onClick={resendConfirmation} className="text-sm text-paper/60 hover:text-cyan">
              Resend confirmation email
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push(mode === "signup" ? "/account?mode=signin" : "/account?mode=signup")}
            className="text-sm font-semibold text-cyan"
          >
            {mode === "signup" ? "Already have an account?" : "Create account"}
          </button>
          {message ? <p className="rounded-md border border-cyan/25 bg-cyan/5 px-3 py-2 text-sm font-semibold text-paper/75">{message}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rmi-page-head flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="rmi-kicker">Identity Console</div>
          <h1 className="mt-2 text-3xl font-bold">Trader Profile</h1>
          <p className="mt-1 text-sm text-paper/60">Manage the identity and artist signals shown on your public profile.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.userId ? <RmiButton href={`/users/${state.userId}`} variant="secondary">View Public Profile</RmiButton> : null}
          <RmiButton href="/settings" variant="secondary">Settings</RmiButton>
        </div>
      </header>

      <section className="rmi-card overflow-hidden p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-[142px_minmax(0,1fr)]">
          <div>
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative">
              <UserAvatar avatarUrl={avatarUrl} label={displayName} size="xl" />
              <span className="absolute inset-0 hidden place-items-center rounded-full bg-black/60 text-white group-hover:grid">
                <Camera className="h-5 w-5" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 flex items-center gap-2 text-sm font-semibold text-cyan">
              <ImagePlus className="h-4 w-4" />
              Add Image
            </button>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-3xl font-bold">{displayName}</h2>
              {isAdminUser ? <AdminBadge /> : null}
            </div>
            <p className="mt-1 truncate text-sm font-bold text-paper/55">{user?.email}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <ProfileStat icon={<CalendarDays className="h-4 w-4" />} label="Member since" value={formatDate(user?.created_at)} />
              <ProfileStat icon={<WalletCards className="h-4 w-4" />} label="Net worth" value={formatCurrency(portfolioValue)} />
              <ProfileStat icon={<Star className="h-4 w-4" />} label="Securities held" value={String(holdings.length)} />
              <ProfileStat icon={<WalletCards className="h-4 w-4" />} label="Cash" value={formatCurrency(state.cashBalance)} />
            </div>

            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="rmi-terminal-input mt-6 min-h-24 w-full p-3 text-sm font-semibold placeholder:text-paper/35"
              placeholder="A little about me..."
            />
            <button type="button" onClick={() => saveProfile()} className="rmi-button-primary mt-3 h-10 px-4 text-sm">
              Save profile
            </button>
            {message ? <p className="mt-3 text-sm font-bold text-paper/65">{message}</p> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Favorite Artists</h2>
              <p className="text-xs text-paper/50">Choose up to 12 artists for your public profile.</p>
            </div>
            <span className="text-xs font-bold text-paper/45">{favoriteArtistIds.length}/12</span>
          </div>
          <div className="rmi-card overflow-visible border-t-2 border-t-cyan/70">
            {favoriteArtists.length ? (
              favoriteArtists.map((artist) => (
                <div key={artist.id} className="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-panelSoft">
                  <Link href={`/artists/${artist.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <ArtistAvatar artist={artist} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{artist.name}</span>
                      <span className="text-xs font-bold text-paper/45">${artist.ticker}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setFavoriteArtistIds((current) => current.filter((artistId) => artistId !== artist.id))}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-paper/45 hover:bg-panel hover:text-ember"
                    title={`Remove ${artist.name}`}
                    aria-label={`Remove ${artist.name} from favorite artists`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm font-bold text-paper/60">No favorite artists yet.</p>
            )}

            <div className="relative border-t border-line p-3">
              <Search className="pointer-events-none absolute left-6 top-6 h-4 w-4 text-paper/35" aria-hidden="true" />
              <input
                value={favoriteQuery}
                onChange={(event) => setFavoriteQuery(event.target.value)}
                className="rmi-terminal-input h-10 w-full pl-9 pr-3 text-sm placeholder:text-paper/35"
                placeholder="Find an artist to add"
                disabled={favoriteArtistIds.length >= 12}
              />
              {favoriteQuery.trim() && favoriteArtistIds.length < 12 ? (
                <div className="rmi-popover absolute left-3 right-3 top-14 z-20 max-h-64 overflow-y-auto rounded-md p-1">
                  {favoriteSuggestions.length ? (
                    favoriteSuggestions.map((artist) => (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => {
                          setFavoriteArtistIds((current) => [...current, artist.id].slice(0, 12));
                          setFavoriteQuery("");
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-panelSoft"
                      >
                        <ArtistAvatar artist={artist} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{artist.name}</span>
                          <span className="text-xs text-paper/45">${artist.ticker}</span>
                        </span>
                        <Plus className="h-4 w-4 text-cyan" aria-hidden="true" />
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-4 text-center text-sm text-paper/50">No matching artists.</p>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => saveProfile(favoriteArtistIds)}
                className="rmi-button-primary mt-3 h-10 w-full px-4 text-sm"
              >
                Save Favorite Artists
              </button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Account Controls</h2>
          <div className="rmi-card border-t-2 border-t-cyan/70 p-4">
            <p className="mb-4 text-sm text-paper/55">Security, privacy, and account preferences live in the settings console.</p>
            <div className="flex flex-wrap items-center gap-3">
              <RmiButton href="/settings" variant="secondary">Open Settings</RmiButton>
              <button
                type="button"
                onClick={signOut}
                className="rmi-button-secondary inline-flex min-h-10 items-center gap-2 rounded-md border border-ember/40 px-4 text-sm font-semibold text-ember hover:bg-ember/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rmi-soft-card flex min-h-14 items-center gap-3 px-3 text-sm">
      <span className="text-cyan">{icon}</span>
      <span className="text-paper/55">{label}:</span>
      <span className="ml-auto font-semibold">{value}</span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
