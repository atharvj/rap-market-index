"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ArtistPriceHistoryPanel } from "@/components/ArtistPriceHistoryPanel";
import { ChangePill } from "@/components/ChangePill";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { MiniSparkline } from "@/components/MiniSparkline";
import { ScoreInfo } from "@/components/ScoreInfo";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { sanitizeMoveExplanation } from "@/lib/artist-explanations";
import { formatCurrency, formatPercent, formatShares } from "@/lib/formatters";
import type { Artist } from "@/lib/types";
import { ArrowLeft, BarChart3, Newspaper, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const quoteNav = ["Summary", "News", "Chart", "Statistics", "Portfolio"];

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>();
  const { getArtist, getHolding, state } = useGame();
  const artist = getArtist(params.id);
  const relatedArtists = useMemo(
    () =>
      state.artists
        .filter((candidate) => candidate.id !== artist?.id)
        .sort((a, b) => Math.abs(b.dailyChangePercent) - Math.abs(a.dailyChangePercent))
        .slice(0, 6),
    [artist?.id, state.artists]
  );

  if (!artist) {
    return (
      <section className="rounded border border-line bg-panel p-6 shadow-market">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-cyan hover:text-cyan/75">
          <ArrowLeft className="h-4 w-4" />
          Market
        </Link>
        <h1 className="mt-6 text-3xl font-black">Artist not found</h1>
      </section>
    );
  }

  const holding = getHolding(artist.id);
  const dayChange = artist.currentPrice - artist.previousClose;
  const recentPrices = artist.priceHistory.slice(-30).map((point) => point.price);
  const periodLow = Math.min(...recentPrices, artist.currentPrice);
  const periodHigh = Math.max(...recentPrices, artist.currentPrice);
  const moveExplanation = sanitizeMoveExplanation(artist.ticker, artist.lastMoveExplanation);

  return (
    <div className="grid gap-5 xl:grid-cols-[136px_minmax(0,1fr)_340px]">
      <aside className="hidden xl:block">
        <nav className="sticky top-40 space-y-1 text-sm font-black text-paper/70" aria-label="Quote sections">
          {quoteNav.map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`} className="block rounded px-2 py-2 hover:bg-panel hover:text-cyan">
              {item}
            </a>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 space-y-5">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-cyan hover:text-cyan/75">
          <ArrowLeft className="h-4 w-4" />
          Market
        </Link>

        <section id="summary" className="rounded border border-line bg-panel shadow-market">
          <div className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <ArtistAvatar artist={artist} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-3xl font-black leading-tight sm:text-4xl">
                      {artist.name} <span className="text-paper/50">({artist.ticker})</span>
                    </h1>
                    <WatchlistButton artistId={artist.id} label />
                  </div>
                  <p className="mt-2 text-sm font-bold text-paper/50">Rap Market Index quote · Virtual market</p>
                </div>
              </div>

              <div className="text-left lg:text-right">
                <p className="text-xs font-black uppercase tracking-wide text-paper/50">Last price</p>
                <div className="mt-1 flex flex-wrap items-end gap-3 lg:justify-end">
                  <p className="text-4xl font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
                  <ChangePill value={artist.dailyChangePercent} />
                </div>
                <p className={artist.dailyChangePercent >= 0 ? "mt-1 text-sm font-black text-mint" : "mt-1 text-sm font-black text-ember"}>
                  {dayChange >= 0 ? "+" : ""}
                  {formatCurrency(dayChange)} today
                </p>
              </div>
            </div>
          </div>
        </section>

        <div id="chart">
          <ArtistPriceHistoryPanel artistId={artist.id} fallbackData={artist.priceHistory} />
        </div>

        <section className="rounded border border-line bg-panel shadow-market">
          <div className="grid border-t border-line md:grid-cols-4">
            <QuoteStat label="Previous Close" value={formatCurrency(artist.previousClose)} />
            <QuoteStat label="30-Day Range" value={`${formatCurrency(periodLow)} - ${formatCurrency(periodHigh)}`} />
            <QuoteStat label="Volatility" value={`${artist.volatility.toFixed(2)}x`} />
            <QuoteStat label="Market Score" value={`${artist.hypeScore}/100`} showScoreInfo />
          </div>
        </section>

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title={`What's happening with ${artist.ticker}`} icon={<BarChart3 className="h-4 w-4" />} />
          <div className="p-5">
            <p className="text-base font-black leading-snug">{moveExplanation}</p>
          </div>
        </section>

        <section id="news" className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Recent News and Events" icon={<Newspaper className="h-4 w-4" />} />
          <div className="px-4">
            <MarketNewsFeed artistId={artist.id} limit={10} compact />
          </div>
        </section>

        <section id="statistics" className="grid gap-5 lg:grid-cols-2">
          <div className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Market Statistics" />
            <div className="divide-y divide-line">
              <DetailRow label="Current Price" value={formatCurrency(artist.currentPrice)} />
              <DetailRow label="Daily Change" value={formatPercent(artist.dailyChangePercent)} valueTone={artist.dailyChangePercent >= 0 ? "good" : "bad"} />
              <DetailRow label="Previous Close" value={formatCurrency(artist.previousClose)} />
              <DetailRow label="30-Day High" value={formatCurrency(periodHigh)} valueTone="good" />
              <DetailRow label="30-Day Low" value={formatCurrency(periodLow)} valueTone="bad" />
            </div>
          </div>

          <div id="portfolio" className="rounded border border-line bg-panel shadow-market">
            <SectionHeader title="Your Position" icon={<Star className="h-4 w-4" />} />
            <div className="divide-y divide-line">
              <DetailRow label="Shares Owned" value={holding ? formatShares(holding.shares) : "0"} />
              <DetailRow label="Market Value" value={holding ? formatCurrency(holding.currentValue) : "$0.00"} />
              <DetailRow label="Average Buy" value={holding ? formatCurrency(holding.averageBuyPrice) : "-"} />
              <DetailRow
                label="Unrealized P/L"
                value={holding ? formatCurrency(holding.profitLoss) : "$0.00"}
                valueTone={holding ? (holding.profitLoss >= 0 ? "good" : "bad") : "neutral"}
              />
              <DetailRow
                label="P/L Percent"
                value={holding ? formatPercent(holding.profitLossPercent) : "0.00%"}
                valueTone={holding ? (holding.profitLossPercent >= 0 ? "good" : "bad") : "neutral"}
              />
            </div>
          </div>
        </section>
      </main>

      <aside className="space-y-5 xl:sticky xl:top-40 xl:self-start">
        <TradeTicket artist={artist} />

        <section className="rounded border border-line bg-panel shadow-market">
          <SectionHeader title="Trending" />
          <div className="divide-y divide-line">
            {relatedArtists.map((candidate) => (
              <RelatedArtist key={candidate.id} artist={candidate} />
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-line bg-panelSoft px-4">
      <span className="h-5 w-1 rounded bg-brass" />
      {icon ? <span className="text-brass">{icon}</span> : null}
      <h2 className="text-sm font-black uppercase tracking-wide">{title}</h2>
    </div>
  );
}

function QuoteStat({ label, value, showScoreInfo = false }: { label: string; value: string; showScoreInfo?: boolean }) {
  return (
    <div className="border-b border-line px-4 py-3 md:border-b-0 md:border-r md:last:border-r-0">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-paper/40">
        {label}
        {showScoreInfo ? <ScoreInfo /> : null}
      </p>
      <p className="mt-1 text-sm font-black number-tabular">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueTone = "neutral"
}: {
  label: string;
  value: string;
  valueTone?: "neutral" | "good" | "bad";
}) {
  const toneClass = {
    neutral: "text-paper",
    good: "text-mint",
    bad: "text-ember"
  }[valueTone];

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="font-bold text-paper/60">{label}</span>
      <span className={`text-right font-black number-tabular ${toneClass}`}>{value}</span>
    </div>
  );
}

function RelatedArtist({ artist }: { artist: Artist }) {
  return (
    <Link href={`/artists/${artist.id}`} className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3 px-4 py-3 hover:bg-panelSoft/70">
      <span className="flex min-w-0 items-center gap-3">
        <ArtistAvatar artist={artist} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{artist.name}</span>
          <span className="text-xs font-bold text-paper/50">{artist.ticker}</span>
        </span>
      </span>
      <span className="text-right">
        <span className={artist.dailyChangePercent >= 0 ? "block text-xs font-black text-mint" : "block text-xs font-black text-ember"}>
          {formatPercent(artist.dailyChangePercent)}
        </span>
        <MiniSparkline data={artist.priceHistory} positive={artist.dailyChangePercent >= 0} width={92} height={26} />
      </span>
    </Link>
  );
}
