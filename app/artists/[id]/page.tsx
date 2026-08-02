"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ArtistAudienceSnapshot } from "@/components/ArtistAudienceSnapshot";
import { ArtistPriceHistoryPanel } from "@/components/ArtistPriceHistoryPanel";
import { useGame } from "@/components/GameProvider";
import { MarketSideRail } from "@/components/MarketSideRail";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { ArtistMiniCard, ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { ScoreInfo } from "@/components/ScoreInfo";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { getArtistSignalDrivers } from "@/lib/artist-signal-drivers";
import { formatCurrency, formatShares } from "@/lib/formatters";
import { getRelatedArtists } from "@/lib/related-artists";
import { estimateMarketMakerQuote } from "@/lib/trading";
import { Activity, BadgeCheck, Radio, Zap } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { getArtist, getHolding, state } = useGame();
  const artist = getArtist(params.id);
  const defaultTradeSide = searchParams.get("side") === "sell" ? "sell" : "buy";

  if (!artist) {
    return (
      <RmiSection>
        <div className="p-6">
          <h1 className="text-2xl font-bold">Artist not found</h1>
          <RmiButton href="/markets" variant="secondary">Back to markets</RmiButton>
        </div>
      </RmiSection>
    );
  }

  const activeArtist = artist;
  const holding = getHolding(activeArtist.id);
  const signalDrivers = getArtistSignalDrivers(activeArtist.stats);
  const recordedPrices = [...activeArtist.priceHistory.map((point) => point.price), activeArtist.currentPrice];
  const recordedHigh = Math.max(...recordedPrices);
  const recordedLow = Math.min(...recordedPrices);
  const priceChange = activeArtist.currentPrice - activeArtist.previousClose;
  const buyQuote = estimateMarketMakerQuote({
    side: "buy",
    midPrice: activeArtist.currentPrice,
    shares: 1,
    volatility: activeArtist.volatility
  });
  const sellQuote = estimateMarketMakerQuote({
    side: "sell",
    midPrice: activeArtist.currentPrice,
    shares: 1,
    volatility: activeArtist.volatility
  });
  const moveRank = [...state.artists]
    .sort((first, second) => second.dailyChangePercent - first.dailyChangePercent)
    .findIndex((candidate) => candidate.id === activeArtist.id) + 1;
  const signalRank = [...state.artists]
    .sort((first, second) => second.hypeScore - first.hypeScore)
    .findIndex((candidate) => candidate.id === activeArtist.id) + 1;
  const relatedArtists = getRelatedArtists(activeArtist, state.artists, 4);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 space-y-5">
        <section className="rmi-card relative p-5 sm:p-6">
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ArtistAvatar artist={artist} size="xl" />
            <div className="min-w-0">
              <div className="rmi-kicker mb-2"><Radio className="h-3.5 w-3.5" aria-hidden="true" /> Artist quote</div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-3xl font-bold sm:text-4xl">{artist.name}</h1>
                <BadgeCheck className="h-4 w-4 text-cyan" aria-hidden="true" />
                <WatchlistButton artistId={artist.id} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-medium text-paper/60">
                <span>${artist.ticker} · RMI Signal {artist.hypeScore}/100</span>
                <ScoreInfo />
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rmi-status-chip">{formatArtistCategory(artist.category)}</span>
                <span className="rmi-status-chip text-cyan"><Zap className="h-3 w-3" /> Signal rank #{signalRank}</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="rmi-data-label">Last recorded price</p>
            <p className="mt-1 text-4xl font-bold number-tabular sm:text-5xl">{formatCurrency(artist.currentPrice)}</p>
            <p className="mt-1 text-sm"><ChangeText value={artist.dailyChangePercent} suffix=" today" /></p>
          </div>
          </div>
        </section>

        <ArtistPriceHistoryPanel artistId={artist.id} fallbackData={artist.priceHistory} />

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuoteStat label="Previous Close" value={formatCurrency(activeArtist.previousClose)} />
          <QuoteStat
            label="Today's Change"
            value={`${priceChange >= 0 ? "+" : ""}${formatCurrency(priceChange)}`}
            tone={priceChange >= 0 ? "positive" : "negative"}
          />
          <QuoteStat label="Bid" value={formatCurrency(sellQuote.executionPrice)} />
          <QuoteStat label="Ask" value={formatCurrency(buyQuote.executionPrice)} />
          <QuoteStat label="Recorded Low" value={formatCurrency(recordedLow)} />
          <QuoteStat label="Recorded High" value={formatCurrency(recordedHigh)} />
          <QuoteStat label="24h Rank" value={`#${moveRank}`} />
          <QuoteStat label="Signal Rank" value={`#${signalRank}`} />
        </section>

        <ArtistAudienceSnapshot artistId={artist.id} />

        <RmiSection title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-mint" /> Signal Breakdown</span>}>
          <SignalBreakdown drivers={signalDrivers} />
        </RmiSection>

        {relatedArtists.length ? (
          <RmiSection title="Related Artists" subtitle="Similar market tier and current signal profile.">
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              {relatedArtists.map((relatedArtist) => (
                <ArtistMiniCard key={relatedArtist.id} artist={relatedArtist} />
              ))}
            </div>
          </RmiSection>
        ) : null}

        <RmiSection title="Market News">
          <div className="px-4">
            <MarketNewsFeed artistId={artist.id} limit={6} compact />
          </div>
        </RmiSection>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1 scrollbar-thin">
        <TradeTicket artist={activeArtist} defaultSide={defaultTradeSide} />
        {holding ? (
          <RmiSection title="Your Position">
            <div className="space-y-2 p-4 text-sm">
              <PositionRow label="Shares" value={formatShares(holding.shares)} />
              <PositionRow label="Value" value={formatCurrency(holding.currentValue)} />
              <PositionRow
                label="Average Fill"
                value={formatCurrency(holding.averageBuyPrice)}
                title="Your average execution price per share."
              />
            </div>
          </RmiSection>
        ) : null}
        <MarketSideRail currentArtistId={activeArtist.id} />
      </aside>
    </div>
  );
}

function formatArtistCategory(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function QuoteStat({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueClass = tone === "positive"
    ? "text-mint"
    : tone === "negative"
      ? "text-ember"
      : "text-paper/80";

  return (
    <div className="rmi-metric min-w-0 px-3 py-3">
      <p className="rmi-data-label">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold number-tabular ${valueClass}`}>{value}</p>
    </div>
  );
}

function SignalBreakdown({
  drivers
}: {
  drivers: ReturnType<typeof getArtistSignalDrivers>;
}) {
  const visibleDrivers = drivers.slice(0, 4);
  const largestMagnitude = Math.max(0.01, ...visibleDrivers.map((driver) => Math.abs(driver.contribution)));

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-paper/45">Impact on today&apos;s signal score.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibleDrivers.map((driver) => {
          const positive = driver.contribution > 0;
          const negative = driver.contribution < 0;
          const tone = positive ? "bg-mint" : negative ? "bg-ember" : "bg-paper/20";
          const textTone = positive ? "text-mint" : negative ? "text-ember" : "text-paper/45";

          return (
            <div key={driver.key} className="rmi-metric px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-paper/60">{driver.label}</span>
                <span className={`font-semibold number-tabular ${textTone}`}>
                  {driver.contribution > 0 ? "+" : ""}{driver.contribution.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper/10" aria-hidden="true">
                <span
                  className={`block h-full rounded-full ${tone}`}
                  style={{ width: `${Math.max(3, Math.abs(driver.contribution) / largestMagnitude * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PositionRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-medium text-paper/55" title={title}>{label}</span>
      <span className="font-semibold number-tabular">{value}</span>
    </div>
  );
}
