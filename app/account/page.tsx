"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency } from "@/lib/formatters";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import clsx from "clsx";
import {
  BarChart3,
  CalendarDays,
  Camera,
  Clock3,
  DollarSign,
  ImagePlus,
  LockKeyhole,
  LogOut,
  Mail,
  Save,
  Server,
  Trophy,
  UserCircle,
  UserPlus,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

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

export default function AccountPage() {
  const { configured, loading, session, user, signIn, signOut, signUp } = useAuth();
  const { state, portfolioValue, holdings, isAdminUser, avatarUrl: syncedAvatarUrl, refreshServerState } = useGame();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [favoriteArtistIds, setFavoriteArtistIds] = useState<string[]>([]);
  const [profileDetailsMessage, setProfileDetailsMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profileDetailsSubmitting, setProfileDetailsSubmitting] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const profileName = session && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Not signed in";
  const favoriteArtists = useMemo(
    () =>
      favoriteArtistIds
        .map((artistId) => state.artists.find((artist) => artist.id === artistId))
        .filter((artist): artist is (typeof state.artists)[number] => Boolean(artist)),
    [favoriteArtistIds, state.artists]
  );
  const availableFavoriteArtists = useMemo(
    () => state.artists.filter((artist) => !favoriteArtistIds.includes(artist.id)),
    [favoriteArtistIds, state.artists]
  );
  const memberSince = user?.created_at
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(user.created_at))
    : "-";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("mode") === "signup") {
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    if (!configured || !session) {
      setProfileBio("");
      setFavoriteArtistIds([]);
      setAvatarUrl("");
      return;
    }

    let active = true;

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
        if (!active || !payload.ok || !payload.profile) {
          return;
        }

        setProfileBio(payload.profile.bio ?? "");
        setAvatarUrl(payload.profile.avatarUrl ?? "");
        setFavoriteArtistIds(payload.profile.favoriteArtistIds ?? []);
      })
      .catch(() => {
        if (active) {
          setProfileDetailsMessage("Could not load profile details.");
        }
      });

    return () => {
      active = false;
    };
  }, [configured, session]);

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

  async function saveProfileDetails(overrides: { nextAvatarUrl?: string } = {}) {
    if (!session) {
      return;
    }

    setProfileDetailsSubmitting(true);
    setProfileDetailsMessage("");
    const nextAvatarUrl = overrides.nextAvatarUrl ?? avatarUrl;

    try {
      const response = await fetch("/api/profile/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          profileBio,
          avatarUrl: nextAvatarUrl,
          favoriteArtistIds
        })
      });
      const payload = (await response.json()) as ProfileDetailsResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not save profile details.");
      }

      setProfileBio(payload.profile?.bio ?? profileBio);
      setAvatarUrl(payload.profile?.avatarUrl ?? nextAvatarUrl);
      setFavoriteArtistIds(payload.profile?.favoriteArtistIds ?? favoriteArtistIds);
      setProfileDetailsMessage("Profile details saved.");
      await refreshServerState();
    } catch (error) {
      setProfileDetailsMessage(error instanceof Error ? error.message : "Could not save profile details.");
    } finally {
      setProfileDetailsSubmitting(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file || !session) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setProfileDetailsMessage("Choose an image file.");
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setProfileDetailsMessage("Profile images must be 3 MB or smaller.");
      return;
    }

    setAvatarUploading(true);
    setProfileDetailsMessage("");

    try {
      const supabase = getBrowserSupabaseClient();
      const extension = getAvatarFileExtension(file);
      const filePath = `${session.user.id}/${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("profile-avatars").upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

      if (error) {
        throw new Error(error.message);
      }

      const { data } = supabase.storage.from("profile-avatars").getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      setAvatarUrl(publicUrl);
      await saveProfileDetails({ nextAvatarUrl: publicUrl });
    } catch (error) {
      setProfileDetailsMessage(
        error instanceof Error
          ? `Could not upload profile picture: ${error.message}`
          : "Could not upload profile picture."
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  function addFavoriteArtist(artistId: string) {
    if (!artistId) {
      return;
    }

    setFavoriteArtistIds((current) => Array.from(new Set([...current, artistId])).slice(0, 12));
  }

  function removeFavoriteArtist(artistId: string) {
    setFavoriteArtistIds((current) => current.filter((currentArtistId) => currentArtistId !== artistId));
  }

  if (configured && !session) {
    return (
      <div className="mx-auto grid min-h-[620px] max-w-6xl items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="hidden min-w-0 lg:block">
          <p className="text-[11px] font-black uppercase tracking-wide text-brass">Rap Market Index</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-black leading-tight">
            Sign in to manage your portfolio, watchlist, and fantasy cash.
          </h1>
          <p className="mt-4 max-w-xl text-sm font-bold leading-6 text-paper/60">
            Accounts keep your trades, holdings, and leaderboard profile synced in the cloud.
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-panel p-6 shadow-market">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-wide text-brass">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </p>
            <h2 className="mt-2 text-3xl font-black">
              {mode === "signin" ? "Sign in to RMI" : "Join Rap Market Index"}
            </h2>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-full border border-line bg-panelSoft p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={clsx(
                "min-h-10 rounded-full px-3 text-sm font-black",
                mode === "signin" ? "bg-paper text-ink" : "text-paper/55"
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={clsx(
                "min-h-10 rounded-full px-3 text-sm font-black",
                mode === "signup" ? "bg-paper text-ink" : "text-paper/55"
              )}
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
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-mint px-4 font-black text-white disabled:cursor-wait disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {message ? <p className="mt-4 text-sm font-bold text-paper/60">{message}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-brass">Account</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Profile</h1>
      </div>

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
        <>
          <section className="rounded border border-line bg-panel p-5 shadow-market">
            <div className="grid gap-6 md:grid-cols-[170px_minmax(0,1fr)]">
              <div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={uploadAvatar}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={uploadAvatar}
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="group relative block rounded border border-transparent text-left focus:outline-none focus:ring-2 focus:ring-cyan"
                  aria-label="Change profile picture"
                >
                  <UserAvatar avatarUrl={avatarUrl || syncedAvatarUrl} label={profileName} size="lg" />
                  <span className="absolute inset-x-0 bottom-0 hidden bg-black/65 px-2 py-1 text-center text-[11px] font-black uppercase tracking-wide text-white group-hover:block">
                    Change
                  </span>
                </button>
                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="inline-flex min-h-8 items-center justify-center gap-2 rounded border border-line bg-panelSoft px-3 text-xs font-black hover:border-cyan disabled:cursor-wait disabled:opacity-60"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {avatarUploading ? "Uploading" : "Upload image"}
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="inline-flex min-h-8 items-center justify-center gap-2 rounded border border-line bg-panelSoft px-3 text-xs font-black hover:border-cyan disabled:cursor-wait disabled:opacity-60"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Take photo
                  </button>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="truncate text-3xl font-black">{profileName}</h2>
                  {isAdminUser ? <AdminBadge /> : null}
                </div>
                <p className="mt-1 truncate text-sm font-bold text-paper/50">{user?.email}</p>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <ProfileMetric icon={<CalendarDays className="h-4 w-4" />} label="Member since" value={memberSince} />
                  <ProfileMetric icon={<Trophy className="h-4 w-4" />} label="Rank" value="Unranked" />
                  <ProfileMetric icon={<WalletCards className="h-4 w-4" />} label="Net worth" value={formatCurrency(portfolioValue)} />
                  <ProfileMetric icon={<DollarSign className="h-4 w-4" />} label="Cash" value={formatCurrency(state.cashBalance)} />
                  <ProfileMetric icon={<BarChart3 className="h-4 w-4" />} label="Securities held" value={String(holdings.length)} />
                  <ProfileMetric icon={<Clock3 className="h-4 w-4" />} label="Last trade" value={state.transactions[0]?.createdAt ? "Recent" : "-"} />
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={signOut}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-ember/45 bg-ember/10 px-4 text-sm font-black text-ember"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                  <Link
                    href={`/users/${state.userId}`}
                    className="inline-flex min-h-9 items-center justify-center rounded border border-line bg-panelSoft px-4 text-sm font-black text-paper/70 hover:border-cyan hover:text-cyan"
                  >
                    View public profile
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-3">
            <ProfilePanel title="A little about me">
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-line bg-panelSoft px-3 text-xs font-black hover:border-cyan disabled:cursor-wait disabled:opacity-60"
                >
                  <ImagePlus className="h-4 w-4" />
                  Upload image
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-line bg-panelSoft px-3 text-xs font-black hover:border-cyan disabled:cursor-wait disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" />
                  Take photo
                </button>
              </div>
              <label className="block">
                <span className="sr-only">Profile bio</span>
                <textarea
                  value={profileBio}
                  onChange={(event) => setProfileBio(event.target.value.slice(0, 280))}
                  rows={5}
                  placeholder="Write a short bio for other traders."
                  className="w-full resize-none rounded border border-line bg-panelSoft px-3 py-2 text-sm font-bold leading-6 outline-none placeholder:text-paper/35 focus:border-cyan"
                />
              </label>
              <p className="mt-2 text-xs font-bold text-paper/40">{profileBio.length}/280</p>
            </ProfilePanel>
            <ProfilePanel title="Favorite artists">
              <select
                value=""
                onChange={(event) => addFavoriteArtist(event.target.value)}
                className="h-10 w-full rounded border border-line bg-panelSoft px-3 text-sm font-bold outline-none focus:border-cyan"
              >
                <option value="">Add favorite artist</option>
                {availableFavoriteArtists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name} ({artist.ticker})
                  </option>
                ))}
              </select>
              <div className="mt-3 flex flex-wrap gap-2">
                {favoriteArtists.length ? (
                  favoriteArtists.map((artist) => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => removeFavoriteArtist(artist.id)}
                      className="rounded-full border border-line bg-panelSoft px-3 py-1 text-xs font-black text-paper/70 hover:border-ember hover:text-ember"
                    >
                      {artist.ticker} x
                    </button>
                  ))
                ) : (
                  <p>No favorite artists selected yet.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => saveProfileDetails()}
                disabled={profileDetailsSubmitting}
                className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded bg-cyan px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {profileDetailsSubmitting ? "Saving" : "Save profile"}
              </button>
              {profileDetailsMessage ? <p className="mt-2 text-xs font-bold text-paper/55">{profileDetailsMessage}</p> : null}
            </ProfilePanel>
            <ProfilePanel title="Recent activity">
              <p>{state.transactions[0]?.createdAt ? "Recent trade activity recorded." : "No public activity yet."}</p>
            </ProfilePanel>
          </section>
        </>
      ) : null}
    </div>
  );
}

function ProfileMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_120px_minmax(0,1fr)] items-center gap-2">
      <span className="text-paper/35">{icon}</span>
      <span className="text-paper/45">{label}:</span>
      <span className="min-w-0 truncate font-black number-tabular">{value}</span>
    </div>
  );
}

function ProfilePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-line bg-panel p-4 shadow-market">
      <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
      <div className="mt-3 text-sm font-bold leading-6 text-paper/55">{children}</div>
    </section>
  );
}

function getAvatarFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (fromName === "jpg" || fromName === "jpeg" || fromName === "png" || fromName === "webp" || fromName === "gif") {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  if (file.type === "image/gif") {
    return "gif";
  }

  return "jpg";
}
