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
    <Suspense fallback={<div className="mx-auto h-80 max-w-md rounded-lg bg-panelSoft motion-safe:animate-pulse" />}>
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
    const result =
      mode === "signin"
        ? await signIn(normalizedEmail, password, captchaToken ?? undefined)
        : await signUp(normalizedEmail, password, username || normalizedEmail, captchaToken ?? undefined);
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
        emailRedirectTo: `${window.location.origin}/account?confirmed=1`,
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
    return <div className="mx-auto h-80 max-w-md rounded-lg bg-panelSoft motion-safe:animate-pulse" />;
  }

  if (!configured || !session) {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center">
          <h1 className="text-3xl font-black">{mode === "signup" ? "Create your RMI account" : "Log in to RMI"}</h1>
          <p className="mt-2 text-sm font-bold text-paper/70">Trade with fantasy cash. No real money.</p>
        </header>

        <form onSubmit={submitAuth} className="rmi-card grid gap-3 p-5">
          {mode === "signup" ? (
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11 rounded-lg border border-line bg-panelSoft px-3 text-sm font-bold outline-none focus:border-cyan"
              placeholder="Username"
              autoComplete="username"
              pattern="[A-Za-z0-9_.-]{2,32}"
              title="Use 2-32 letters, numbers, periods, hyphens, or underscores."
              minLength={2}
              maxLength={32}
              required
            />
          ) : null}
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            className="h-11 rounded-lg border border-line bg-panelSoft px-3 text-sm font-bold outline-none focus:border-cyan"
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
              className="h-11 w-full rounded-lg border border-line bg-panelSoft px-3 pr-11 text-sm font-bold outline-none focus:border-cyan"
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
          <button type="submit" disabled={submitting} className="h-11 rounded-lg bg-paper text-sm font-black text-ink disabled:opacity-60">
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
            className="h-11 rounded-lg border border-line bg-panelSoft text-sm font-black transition hover:border-cyan disabled:opacity-60"
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
            className="text-sm font-black text-cyan"
          >
            {mode === "signup" ? "Already have an account?" : "Create account"}
          </button>
          {message ? <p className="text-sm font-bold text-paper/65">{message}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Player Profile</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">Manage your public RMI identity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.userId ? <RmiButton href={`/users/${state.userId}`} variant="secondary">View Public Profile</RmiButton> : null}
          <RmiButton href="/settings" variant="secondary">Settings</RmiButton>
        </div>
      </header>

      <section className="rmi-card p-5">
        <div className="grid gap-5 sm:grid-cols-[142px_minmax(0,1fr)]">
          <div>
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative">
              <UserAvatar avatarUrl={avatarUrl} label={displayName} size="xl" />
              <span className="absolute inset-0 hidden place-items-center rounded-full bg-black/60 text-white group-hover:grid">
                <Camera className="h-5 w-5" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={uploadAvatar} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 flex items-center gap-2 text-sm font-black text-cyan">
              <ImagePlus className="h-4 w-4" />
              Add Image
            </button>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-3xl font-black">{displayName}</h2>
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
              className="mt-6 min-h-24 w-full rounded-lg border border-line bg-panelSoft p-3 text-sm font-bold outline-none placeholder:text-paper/35 focus:border-cyan"
              placeholder="A little about me..."
            />
            <button type="button" onClick={() => saveProfile()} className="mt-3 h-10 rounded-lg bg-paper px-4 text-sm font-black text-ink">
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
              <h2 className="text-lg font-black">Favorite Artists</h2>
              <p className="text-xs text-paper/50">Choose up to 12 artists for your public profile.</p>
            </div>
            <span className="text-xs font-bold text-paper/45">{favoriteArtistIds.length}/12</span>
          </div>
          <div className="rmi-card overflow-visible">
            {favoriteArtists.length ? (
              favoriteArtists.map((artist) => (
                <div key={artist.id} className="flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-panelSoft">
                  <Link href={`/artists/${artist.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <ArtistAvatar artist={artist} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{artist.name}</span>
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
                className="h-10 w-full rounded-lg border border-line bg-panelSoft pl-9 pr-3 text-sm outline-none placeholder:text-paper/35 focus:border-cyan"
                placeholder="Find an artist to add"
                disabled={favoriteArtistIds.length >= 12}
              />
              {favoriteQuery.trim() && favoriteArtistIds.length < 12 ? (
                <div className="absolute left-3 right-3 top-14 z-20 max-h-64 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-2xl">
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
                          <span className="block truncate text-sm font-black">{artist.name}</span>
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
                className="mt-3 h-10 w-full rounded-lg bg-paper px-4 text-sm font-black text-ink hover:bg-paper/90"
              >
                Save Favorite Artists
              </button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-black">Account</h2>
          <div className="rmi-card p-4">
            <button type="button" onClick={signOut} className="flex items-center gap-2 text-sm font-black text-ember">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-paper/45">{icon}</span>
      <span className="text-paper/55">{label}:</span>
      <span className="ml-auto font-black">{value}</span>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
