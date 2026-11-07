"use client";

import { useAuth } from "@/components/AuthProvider";
import { useGame } from "@/components/GameProvider";
import { ArtistIdentity, RmiSection } from "@/components/RmiPrimitives";
import {
  MarketNewsFeed,
  type MarketNewsItem,
} from "@/components/MarketNewsFeed";
import {
  buildArtistRecap,
  getArtistWeek,
  getTrackedArtists,
  isMarketDate,
  shiftReviewDate,
} from "@/lib/personal-market";
import { formatCurrency, formatDate, formatPercent } from "@/lib/formatters";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

export function PersonalMarketHome() {
  const { session } = useAuth();
  const {
    state,
    marketReady,
    profileLoaded,
    watchlistLoaded,
    watchlistArtistIds,
    portfolioValue,
    portfolioDayChange,
    syncMode,
  } = useGame();
  const [news, setNews] = useState<{ key: string; items: MarketNewsItem[] }>({
    key: "",
    items: [],
  });
  const [copiedRecap, setCopiedRecap] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const tracked = useMemo(
    () =>
      getTrackedArtists(
        state.artists,
        watchlistArtistIds,
        state.holdings,
        state.shortPositions,
      ),
    [state.artists, watchlistArtistIds, state.holdings, state.shortPositions],
  );
  const key = `${session?.user.id ?? ""}:${tracked
    .map((a) => a.id)
    .sort()
    .join(",")}`;
  const receiveNews = useCallback(
    (items: MarketNewsItem[]) => setNews({ key, items }),
    [key],
  );
  const weeks = tracked
    .flatMap((artist) => {
      const week = getArtistWeek(artist, state.lastUpdatedAt);
      return week ? [week] : [];
    })
    .sort(
      (a, b) =>
        Math.abs(b.changePercent) - Math.abs(a.changePercent) ||
        a.artist.name.localeCompare(b.artist.name),
    );
  const currentNews = news.key === key ? news.items : [];
  const until = shiftReviewDate(state.lastUpdatedAt, 14);
  const releases = currentNews
    .filter(
      (item) =>
        isMarketDate(item.announcedReleaseDate) &&
        item.announcedReleaseDate > state.lastUpdatedAt &&
        until &&
        item.announcedReleaseDate <= until,
    )
    .sort((a, b) =>
      a.announcedReleaseDate!.localeCompare(b.announcedReleaseDate!),
    );
  const recap = buildArtistRecap(
    weeks.slice(0, 12),
    weeks
      .map((w) => w.endDate)
      .sort()
      .at(-1) ?? state.lastUpdatedAt,
  );
  const accountReady = Boolean(
    session &&
      profileLoaded &&
      state.userId === session.user.id &&
      syncMode === "supabase",
  );
  const ready = marketReady && accountReady && watchlistLoaded;
  async function copyRecap() {
    try {
      await navigator.clipboard.writeText(recap);
      setCopyState("copied");
      setCopiedRecap(recap);
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <section aria-label="Your market" className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="rmi-kicker text-cyan">Your market</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            Your artists. Your next move.
          </h1>
          <p className="mt-2 text-sm leading-6 text-paper/60">
            Catch up on the artists you follow and hold.
          </p>
        </div>
        <Link
          href="/watchlist"
          className="rmi-button-secondary inline-flex min-h-10 items-center px-4 text-sm font-semibold"
        >
          Manage watchlist
        </Link>
      </header>
      {accountReady && marketReady ? (
        <div
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Your current portfolio"
        >
          <Summary
            label="Portfolio value"
            value={formatCurrency(portfolioValue)}
          />
          <Summary
            label="Cash available"
            value={formatCurrency(state.cashBalance)}
          />
          <Summary
            label="Today's position change"
            value={`${portfolioDayChange < 0 ? "−" : "+"}${formatCurrency(Math.abs(portfolioDayChange))}`}
          />
        </div>
      ) : (
        <div className="rmi-card p-5 text-sm text-paper/60" role="status">
          Loading your portfolio…
        </div>
      )}
      {!ready ? (
        <div className="rmi-card p-5 text-sm text-paper/60" role="status">
          Loading your artist review…
        </div>
      ) : tracked.length ? (
        <>
          <RmiSection
            title="Your artist week"
            subtitle="Recorded quote changes for your watchlist and positions."
            action={
              weeks.length ? (
                <button
                  type="button"
                  onClick={() => void copyRecap()}
                  className="text-xs font-semibold text-cyan"
                >
                  {copiedRecap === recap ? "Recap copied" : "Copy artist recap"}
                </button>
              ) : null
            }
          >
            <div className="divide-y divide-line">
              {tracked
                .slice()
                .sort((a, b) => {
                  const av =
                    weeks.find((w) => w.artist.id === a.id)?.changePercent ?? 0;
                  const bv =
                    weeks.find((w) => w.artist.id === b.id)?.changePercent ?? 0;
                  return (
                    Math.abs(bv) - Math.abs(av) || a.name.localeCompare(b.name)
                  );
                })
                .slice(0, 12)
                .map((artist) => {
                  const week = weeks.find((w) => w.artist.id === artist.id);
                  return (
                    <div
                      key={artist.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                    >
                      <ArtistIdentity artist={artist} />
                      <div className="text-right">
                        <p className="text-sm font-semibold number-tabular">
                          {week ? formatPercent(week.changePercent) : "—"}
                        </p>
                        <p className="mt-1 text-xs text-paper/55">
                          {week
                            ? `${formatDate(week.startDate)}–${formatDate(week.endDate)} · ${week.days}D`
                            : "Building recorded history"}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="border-t border-line px-4 py-3 text-xs leading-5 text-paper/55">
              Artist quote changes use each artist's recorded date range.{" "}
              <Link href="/portfolio" className="font-semibold text-cyan">
                View your portfolio performance
              </Link>
            </div>
            {copyState === "manual" ? (
              <div className="border-t border-line p-4">
                <label
                  htmlFor="artist-recap"
                  className="mb-2 block text-xs font-semibold"
                >
                  Copy your artist recap
                </label>
                <textarea
                  id="artist-recap"
                  value={recap}
                  readOnly
                  rows={7}
                  className="rmi-terminal-input w-full text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            ) : null}
          </RmiSection>
          <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
            <RmiSection
              title="Stories for your artists"
              subtitle="Recent verified stories, including confirmed collaborators."
              action={
                <Link href="/news" className="text-xs font-semibold text-cyan">
                  All news
                </Link>
              }
            >
              <div className="px-4">
                <MarketNewsFeed
                  key={key}
                  artistIds={tracked.map((a) => a.id)}
                  limit={8}
                  lookbackDays={14}
                  compact
                  sort="latest"
                  onItemsChange={receiveNews}
                />
              </div>
            </RmiSection>
            <div className="space-y-5">
              <RmiSection
                title="Announced releases"
                subtitle="Source-backed dates in your recent stories · next 14 days."
              >
                {releases.length ? (
                  <ul className="divide-y divide-line">
                    {releases.map((item) => (
                      <li key={item.id} className="p-4">
                        <p className="text-xs font-semibold text-cyan">
                          <time dateTime={item.announcedReleaseDate!}>
                            {formatDate(item.announcedReleaseDate!)}
                          </time>
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-6">
                          {item.title}
                        </p>
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex text-xs text-cyan"
                          >
                            Read announcement · {item.sourceName ?? "Source"}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-sm leading-6 text-paper/60">
                    Dated announcements from your artists will appear here when
                    a verified source confirms them.
                  </p>
                )}
              </RmiSection>
              <RmiSection title="Your latest trades">
                {state.transactions.length ? (
                  <ul className="divide-y divide-line">
                    {state.transactions
                      .slice()
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 4)
                      .map((trade) => (
                        <li
                          key={trade.id}
                          className="flex justify-between gap-3 p-4 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="font-semibold capitalize">
                              {trade.type}
                            </span>{" "}
                            {state.artists.find((a) => a.id === trade.artistId)
                              ?.name ?? trade.artistId}
                            <span className="mt-1 block text-xs text-paper/50">
                              {formatDate(trade.createdAt)}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-paper/65">
                            {trade.shares.toLocaleString()} shares
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className="p-4 text-sm leading-6 text-paper/60">
                    Ready for a first pick? Open an artist, review the quote and
                    costs, and decide whether to trade.
                    <Link
                      href={`/artists/${tracked[0].id}?guide=first-trade&side=buy#trade`}
                      className="mt-3 block font-semibold text-cyan"
                    >
                      Review a first trade
                    </Link>
                  </div>
                )}
                <Link
                  href="/portfolio"
                  className="block border-t border-line px-4 py-3 text-xs font-semibold text-cyan"
                >
                  Open portfolio
                </Link>
              </RmiSection>
            </div>
          </div>
        </>
      ) : (
        <div className="rmi-card p-5">
          <h2 className="text-lg font-semibold">Make this market yours</h2>
          <p className="mt-2 text-sm leading-6 text-paper/60">
            Follow artists with the star button to build your weekly review and
            news feed. Artists in your positions appear here too.
          </p>
          <Link
            href="/markets"
            className="mt-4 inline-flex text-sm font-semibold text-cyan"
          >
            Choose artists to follow
          </Link>
        </div>
      )}
    </section>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rmi-metric p-4">
      <p className="rmi-data-label">{label}</p>
      <p className="mt-2 text-xl font-semibold number-tabular">{value}</p>
    </div>
  );
}
