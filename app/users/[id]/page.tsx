"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import { BarChart3, CalendarDays, Star, Trophy, WalletCards } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PublicFavoriteArtist = {
  id: string;
  name: string;
  ticker: string;
  currentPrice: number;
  dailyChangePercent: number;
  hypeScore: number;
  accent: string;
  imageUrl?: string | null;
};

type PublicProfile = {
  id: string;
  username: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  favoriteArtists: PublicFavoriteArtist[];
  holdings: PublicHolding[];
  isAdmin: boolean;
  isPrivate: boolean;
  portfolioIsPublic: boolean;
  portfolioValue: number | null;
  cashBalance: number | null;
  gainPercent: number | null;
};

type PublicHolding = {
  artistId: string;
  name: string;
  ticker: string;
  accent: string;
  imageUrl?: string | null;
  shares: number;
  currentPrice: number;
  dailyChangePercent: number;
  marketValue: number;
  profitLoss: number;
  profitLossPercent: number;
};

type PublicProfileResponse = {
  ok: boolean;
  error?: string;
  profile?: PublicProfile;
};

export default function PublicUserProfilePage() {
  const params = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetch(`/api/public/users/${params.id}`)
      .then((response) => response.json() as Promise<PublicProfileResponse>)
      .then((payload) => {
        if (!active) {
          return;
        }

        if (!payload.ok || !payload.profile) {
          throw new Error(payload.error ?? "Could not load profile.");
        }

        setProfile(payload.profile);
      })
      .catch((profileError) => {
        if (active) {
          setError(profileError instanceof Error ? profileError.message : "Could not load profile.");
          setProfile(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return <StatusCard text="Loading profile..." />;
  }

  if (error || !profile) {
    return <StatusCard text={error || "Profile not found."} />;
  }

  const memberSince = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(profile.createdAt));
  const portfolioVisible = profile.portfolioIsPublic && profile.portfolioValue !== null;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded border border-line bg-panel p-5 shadow-market">
        <div className="grid gap-5 md:grid-cols-[130px_minmax(0,1fr)]">
          <UserAvatar avatarUrl={profile.avatarUrl} label={profile.username} size="lg" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-3xl font-black">{profile.username}</h1>
              {profile.isAdmin ? <AdminBadge /> : null}
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <ProfileMetric icon={<CalendarDays className="h-4 w-4" />} label="Member since" value={memberSince} />
              <ProfileMetric icon={<Trophy className="h-4 w-4" />} label="Rank" value="Global standings" />
              <ProfileMetric icon={<WalletCards className="h-4 w-4" />} label="Net worth" value={portfolioVisible ? formatCurrency(profile.portfolioValue ?? 0) : "Private"} />
              <ProfileMetric icon={<WalletCards className="h-4 w-4" />} label="Cash" value={portfolioVisible ? formatCurrency(profile.cashBalance ?? 0) : "Private"} />
            </div>
            <p className="mt-5 max-w-3xl text-sm font-bold leading-6 text-paper/58">
              {profile.isPrivate ? "This trader keeps their profile private." : profile.bio || "This trader has not added a bio yet."}
            </p>
            {profile.gainPercent !== null ? (
              <p className={clsx("mt-3 text-sm font-black number-tabular", profile.gainPercent >= 0 ? "text-mint" : "text-ember")}>
                {formatPercent(profile.gainPercent)} all-time
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded border border-line bg-panel shadow-market">
        <div className="flex min-h-11 items-center gap-2 border-b border-line bg-panelSoft px-4">
          <span className="h-5 w-1 rounded bg-brass" />
          <BarChart3 className="h-4 w-4 text-brass" aria-hidden="true" />
          <h2 className="text-xs font-black uppercase tracking-wide">Public portfolio</h2>
        </div>
        <div className="divide-y divide-line">
          {!profile.portfolioIsPublic ? (
            <p className="p-4 text-sm font-bold text-paper/50">This trader keeps their portfolio private.</p>
          ) : profile.holdings.length ? (
            profile.holdings.map((holding) => (
              <Link
                key={holding.artistId}
                href={`/artists/${holding.artistId}`}
                className="grid gap-3 px-4 py-3 hover:bg-panelSoft/70 sm:grid-cols-[minmax(0,1fr)_120px_120px]"
              >
                <span className="flex items-center gap-3">
                  <ProfileArtistImage
                    name={holding.name}
                    ticker={holding.ticker}
                    accent={holding.accent}
                    imageUrl={holding.imageUrl}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{holding.name}</span>
                    <span className="text-xs font-bold text-paper/50">
                      {holding.ticker} · {holding.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })} shares
                    </span>
                  </span>
                </span>
                <span className="text-sm font-black number-tabular sm:text-right">
                  <span className="block">{formatCurrency(holding.marketValue)}</span>
                  <span className="text-xs text-paper/45">{formatCurrency(holding.currentPrice)}</span>
                </span>
                <span className="text-sm font-black number-tabular sm:text-right">
                  <span className={holding.profitLoss >= 0 ? "block text-mint" : "block text-ember"}>
                    {formatCurrency(holding.profitLoss)}
                  </span>
                  <span className={holding.profitLossPercent >= 0 ? "text-xs text-mint" : "text-xs text-ember"}>
                    {formatPercent(holding.profitLossPercent)}
                  </span>
                </span>
              </Link>
            ))
          ) : (
            <p className="p-4 text-sm font-bold text-paper/50">No public holdings yet.</p>
          )}
        </div>
      </section>

      <section className="rounded border border-line bg-panel shadow-market">
        <div className="flex min-h-11 items-center gap-2 border-b border-line bg-panelSoft px-4">
          <span className="h-5 w-1 rounded bg-brass" />
          <Star className="h-4 w-4 text-brass" aria-hidden="true" />
          <h2 className="text-xs font-black uppercase tracking-wide">Favorite artists</h2>
        </div>
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
          {profile.favoriteArtists.length ? (
            profile.favoriteArtists.map((artist) => (
              <Link key={artist.id} href={`/artists/${artist.id}`} className="grid gap-3 p-4 hover:bg-panelSoft/70">
                <span className="flex items-center gap-3">
                  <ProfileArtistImage
                    name={artist.name}
                    ticker={artist.ticker}
                    accent={artist.accent}
                    imageUrl={artist.imageUrl}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{artist.name}</span>
                    <span className="text-xs font-bold text-paper/50">
                      {artist.ticker} · {formatCurrency(artist.currentPrice)}
                    </span>
                  </span>
                </span>
                <span className="flex items-center justify-between text-xs font-black number-tabular">
                  <span className={artist.dailyChangePercent >= 0 ? "text-mint" : "text-ember"}>
                    {formatPercent(artist.dailyChangePercent)}
                  </span>
                  <span className="text-paper/45">{artist.hypeScore}/100 score</span>
                </span>
              </Link>
            ))
          ) : (
            <p className="p-4 text-sm font-bold text-paper/50">No favorite artists listed yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[18px_104px_minmax(0,1fr)] items-center gap-2">
      <span className="text-paper/35">{icon}</span>
      <span className="text-paper/45">{label}:</span>
      <span className="min-w-0 truncate font-black number-tabular">{value}</span>
    </div>
  );
}

function StatusCard({ text }: { text: string }) {
  return (
    <section className="mx-auto max-w-xl rounded border border-line bg-panel p-5 text-sm font-bold text-paper/55 shadow-market">
      {text}
    </section>
  );
}

function ProfileArtistImage({
  name,
  ticker,
  accent,
  imageUrl
}: {
  name: string;
  ticker: string;
  accent: string;
  imageUrl?: string | null;
}) {
  return (
    <span
      className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-gradient-to-br ${accent} text-sm font-black text-paper`}
      aria-label={name}
      role="img"
    >
      <span aria-hidden="true">{ticker.slice(0, 2)}</span>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}
