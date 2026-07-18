"use client";

import { AdminBadge } from "@/components/AdminBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import clsx from "clsx";
import { Activity, BarChart3, CalendarDays, CircleGauge, LockKeyhole, Radio, Star, Trophy, WalletCards } from "lucide-react";
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
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rmi-hero market-grid rmi-noise relative overflow-hidden p-5 shadow-market sm:p-7">
        <div className="relative z-10 grid gap-6 md:grid-cols-[130px_minmax(0,1fr)_230px] md:items-center">
          <div className="relative w-fit">
            <span className="absolute -inset-3 rounded-full border border-cyan/20" aria-hidden="true" />
            <UserAvatar avatarUrl={profile.avatarUrl} label={profile.username} size="lg" />
          </div>
          <div className="min-w-0">
            <p className="rmi-kicker"><Radio className="h-4 w-4" aria-hidden="true" /> Public Trader Node</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="mt-2 truncate text-3xl font-black sm:text-4xl">{profile.username}</h1>
              {profile.isAdmin ? <AdminBadge /> : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-paper/58">
              {profile.isPrivate ? "This trader keeps their profile private." : profile.bio || "This trader has not added a bio yet."}
            </p>
            {profile.gainPercent !== null ? (
              <p className={clsx("mt-3 text-sm font-black number-tabular", profile.gainPercent >= 0 ? "text-mint" : "text-ember")}>
                {formatPercent(profile.gainPercent)} All-Time
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <ProfileMetric icon={<CalendarDays className="h-4 w-4" />} label="Member Since" value={memberSince} />
            <ProfileMetric icon={<Trophy className="h-4 w-4" />} label="Rank" value="Global standings" />
            <ProfileMetric icon={<WalletCards className="h-4 w-4" />} label="Net Worth" value={portfolioVisible ? formatCurrency(profile.portfolioValue ?? 0) : "Private"} />
            <ProfileMetric icon={<WalletCards className="h-4 w-4" />} label="Cash" value={portfolioVisible ? formatCurrency(profile.cashBalance ?? 0) : "Private"} />
          </div>
        </div>
      </section>

      <section className="rmi-card market-grid shadow-market">
        <div className="rmi-section-header">
          <div>
            <p className="rmi-kicker text-cyan"><BarChart3 className="h-4 w-4" aria-hidden="true" /> Public Portfolio</p>
            <h2 className="mt-1 text-xl font-black">Open Positions</h2>
          </div>
          <span className="rmi-status-chip border-cyan/30 bg-cyan/10 text-cyan">
            {profile.portfolioIsPublic ? `${profile.holdings.length} Listed` : "Private"}
          </span>
        </div>
        <div className="divide-y divide-line">
          {!profile.portfolioIsPublic ? (
            <div className="grid min-h-36 place-items-center p-5 text-center">
              <div>
                <LockKeyhole className="mx-auto h-6 w-6 text-violet" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-paper/50">This trader keeps their portfolio private.</p>
              </div>
            </div>
          ) : profile.holdings.length ? (
            profile.holdings.map((holding) => (
              <Link
                key={holding.artistId}
                href={`/artists/${holding.artistId}`}
                className="rmi-table-row grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]"
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

      <section className="rmi-card market-grid shadow-market">
        <div className="rmi-section-header">
          <div>
            <p className="rmi-kicker text-violet"><Star className="h-4 w-4" aria-hidden="true" /> Identity Signals</p>
            <h2 className="mt-1 text-xl font-black">Favorite Artists</h2>
          </div>
          <CircleGauge className="h-5 w-5 text-violet" aria-hidden="true" />
        </div>
        <div className="grid divide-y divide-line sm:grid-cols-2 lg:grid-cols-3">
          {profile.favoriteArtists.length ? (
            profile.favoriteArtists.map((artist) => (
              <Link key={artist.id} href={`/artists/${artist.id}`} className="rmi-signal-card rmi-signal-violet m-2 flex items-center gap-3 p-4">
                <span className="flex items-center gap-3">
                  <ProfileArtistImage
                    name={artist.name}
                    ticker={artist.ticker}
                    accent={artist.accent}
                    imageUrl={artist.imageUrl}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{artist.name}</span>
                    <span className="text-xs font-bold text-paper/50">${artist.ticker}</span>
                  </span>
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
    <div className="rmi-soft-card grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 px-3 py-2">
      <span className="text-cyan">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-paper/35">{label}</span>
        <span className="block truncate text-xs font-black number-tabular">{value}</span>
      </span>
    </div>
  );
}

function StatusCard({ text }: { text: string }) {
  return (
    <section className="rmi-auth-surface market-grid mx-auto grid min-h-[360px] max-w-xl place-items-center p-6 text-center shadow-market">
      <div>
        <Activity className="mx-auto h-7 w-7 text-cyan motion-safe:animate-pulse" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold text-paper/55">{text}</p>
      </div>
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
