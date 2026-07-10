"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { RmiButton } from "@/components/RmiPrimitives";
import { formatCurrency } from "@/lib/formatters";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { Camera, CalendarDays, ImagePlus, LogOut, Star, WalletCards } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
  const { configured, session, user, signIn, signOut, signUp } = useAuth();
  const { state, portfolioValue, holdings, isAdminUser, avatarUrl, refreshServerState } = useGame();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [favoriteArtistIds, setFavoriteArtistIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const displayName = session && state.username !== "Demo Guest" ? state.username : user?.email?.split("@")[0] ?? "Trader";
  const favoriteArtists = useMemo(
    () =>
      favoriteArtistIds
        .map((artistId) => state.artists.find((artist) => artist.id === artistId))
        .filter((artist): artist is (typeof state.artists)[number] => Boolean(artist)),
    [favoriteArtistIds, state.artists]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("mode") === "signup") {
      setMode("signup");
    }
  }, []);

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
    setSubmitting(true);
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password, username || email);
    setMessage(result.message);
    setSubmitting(false);

    if (result.ok) {
      await refreshServerState(username || undefined);
    }
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("Enter your email address first.");
      return;
    }

    const { error } = await getBrowserSupabaseClient().auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/account/reset-password`
    });

    setMessage(error ? error.message : "Password reset email sent.");
  }

  async function saveProfile(nextAvatarUrl?: string) {
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
        avatarUrl: nextAvatarUrl ?? avatarUrl,
        favoriteArtistIds
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

    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      setMessage("Choose an image under 3 MB.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${session.user.id}/${Date.now()}.${extension}`;
    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.storage.from("profile-avatars").upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(filePath);
    await saveProfile(data.publicUrl);
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
            />
          ) : null}
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            className="h-11 rounded-lg border border-line bg-panelSoft px-3 text-sm font-bold outline-none focus:border-cyan"
            placeholder="Email"
            required
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="h-11 rounded-lg border border-line bg-panelSoft px-3 text-sm font-bold outline-none focus:border-cyan"
            placeholder="Password"
            required
          />
          <button type="submit" disabled={submitting} className="h-11 rounded-lg bg-paper text-sm font-black text-ink disabled:opacity-60">
            {mode === "signup" ? "Sign up" : "Log in"}
          </button>
          {mode === "signin" ? (
            <button type="button" onClick={sendPasswordReset} className="text-sm text-paper/60 hover:text-cyan">
              Forgot your password?
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
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
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Player profile</h1>
          <p className="mt-1 text-sm font-bold text-paper/70">Manage your public RMI identity.</p>
        </div>
        <RmiButton href="/settings" variant="secondary">Settings</RmiButton>
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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 flex items-center gap-2 text-sm font-black text-cyan">
              <ImagePlus className="h-4 w-4" />
              add image
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
          <h2 className="mb-3 text-lg font-black">Favorite artists</h2>
          <div className="rmi-card overflow-hidden">
            {favoriteArtists.length ? (
              favoriteArtists.map((artist) => (
                <Link key={artist.id} href={`/artists/${artist.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panelSoft">
                  <ArtistAvatar artist={artist} size="sm" />
                  <span>
                    <span className="block text-sm font-black">{artist.name}</span>
                    <span className="text-xs font-bold text-paper/45">${artist.ticker}</span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="p-4 text-sm font-bold text-paper/60">No favorite artists yet.</p>
            )}
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
