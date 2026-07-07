"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  STARTING_CASH,
  createInitialGameState,
  getHoldingViews,
  getMockLeaderboard,
  getPortfolioDayChange,
  getPortfolioValue,
  getShortPositionViews,
  resetGame,
  simulateDailyUpdate
} from "@/lib/market";
import { estimateMarketMakerQuote } from "@/lib/trading";
import type { Artist, GameState, HoldingView, LeaderboardEntry, ShortPositionView, TradeResult } from "@/lib/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type SyncMode = "demo" | "supabase";

type MarketSnapshotResponse = {
  ok: boolean;
  source: "mock" | "supabase";
  state?: GameState;
};

type BootstrapResponse = {
  ok: boolean;
  error?: string;
  profile?: {
    id: string;
    username: string;
    cashBalance: number;
    bio?: string;
    favoriteArtistIds?: string[];
    isAdmin?: boolean;
  };
  holdings?: GameState["holdings"];
  shortPositions?: GameState["shortPositions"];
  transactions?: GameState["transactions"];
};

type LeaderboardResponse = {
  ok: boolean;
  error?: string;
  leaderboard?: LeaderboardEntry[];
};

type WatchlistResponse = {
  ok: boolean;
  error?: string;
  watchlist?: string[];
};

type GameContextValue = {
  state: GameState;
  hydrated: boolean;
  syncMode: SyncMode;
  syncStatus: string;
  serverRefreshing: boolean;
  holdings: HoldingView[];
  shortPositions: ShortPositionView[];
  leaderboard: LeaderboardEntry[];
  portfolioValue: number;
  portfolioDayChange: number;
  gainPercent: number;
  watchlistArtistIds: string[];
  watchlistArtists: Artist[];
  isAdminUser: boolean;
  buyShares: (artistId: string, shares: number) => Promise<TradeResult>;
  sellShares: (artistId: string, shares: number) => Promise<TradeResult>;
  toggleWatchlist: (artistId: string) => Promise<TradeResult>;
  simulateDay: () => void;
  resetPortfolio: () => void;
  refreshServerState: (preferredUsername?: string) => Promise<boolean>;
  getArtist: (artistId: string) => Artist | undefined;
  getHolding: (artistId: string) => HoldingView | undefined;
  getShortPosition: (artistId: string) => ShortPositionView | undefined;
  isWatchlisted: (artistId: string) => boolean;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { configured: authConfigured, loading: authLoading, session } = useAuth();
  const [state, setState] = useState<GameState>(() => createInitialGameState());
  const hydrated = true;
  const [syncMode, setSyncMode] = useState<SyncMode>("demo");
  const [syncStatus, setSyncStatus] = useState("Unsaved demo mode");
  const [serverRefreshing, setServerRefreshing] = useState(false);
  const [serverLeaderboard, setServerLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [watchlistArtistIds, setWatchlistArtistIds] = useState<string[]>([]);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    if (!hydrated || !authConfigured) {
      return;
    }

    let active = true;

    fetch("/api/market/snapshot")
      .then((response) => response.json() as Promise<MarketSnapshotResponse>)
      .then((payload) => {
        if (!active || !payload.ok || payload.source !== "supabase" || !payload.state) {
          return;
        }

        const snapshotState = payload.state;
        setState((current) => ({
          ...snapshotState,
          userId: current.userId,
          username: current.username,
          cashBalance: current.cashBalance,
          holdings: current.holdings,
          shortPositions: current.shortPositions,
          transactions: current.transactions
        }));
        setSyncStatus(session ? "Server market loaded" : "Server market loaded");
      })
      .catch(() => {
        if (active) {
          setSyncStatus("Unsaved demo mode");
        }
      });

    return () => {
      active = false;
    };
  }, [authConfigured, hydrated, session]);

  const holdings = useMemo(() => getHoldingViews(state), [state]);
  const shortPositions = useMemo(() => getShortPositionViews(state), [state]);
  const portfolioValue = useMemo(() => getPortfolioValue(state), [state]);
  const portfolioDayChange = useMemo(() => getPortfolioDayChange(state), [state]);
  const mockLeaderboard = useMemo(() => getMockLeaderboard(state), [state]);
  const leaderboard = useMemo(() => {
    const source = serverLeaderboard?.length ? serverLeaderboard : mockLeaderboard;

    return source.map((entry) => ({
      ...entry,
      isCurrentUser: entry.id === state.userId || entry.isCurrentUser
    }));
  }, [mockLeaderboard, serverLeaderboard, state.userId]);
  const gainPercent = ((portfolioValue - STARTING_CASH) / STARTING_CASH) * 100;
  const watchlistArtists = useMemo(
    () =>
      watchlistArtistIds
        .map((artistId) => state.artists.find((artist) => artist.id === artistId))
        .filter((artist): artist is Artist => Boolean(artist)),
    [state.artists, watchlistArtistIds]
  );

  const getArtist = useCallback(
    (artistId: string) => state.artists.find((artist) => artist.id === artistId),
    [state.artists]
  );

  const getHolding = useCallback(
    (artistId: string) => holdings.find((holding) => holding.artistId === artistId),
    [holdings]
  );

  const getShortPosition = useCallback(
    (artistId: string) => shortPositions.find((position) => position.artistId === artistId),
    [shortPositions]
  );

  const isWatchlisted = useCallback(
    (artistId: string) => watchlistArtistIds.includes(artistId),
    [watchlistArtistIds]
  );

  const refreshLeaderboard = useCallback(
    async (currentUserId?: string) => {
      if (!authConfigured) {
        setServerLeaderboard(null);
        return false;
      }

      try {
        const response = await fetch("/api/leaderboard");
        const payload = (await response.json()) as LeaderboardResponse;

        if (!response.ok || !payload.ok || !payload.leaderboard) {
          throw new Error(payload.error ?? "Could not load leaderboard.");
        }

        setServerLeaderboard(markCurrentLeaderboardUser(payload.leaderboard, currentUserId));
        return true;
      } catch {
        setServerLeaderboard(null);
        return false;
      }
    },
    [authConfigured]
  );

  const refreshWatchlist = useCallback(
    async (accessToken?: string) => {
      if (!authConfigured || !accessToken) {
        setWatchlistArtistIds([]);
        return false;
      }

      try {
        const response = await fetch("/api/watchlist", {
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        });
        const payload = (await response.json()) as WatchlistResponse;

        if (!response.ok || !payload.ok || !payload.watchlist) {
          throw new Error(payload.error ?? "Could not load watchlist.");
        }

        setWatchlistArtistIds(payload.watchlist);
        return true;
      } catch {
        setWatchlistArtistIds([]);
        return false;
      }
    },
    [authConfigured]
  );

  const refreshServerState = useCallback(
    async (preferredUsername?: string) => {
      if (!authConfigured || authLoading || !session) {
        setSyncMode("demo");
        setSyncStatus(authConfigured ? "Signed out; unsaved demo mode" : "Unsaved demo mode");
        setWatchlistArtistIds([]);
        setIsAdminUser(false);
        if (authConfigured) {
          void refreshLeaderboard();
        } else {
          setServerLeaderboard(null);
        }
        return false;
      }

      setServerRefreshing(true);

      try {
        const [snapshotResponse, profileResponse] = await Promise.all([
          fetch("/api/market/snapshot"),
          fetch("/api/profile/bootstrap", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              username: preferredUsername
            })
          })
        ]);
        const snapshot = (await snapshotResponse.json()) as MarketSnapshotResponse;
        const profile = (await profileResponse.json()) as BootstrapResponse;

        if (!profileResponse.ok || !profile.ok || !profile.profile) {
          throw new Error(profile.error ?? "Could not load server profile.");
        }

        const profileData = profile.profile;
        setIsAdminUser(Boolean(profileData.isAdmin));
        void refreshLeaderboard(profileData.id);
        void refreshWatchlist(session.access_token);

        setState((current) => {
          const baseState = snapshot.ok && snapshot.source === "supabase" && snapshot.state ? snapshot.state : current;

          return {
            ...baseState,
            userId: profileData.id,
            username: profileData.username,
            cashBalance: profileData.cashBalance,
            holdings: profile.holdings ?? [],
            shortPositions: profile.shortPositions ?? [],
            transactions: profile.transactions ?? []
          };
        });
        setSyncMode("supabase");
        setSyncStatus("Server profile synced");
        return true;
      } catch (error) {
        setSyncStatus(error instanceof Error ? error.message : "Server sync failed");
        return false;
      } finally {
        setServerRefreshing(false);
      }
    },
    [authConfigured, authLoading, refreshLeaderboard, refreshWatchlist, session]
  );

  useEffect(() => {
    if (!hydrated || authLoading) {
      return;
    }

    if (session) {
      void refreshServerState();
      return;
    }

    setSyncMode("demo");
    setSyncStatus(authConfigured ? "Signed out; unsaved demo mode" : "Unsaved demo mode");
    setWatchlistArtistIds([]);
    setIsAdminUser(false);
    void refreshLeaderboard();
  }, [authConfigured, authLoading, hydrated, refreshLeaderboard, refreshServerState, session]);

  const buyShares = useCallback(
    async (artistId: string, shares: number) => {
      const artist = getArtist(artistId);

      if (!artist) {
        return { ok: false, message: "Artist not found." };
      }

      if (!Number.isFinite(shares) || shares <= 0) {
        return { ok: false, message: "Enter a positive share amount." };
      }

      const quoteEstimate = estimateMarketMakerQuote({
        side: "buy",
        midPrice: artist.currentPrice,
        shares,
        volatility: artist.volatility
      });
      const cost = quoteEstimate.orderValue;
      const totalCost = quoteEstimate.totalCost;
      const holding = getHolding(artistId);
      const remainingPositionValue = Math.max(0, portfolioValue * 0.25 - (holding?.currentValue ?? 0));

      if (totalCost > state.cashBalance) {
        return { ok: false, message: "Not enough cash for that order." };
      }

      if (cost > remainingPositionValue) {
        return { ok: false, message: "Artist position limit is 25% of portfolio value." };
      }

      if (!session) {
        return { ok: false, message: "Sign in to trade." };
      }

      if (syncMode !== "supabase") {
        return { ok: false, message: "Wait for your cloud profile to sync before trading." };
      }

      const result = await submitServerTrade({
        side: "buy",
        artistId,
        shares,
        accessToken: session.access_token
      });

      if (result.ok) {
        await refreshServerState();
      }

      return result;
    },
    [getArtist, getHolding, portfolioValue, refreshServerState, session, state.cashBalance, syncMode]
  );

  const sellShares = useCallback(
    async (artistId: string, shares: number) => {
      const artist = getArtist(artistId);
      const holding = getHolding(artistId);

      if (!artist || !holding) {
        return { ok: false, message: "No shares available to sell." };
      }

      if (!Number.isFinite(shares) || shares <= 0) {
        return { ok: false, message: "Enter a positive share amount." };
      }

      if (shares > holding.shares) {
        return { ok: false, message: "You cannot sell more shares than you own." };
      }

      if (!session) {
        return { ok: false, message: "Sign in to trade." };
      }

      if (syncMode !== "supabase") {
        return { ok: false, message: "Wait for your cloud profile to sync before trading." };
      }

      const result = await submitServerTrade({
        side: "sell",
        artistId,
        shares,
        accessToken: session.access_token
      });

      if (result.ok) {
        await refreshServerState();
      }

      return result;
    },
    [getArtist, getHolding, refreshServerState, session, syncMode]
  );

  const toggleWatchlist = useCallback(
    async (artistId: string) => {
      const artist = getArtist(artistId);

      if (!artist) {
        return { ok: false, message: "Artist not found." };
      }

      if (!session || syncMode !== "supabase") {
        return { ok: false, message: "Sign in to save a watchlist." };
      }

      const currentlyWatchlisted = isWatchlisted(artistId);
      const response = await fetch("/api/watchlist", {
        method: currentlyWatchlisted ? "DELETE" : "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          artistId
        })
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        return {
          ok: false,
          message: payload.error ?? "Watchlist update failed."
        };
      }

      setWatchlistArtistIds((current) =>
        currentlyWatchlisted
          ? current.filter((candidate) => candidate !== artistId)
          : current.includes(artistId)
            ? current
            : [artistId, ...current]
      );

      return {
        ok: true,
        message: currentlyWatchlisted ? `Removed ${artist.ticker} from watchlist.` : `Added ${artist.ticker} to watchlist.`
      };
    },
    [getArtist, isWatchlisted, session, syncMode]
  );

  const simulateDay = useCallback(() => {
    setState((current) => simulateDailyUpdate(current));
  }, []);

  const resetPortfolio = useCallback(() => {
    setState(resetGame());
  }, []);

  const value = useMemo(
    () => ({
      state,
      hydrated,
      syncMode,
      syncStatus,
      serverRefreshing,
      holdings,
      shortPositions,
      leaderboard,
      portfolioValue,
      portfolioDayChange,
      gainPercent,
      watchlistArtistIds,
      watchlistArtists,
      isAdminUser,
      buyShares,
      sellShares,
      toggleWatchlist,
      simulateDay,
      resetPortfolio,
      refreshServerState,
      getArtist,
      getHolding,
      getShortPosition,
      isWatchlisted
    }),
    [
      state,
      hydrated,
      syncMode,
      syncStatus,
      serverRefreshing,
      holdings,
      shortPositions,
      leaderboard,
      portfolioValue,
      portfolioDayChange,
      gainPercent,
      watchlistArtistIds,
      watchlistArtists,
      isAdminUser,
      buyShares,
      sellShares,
      toggleWatchlist,
      simulateDay,
      resetPortfolio,
      refreshServerState,
      getArtist,
      getHolding,
      getShortPosition,
      isWatchlisted
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

async function submitServerTrade({
  side,
  artistId,
  shares,
  accessToken
}: {
  side: "buy" | "sell" | "short" | "cover";
  artistId: string;
  shares: number;
  accessToken: string;
}): Promise<TradeResult> {
  const response = await fetch("/api/trades", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      side,
      artistId,
      shares
    })
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    return {
      ok: false,
      message: payload.error ?? "Trade failed."
    };
  }

  return {
    ok: true,
      message: formatTradeMessage({
        side,
        shares,
        ticker: payload.trade?.ticker,
        executionPrice: payload.trade?.execution_price ?? payload.trade?.executionPrice,
        commission: payload.trade?.commission,
        marketEligible: payload.trade?.market_eligible ?? payload.trade?.marketEligible
      })
  };
}

function formatTradeMessage({
  side,
  shares,
  ticker,
  executionPrice,
  commission,
  marketEligible
}: {
  side: "buy" | "sell" | "short" | "cover";
  shares: number;
  ticker?: string;
  executionPrice?: number;
  commission?: number;
  marketEligible?: boolean;
}) {
  const executionText =
    typeof executionPrice === "number" && Number.isFinite(executionPrice)
      ? ` at ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(executionPrice)}`
      : "";
  const commissionText =
    typeof commission === "number" && Number.isFinite(commission)
      ? ` Commission ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(commission)}.`
      : "";
  const testingText = marketEligible === false ? " Test/admin trade: no market impact." : "";

  return `${getTradeVerb(side)} ${shares} ${ticker ?? "shares"}${executionText}.${commissionText}${testingText}`;
}

function getTradeVerb(side: "buy" | "sell" | "short" | "cover") {
  if (side === "sell") {
    return "Sold";
  }

  if (side === "short") {
    return "Shorted";
  }

  if (side === "cover") {
    return "Covered";
  }

  return "Bought";
}

function markCurrentLeaderboardUser(entries: LeaderboardEntry[], currentUserId?: string) {
  return entries.map((entry) => ({
    ...entry,
    isCurrentUser: Boolean(currentUserId && entry.id === currentUserId)
  }));
}

export function useGame() {
  const value = useContext(GameContext);

  if (!value) {
    throw new Error("useGame must be used within GameProvider");
  }

  return value;
}
