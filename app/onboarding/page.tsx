"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { RmiButton } from "@/components/RmiPrimitives";
import { formatCurrency } from "@/lib/formatters";
import { MAX_FAVORITE_ARTISTS, MIN_FAVORITE_ARTISTS } from "@/lib/onboarding";
import { Check, Search, Trophy, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BootstrapResponse = {
  ok: boolean;
  error?: string;
  profile?: {
    favoriteArtistIds?: string[];
    onboardingCompleted?: boolean;
  };
};

export default function OnboardingPage() {
  const router = useRouter();
  const { configured, session } = useAuth();
  const { state, toggleWatchlist, isWatchlisted, refreshServerState } = useGame();
  const [step, setStep] = useState(0);
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
      .sort((first, second) => second.hypeScore - first.hypeScore);
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

        setMessage("");
        setSelectedArtists((payload.profile.favoriteArtistIds ?? []).slice(0, MAX_FAVORITE_ARTISTS));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load onboarding."))
      .finally(() => setLoading(false));
  }, [router, session]);

  if (!configured || !session) {
    return (
      <div className="rmi-auth-surface mx-auto max-w-xl space-y-4 p-6 text-center sm:p-8">
        <div className="rmi-kicker justify-center">Market Access</div>
        <h1 className="text-3xl font-bold">Create your market profile</h1>
        <p className="text-sm leading-6 text-paper/60">Log in with a confirmed email address to finish setting up RMI.</p>
        <RmiButton href="/account?mode=signin">Log In</RmiButton>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rmi-auth-surface mx-auto max-w-4xl space-y-6 p-6 sm:p-8" role="status" aria-live="polite">
        <span className="sr-only">Loading your RMI profile setup.</span>
        <div className="rmi-skeleton h-3 w-32 rounded" />
        <div className="rmi-skeleton h-1 w-full rounded" />
        <div className="space-y-3">
          <div className="rmi-skeleton h-8 w-2/3 rounded" />
          <div className="rmi-skeleton h-4 w-1/2 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="rmi-skeleton h-14 rounded-md" />)}
        </div>
      </div>
    );
  }

  function toggleArtist(artistId: string) {
    setMessage("");
    setSelectedArtists((current) =>
      current.includes(artistId)
        ? current.filter((id) => id !== artistId)
        : current.length < MAX_FAVORITE_ARTISTS
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

  const canContinue = step === 0 ? selectedArtists.length >= MIN_FAVORITE_ARTISTS : true;

  return (
    <div className="rmi-auth-surface mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
      <div className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-cyan">
        <span className="rmi-live-dot" /> RMI Profile Sequence
      </div>
      <div className="grid grid-cols-3 gap-2" aria-label={`Step ${step + 1} of 3`}>
        {Array.from({ length: 3 }).map((_, index) => (
          <span key={index} className={index <= step ? "h-1 rounded-full bg-cyan" : "h-1 rounded-full bg-panelSoft"} />
        ))}
      </div>

      {step === 0 ? (
        <OnboardingStep
          eyebrow="Step 1 of 3"
          title="Add artists to your watchlist"
          description={`Choose ${MIN_FAVORITE_ARTISTS} to ${MAX_FAVORITE_ARTISTS} to start. You can add or remove artists anytime after setup; these first picks also appear as favorites on your profile.`}
        >
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-paper/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rmi-terminal-input h-10 w-full pl-9 pr-3 text-sm"
              placeholder="Search artists"
            />
          </div>
          <div className="mb-3 flex items-center justify-between text-xs font-medium text-paper/50">
            <span>{artists.length} artists shown</span>
            <span className="number-tabular">{selectedArtists.length} of {MAX_FAVORITE_ARTISTS} selected</span>
          </div>
          <section className="grid max-h-[480px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 scrollbar-thin">
            {artists.map((artist) => {
              const active = selectedArtists.includes(artist.id);
              const unavailable = !active && selectedArtists.length >= MAX_FAVORITE_ARTISTS;

              return (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => toggleArtist(artist.id)}
                  disabled={unavailable}
                  aria-pressed={active}
                  className={active
                    ? "rmi-card flex items-center justify-between gap-3 !border-cyan/70 !bg-cyan/15 p-4 text-left ring-2 ring-cyan/55 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                    : unavailable
                      ? "rmi-card flex cursor-not-allowed items-center justify-between gap-3 p-4 text-left opacity-40"
                      : "rmi-card flex items-center justify-between gap-3 p-4 text-left transition-colors hover:!border-cyan/60 hover:!bg-panelSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
                  }
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ArtistAvatar artist={artist} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{artist.name}</span>
                      <span className="text-xs text-paper/45">${artist.ticker}</span>
                    </span>
                  </span>
                  {active ? (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan text-ink" aria-label="Selected">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </section>
        </OnboardingStep>
      ) : null}

      {step === 1 ? (
        <OnboardingStep eyebrow="Step 2 of 3" title="Your opening balance" description="Every trader starts on equal footing. Starter cash cannot be purchased or withdrawn.">
          <div className="rmi-soft-card grid place-items-center gap-3 border-t-2 border-t-mint p-8 text-center sm:p-10">
            <WalletCards className="h-8 w-8 text-mint" />
            <p className="text-4xl font-semibold number-tabular">{formatCurrency(100_000)}</p>
            <p className="max-w-md text-sm leading-6 text-paper/60">Use fantasy cash to build positions. The global ranking compares portfolio performance from the same starting balance.</p>
          </div>
        </OnboardingStep>
      ) : null}

      {step === 2 ? (
        <OnboardingStep eyebrow="Step 3 of 3" title="Start in global rankings" description="Private leagues are coming later. Your portfolio can compete globally from day one.">
          <div className="rmi-soft-card grid place-items-center gap-3 border-t-2 border-t-brass p-8 text-center sm:p-10">
            <Trophy className="h-8 w-8 text-brass" />
            <p className="text-xl font-semibold">Global market access</p>
            <p className="max-w-md text-sm leading-6 text-paper/60">Follow quotes, trade artists, and compare your fantasy return with the full RMI community.</p>
          </div>
        </OnboardingStep>
      ) : null}

      {message ? <p className="text-center text-sm font-medium text-ember" aria-live="polite">{message}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || saving}
          className="rmi-button-secondary min-h-10 text-sm disabled:opacity-35"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => step === 2 ? void finishOnboarding() : setStep((current) => Math.min(2, current + 1))}
          disabled={!canContinue || saving}
          className="rmi-button-primary min-h-10 text-sm disabled:opacity-40"
        >
          {step === 2 ? saving ? "Finishing..." : "Enter RMI" : "Continue"}
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
      <header className="border-b border-line/70 pb-4">
        <p className="rmi-data-label text-cyan">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-paper/65">{description}</p>
      </header>
      {children}
    </div>
  );
}
