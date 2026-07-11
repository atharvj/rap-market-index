"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { formatCurrency } from "@/lib/formatters";
import { Check, Search, Trophy, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const genres = [
  "Mainstream",
  "Underground",
  "Trap",
  "Drill",
  "Melodic",
  "Alternative",
  "Experimental",
  "Conscious",
  "Southern"
];

type BootstrapResponse = {
  ok: boolean;
  error?: string;
  profile?: {
    favoriteArtistIds?: string[];
    favoriteGenres?: string[];
    onboardingCompleted?: boolean;
  };
};

export default function OnboardingPage() {
  const router = useRouter();
  const { configured, session } = useAuth();
  const { state, toggleWatchlist, isWatchlisted, refreshServerState } = useGame();
  const [step, setStep] = useState(0);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const artists = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return [...state.artists]
      .filter(
        (artist) =>
          !normalized ||
          artist.name.toLowerCase().includes(normalized) ||
          artist.ticker.toLowerCase().includes(normalized)
      )
      .sort((first, second) => second.hypeScore - first.hypeScore)
      .slice(0, normalized ? 18 : 12);
  }, [query, state.artists]);

  useEffect(() => {
    if (!session) {
      setLoading(false);
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
      .then((response) => response.json() as Promise<BootstrapResponse>)
      .then((payload) => {
        if (!payload.ok || !payload.profile) {
          throw new Error(payload.error ?? "Could not load onboarding.");
        }

        if (payload.profile.onboardingCompleted) {
          router.replace("/");
          return;
        }

        setSelectedGenres(payload.profile.favoriteGenres ?? []);
        setSelectedArtists((payload.profile.favoriteArtistIds ?? []).slice(0, 5));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load onboarding."))
      .finally(() => setLoading(false));
  }, [router, session]);

  if (!configured || !session) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-3xl font-black">Create your market profile</h1>
        <p className="text-sm leading-6 text-paper/60">Log in with a confirmed email address to finish setting up RMI.</p>
        <RmiButton href="/account?mode=signin">Log In</RmiButton>
      </div>
    );
  }

  if (loading) {
    return <div className="mx-auto h-96 max-w-2xl rounded-xl bg-panelSoft motion-safe:animate-pulse" />;
  }

  function toggleGenre(genre: string) {
    const normalized = genre.toLowerCase();
    setSelectedGenres((current) =>
      current.includes(normalized)
        ? current.filter((candidate) => candidate !== normalized)
        : [...current, normalized].slice(0, 8)
    );
  }

  function toggleArtist(artistId: string) {
    setSelectedArtists((current) =>
      current.includes(artistId)
        ? current.filter((id) => id !== artistId)
        : current.length < 5
          ? [...current, artistId]
          : current
    );
  }

  async function finishOnboarding() {
    if (!session || saving) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      for (const artistId of selectedArtists) {
        if (!isWatchlisted(artistId)) {
          const result = await toggleWatchlist(artistId);

          if (!result.ok) {
            throw new Error(result.message);
          }
        }
      }

      const response = await fetch("/api/profile/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          favoriteGenres: selectedGenres,
          favoriteArtistIds: selectedArtists,
          onboardingCompleted: true
        })
      });
      const payload = await response.json() as BootstrapResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not finish onboarding.");
      }

      await refreshServerState();
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not finish onboarding.");
      setSaving(false);
    }
  }

  const canContinue = step === 0 ? selectedGenres.length > 0 : step === 1 ? selectedArtists.length >= 3 : true;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center font-black text-cyan">RMI</div>
      <div className="grid grid-cols-4 gap-2" aria-label={`Step ${step + 1} of 4`}>
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className={index <= step ? "h-1 rounded bg-cyan" : "h-1 rounded bg-panelSoft"} />
        ))}
      </div>

      {step === 0 ? (
        <OnboardingStep eyebrow="Step 1 of 4" title="Choose your rap lanes" description="RMI uses these to shape discovery and your first market view.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {genres.map((genre) => {
              const active = selectedGenres.includes(genre.toLowerCase());

              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={active ? "rmi-card flex min-h-14 items-center justify-between border-cyan p-4 text-left" : "rmi-card flex min-h-14 items-center justify-between p-4 text-left"}
                >
                  <span className="text-sm font-bold">{genre}</span>
                  {active ? <Check className="h-4 w-4 text-cyan" /> : null}
                </button>
              );
            })}
          </div>
        </OnboardingStep>
      ) : null}

      {step === 1 ? (
        <OnboardingStep eyebrow="Step 2 of 4" title="Pick artists to follow" description="Choose 3 to 5. They will appear in your watchlist and on your public profile.">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-paper/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-panelSoft pl-9 pr-3 text-sm outline-none focus:border-cyan"
              placeholder="Search artists"
            />
          </div>
          <section className="grid max-h-[420px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 scrollbar-thin">
            {artists.map((artist) => {
              const active = selectedArtists.includes(artist.id);

              return (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => toggleArtist(artist.id)}
                  className={active ? "rmi-card flex items-center justify-between gap-3 border-cyan p-4 text-left" : "rmi-card flex items-center justify-between gap-3 p-4 text-left"}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ArtistAvatar artist={artist} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{artist.name}</span>
                      <span className="text-xs text-paper/45">${artist.ticker}</span>
                    </span>
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-cyan" /> : null}
                </button>
              );
            })}
          </section>
          <p className="mt-3 text-center text-sm text-paper/55">{selectedArtists.length} of 5 selected</p>
        </OnboardingStep>
      ) : null}

      {step === 2 ? (
        <OnboardingStep eyebrow="Step 3 of 4" title="Your opening balance" description="Every trader starts on equal footing. Starter cash cannot be purchased or withdrawn.">
          <div className="rmi-card grid place-items-center gap-3 p-10 text-center">
            <WalletCards className="h-8 w-8 text-mint" />
            <p className="text-4xl font-black number-tabular">{formatCurrency(100_000)}</p>
            <p className="max-w-md text-sm leading-6 text-paper/60">Use fantasy cash to build positions. The global ranking compares portfolio performance from the same starting balance.</p>
          </div>
        </OnboardingStep>
      ) : null}

      {step === 3 ? (
        <OnboardingStep eyebrow="Step 4 of 4" title="Start in global rankings" description="Private leagues are coming later. Your portfolio can compete globally from day one.">
          <div className="rmi-card grid place-items-center gap-3 p-10 text-center">
            <Trophy className="h-8 w-8 text-brass" />
            <p className="text-xl font-black">Global market access</p>
            <p className="max-w-md text-sm leading-6 text-paper/60">Follow quotes, trade artists, and compare your fantasy return with the full RMI community.</p>
          </div>
        </OnboardingStep>
      ) : null}

      {message ? <p className="text-center text-sm font-bold text-ember">{message}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || saving}
          className="min-h-10 rounded-lg border border-line text-sm font-bold disabled:opacity-35"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => step === 3 ? void finishOnboarding() : setStep((current) => Math.min(3, current + 1))}
          disabled={!canContinue || saving}
          className="min-h-10 rounded-lg bg-paper text-sm font-bold text-ink disabled:opacity-40"
        >
          {step === 3 ? saving ? "Finishing..." : "Enter RMI" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function OnboardingStep({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-paper/45">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-black">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-paper/65">{description}</p>
      </header>
      {children}
    </div>
  );
}
