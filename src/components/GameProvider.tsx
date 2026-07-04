"use client";

import { useAuth } from "@/components/AuthProvider";
import {
  STARTING_CASH,
  applyBuy,
  applySell,
  createInitialGameState,
  getHoldingViews,
  getMockLeaderboard,
  getPortfolioDayChange,
  getPortfolioValue,
  resetGame,
  simulateDailyUpdate
} from "@/lib/market";
import type { Artist, GameState, HoldingView, LeaderboardEntry, TradeResult } from "@/lib/types";
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
  };
  holdings?: GameState["holdings"];
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
  leaderboard: LeaderboardEntry[];
  portfolioValue: number;
  portfolioDayChange: number;
  gainPercent: number;
  watchlistArtistIds: string[];
  watchlistArtists: Artist[];
  buyShares: (artistId: string, shares: number) => Promise<TradeResult>;
  sellShares: (artistId: string, shares: number) => Promise<TradeResult>;
  toggleWatchlist: (artistId: string) => Promise<TradeResult>;
  simulateDay: () => void;
  resetPortfolio: () => void;
  refreshServerState: (preferredUsername?: string) => Promise<boolean>;
  getArtist: (artistId: string) => Artist | undefined;
  getHolding: (artistId: string) => HoldingView | undefined;
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
          transactions: current.transactions
        }));
        setSyncStatus(session ? "Server market loaded" : "Server market loaded; demo guest profile");
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

      const cost = shares * artist.currentPrice;

      if (cost > state.cashBalance) {
        return { ok: false, message: "Not enough cash for that order." };
      }

      if (syncMode === "supabase" && session) {
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
      }

      setState((current) => applyBuy(current, artistId, shares));
      return { ok: true, message: `Bought ${shares} ${artist.ticker} shares.` };
    },
    [getArtist, refreshServerState, session, state.cashBalance, syncMode]
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

      if (syncMode === "supabase" && session) {
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
      }

      setState((current) => applySell(current, artistId, shares));
      return { ok: true, message: `Sold ${shares} ${artist.ticker} shares.` };
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
      leaderboard,
      portfolioValue,
      portfolioDayChange,
      gainPercent,
      watchlistArtistIds,
      watchlistArtists,
      buyShares,
      sellShares,
      toggleWatchlist,
      simulateDay,
      resetPortfolio,
      refreshServerState,
      getArtist,
      getHolding,
      isWatchlisted
    }),
    [
      state,
      hydrated,
      syncMode,
      syncStatus,
      serverRefreshing,
      holdings,
      leaderboard,
      portfolioValue,
      portfolioDayChange,
      gainPercent,
      watchlistArtistIds,
      watchlistArtists,
      buyShares,
      sellShares,
      toggleWatchlist,
      simulateDay,
      resetPortfolio,
      refreshServerState,
      getArtist,
      getHolding,
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
  side: "buy" | "sell";
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
    message: `${side === "buy" ? "Bought" : "Sold"} ${shares} ${payload.trade?.ticker ?? "shares"}.`
  };
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
