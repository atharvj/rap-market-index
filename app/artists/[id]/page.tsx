"use client";

import { ArtistAvatar } from "@/components/ArtistAvatar";
import { ArtistPriceHistoryPanel } from "@/components/ArtistPriceHistoryPanel";
import { useGame } from "@/components/GameProvider";
import { MarketNewsFeed } from "@/components/MarketNewsFeed";
import { ChangeText, RmiButton, RmiSection } from "@/components/RmiPrimitives";
import { TradeTicket } from "@/components/TradeTicket";
import { WatchlistButton } from "@/components/WatchlistButton";
import { sanitizeMoveExplanation } from "@/lib/artist-explanations";
import { formatCurrency, formatShares } from "@/lib/formatters";
import { BadgeCheck, CalendarDays, KeyRound, Trophy } from "lucide-react";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";

export default function ArtistDetailPage() {
  const params = useParams<{ id: string }>();
  const { getArtist, getHolding } = useGame();
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
  const explanation = sanitizeMoveExplanation(activeArtist.ticker, activeArtist.lastMoveExplanation);
  const recordedPrices = [...activeArtist.priceHistory.map((point) => point.price), activeArtist.currentPrice];
  const recordedHigh = Math.max(...recordedPrices);
  const priceChange = activeArtist.currentPrice - activeArtist.previousClose;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 space-y-5">
        <section className="space-y-5">
          <div className="flex items-start gap-4">
            <ArtistAvatar artist={artist} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-black">{artist.name}</h1>
                <BadgeCheck className="h-4 w-4 text-cyan" aria-hidden="true" />
                <WatchlistButton artistId={artist.id} />
              </div>
              <p className="mt-1 text-sm font-bold text-paper/60">${artist.ticker} · rap market · {artist.hypeScore}/100 score</p>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-end gap-3">
              <p className="text-4xl font-black number-tabular">{formatCurrency(artist.currentPrice)}</p>
              <ChangeText value={artist.dailyChangePercent} suffix=" today" />
            </div>
          </div>
        </section>

        <ArtistPriceHistoryPanel artistId={artist.id} fallbackData={artist.priceHistory} />

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuoteStat label="previous close" value={formatCurrency(activeArtist.previousClose)} />
          <QuoteStat label="today's change" value={`${priceChange >= 0 ? "+" : ""}${formatCurrency(priceChange)}`} />
          <QuoteStat label="recorded high" value={formatCurrency(recordedHigh)} />
          <QuoteStat label="RMI score" value={`${activeArtist.hypeScore}/100`} />
        </section>

        <RmiSection title="Catalysts">
          <div className="divide-y divide-line px-4">
            <CatalystRow icon={<KeyRound className="h-4 w-4" />} text={`Latest model summary: ${explanation}`} />
            <CatalystRow icon={<CalendarDays className="h-4 w-4" />} text="Release, review, social, and audience signals are checked during market runs." />
            <CatalystRow icon={<Trophy className="h-4 w-4" />} text="Large moves require stronger source confidence than routine uploads." />
          </div>
        </RmiSection>

        <RmiSection title="Market news">
          <div className="px-4">
            <MarketNewsFeed artistId={artist.id} limit={6} compact />
          </div>
        </RmiSection>
      </main>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <TradeTicket artist={activeArtist} />
        {holding ? (
          <RmiSection title="Your position">
            <div className="space-y-2 p-4 text-sm">
              <PositionRow label="shares" value={formatShares(holding.shares)} />
              <PositionRow label="value" value={formatCurrency(holding.currentValue)} />
              <PositionRow label="avg cost" value={formatCurrency(holding.averageBuyPrice)} />
            </div>
          </RmiSection>
        ) : null}
      </aside>
    </div>
  );
}

function QuoteStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-paper/55">{label}</p>
      <p className="mt-1 text-sm font-black number-tabular">{value}</p>
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
