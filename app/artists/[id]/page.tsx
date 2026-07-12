"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ArtistAudienceSnapshot } from "@/components/ArtistAudienceSnapshot";
import { ArtistPriceHistoryPanel } from "@/components/ArtistPriceHistoryPanel";
import { useGame } from "@/components/GameProvider";
import { MarketSideRail } from "@/components/MarketSideRail";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { ScoreInfo } from "@/components/ScoreInfo";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { sanitizeMoveExplanation } from "@/lib/artist-explanations";
import { formatCurrency, formatShares } from "@/lib/formatters";
import { estimateMarketMakerQuote } from "@/lib/trading";
import { BadgeCheck, KeyRound } from "lucide-react";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>();
  const { getArtist, getHolding, state } = useGame();
  const artist = getArtist(params.id);

  if (!artist) {
    return (
      <RmiSection>
        <div className="p-6">
          <h1 className="text-2xl font-black">Artist not found</h1>
          <RmiButton href="/markets" variant="secondary">Back to markets</RmiButton>
        </div>
      </RmiSection>
    );
  }

  const activeArtist = artist;
  const holding = getHolding(activeArtist.id);
  const explanation = sanitizeMoveExplanation(
    activeArtist.ticker,
    activeArtist.lastMoveExplanation,
    activeArtist.dailyChangePercent
  );
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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 space-y-5">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ArtistAvatar artist={artist} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black">{artist.name}</h1>
                <BadgeCheck className="h-4 w-4 text-cyan" aria-hidden="true" />
                <WatchlistButton artistId={artist.id} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-bold text-paper/60">
                <span>${artist.ticker} · {artist.hypeScore}/100 RMI Score</span>
                <ScoreInfo />
              </p>
              <p className="mt-1 text-xs text-paper/40">Latest recorded quote · {state.artists.length} active listings</p>
            </div>
          </div>

          <div className="shrink-0 sm:text-right">
            <p className="text-4xl font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
            <p className="mt-1 text-sm"><ChangeText value={artist.dailyChangePercent} suffix=" today" /></p>
          </div>
        </section>

        <ArtistPriceHistoryPanel artistId={artist.id} fallbackData={artist.priceHistory} />

        <section className="rmi-card grid grid-cols-2 overflow-hidden sm:grid-cols-4">
          <QuoteStat label="Previous Close" value={formatCurrency(activeArtist.previousClose)} />
          <QuoteStat label="Today's Change" value={`${priceChange >= 0 ? "+" : ""}${formatCurrency(priceChange)}`} />
          <QuoteStat label="Bid" value={formatCurrency(sellQuote.executionPrice)} />
          <QuoteStat label="Ask" value={formatCurrency(buyQuote.executionPrice)} />
          <QuoteStat label="Recorded Low" value={formatCurrency(recordedLow)} />
          <QuoteStat label="Recorded High" value={formatCurrency(recordedHigh)} />
          <QuoteStat label="24h Rank" value={`#${moveRank}`} />
          <QuoteStat label="Signal Rank" value={`#${signalRank}`} />
        </section>

        <ArtistAudienceSnapshot artistId={artist.id} />

        <RmiSection title="Why the Quote Moved">
          <div className="px-4">
            <CatalystRow icon={<KeyRound className="h-4 w-4" />} text={explanation} />
          </div>
        </RmiSection>

        <RmiSection title="Market News">
          <div className="px-4">
            <MarketNewsFeed artistId={artist.id} limit={6} compact />
          </div>
        </RmiSection>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1 scrollbar-thin">
        <TradeTicket artist={activeArtist} />
        {holding ? (
          <RmiSection title="Your Position">
            <div className="space-y-2 p-4 text-sm">
              <PositionRow label="Shares" value={formatShares(holding.shares)} />
              <PositionRow label="Value" value={formatCurrency(holding.currentValue)} />
              <PositionRow label="Average Cost" value={formatCurrency(holding.averageBuyPrice)} />
            </div>
          </RmiSection>
        ) : null}
        <MarketSideRail currentArtistId={activeArtist.id} />
      </aside>
    </div>
  );
}

function QuoteStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-line px-3 py-3 sm:[&:nth-last-child(-n+4)]:border-b-0">
      <p className="text-[10px] font-bold uppercase text-paper/45">{label}</p>
      <p className="mt-1 truncate text-sm font-black number-tabular">{value}</p>
    </div>
  );
}

function CatalystRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex gap-3 py-3 text-sm">
      <span className="mt-0.5 text-paper/45">{icon}</span>
      <p className="font-bold leading-5 text-paper/85">{text}</p>
    </div>
  );
}

function PositionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-bold text-paper/55">{label}</span>
      <span className="font-black number-tabular">{value}</span>
    </div>
  );
}
