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
import { usePathname, useRouter } from "next/navigation";

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
    avatarUrl?: string;
    onboardingCompleted?: boolean;
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
  marketReady: boolean;
  marketError: string;
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
  avatarUrl: string;
  onboardingCompleted: boolean;
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
  const pathname = usePathname();
  const router = useRouter();
  const { configured: authConfigured, loading: authLoading, session } = useAuth();
  // Never present bundled seed quotes as live data while the Supabase snapshot loads.
  const [state, setState] = useState<GameState>(() => clearMarketQuotes(createInitialGameState()));
  const hydrated = true;
  const [marketReady, setMarketReady] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("demo");
  const [syncStatus, setSyncStatus] = useState("Unsaved demo mode");
  const [serverRefreshing, setServerRefreshing] = useState(false);
  const [serverLeaderboard, setServerLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [watchlistArtistIds, setWatchlistArtistIds] = useState<string[]>([]);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    if (!hydrated || !authConfigured) {
      if (!authConfigured) {
        setMarketReady(true);
      }
      return;
    }

    let active = true;

    const controller = new AbortController();
    let firstLoad = true;
    const loadMarketSnapshot = () => fetch("/api/market/snapshot", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as MarketSnapshotResponse;

        if (!response.ok) {
          throw new Error("Live market data is temporarily unavailable.");
        }

        return payload;
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        if (!payload.ok || payload.source !== "supabase" || !payload.state) {
          setState((current) => clearMarketQuotes(current));
          setMarketError("Live market data is temporarily unavailable. Quotes and trading are paused until the feed recovers.");
          setMarketReady(true);
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
        setSyncStatus("Server market loaded");
        setMarketError("");
        setMarketReady(true);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          if (!firstLoad) {
            setMarketError("Live quote refresh is temporarily delayed. The last verified quote is still shown.");
            setSyncStatus("Market refresh delayed");
            return;
          }

          setState((current) => clearMarketQuotes(current));
          setMarketError("Live market data is temporarily unavailable. Quotes and trading are paused until the feed recovers.");
          setSyncStatus("Market feed unavailable");
          setMarketReady(true);
        }
      })
      .finally(() => {
        firstLoad = false;
      });

    void loadMarketSnapshot();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadMarketSnapshot();
      }
    }, 60_000);
    const refreshVisibleMarket = () => {
      if (document.visibilityState === "visible") {
        void loadMarketSnapshot();
      }
    };
    window.addEventListener("focus", refreshVisibleMarket);
    document.addEventListener("visibilitychange", refreshVisibleMarket);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleMarket);
      document.removeEventListener("visibilitychange", refreshVisibleMarket);
    };
  }, [authConfigured, hydrated]);

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
    async (currentUserId?: string, accessToken?: string) => {
      if (!authConfigured) {
        setServerLeaderboard(null);
        return false;
      }

      try {
        const response = await fetch("/api/leaderboard", {
          headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
        });
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
        setState((current) => clearPrivateGameState(current));
        setWatchlistArtistIds([]);
        setIsAdminUser(false);
        setAvatarUrl("");
        if (authConfigured) {
          void refreshLeaderboard();
        } else {
          setServerLeaderboard(null);
        }
        return false;
      }

      setServerRefreshing(true);

      try {
        const profileResponse = await fetch("/api/profile/bootstrap", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            username: preferredUsername
          })
        });
        const profile = (await profileResponse.json()) as BootstrapResponse;

        if (!profileResponse.ok || !profile.ok || !profile.profile) {
          throw new Error(profile.error ?? "Could not load server profile.");
        }

        const profileData = profile.profile;
        setIsAdminUser(Boolean(profileData.isAdmin));
        setAvatarUrl(profileData.avatarUrl ?? "");
        setOnboardingCompleted(profileData.onboardingCompleted !== false);
        setProfileLoaded(true);
        void refreshLeaderboard(profileData.id, session.access_token);
        void refreshWatchlist(session.access_token);

        setState((current) => {
          return {
            ...current,
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
        setProfileLoaded(false);
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
    setState((current) => clearPrivateGameState(current));
    setWatchlistArtistIds([]);
    setIsAdminUser(false);
    setAvatarUrl("");
    setOnboardingCompleted(true);
    setProfileLoaded(false);
    void refreshLeaderboard();
  }, [authConfigured, authLoading, hydrated, refreshLeaderboard, refreshServerState, session]);

  useEffect(() => {
    if (
      session &&
      profileLoaded &&
      !onboardingCompleted &&
      pathname !== "/onboarding" &&
      pathname !== "/account/reset-password"
    ) {
      router.replace("/onboarding");
    }
  }, [onboardingCompleted, pathname, profileLoaded, router, session]);

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
      marketReady,
      marketError,
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
      avatarUrl,
      onboardingCompleted,
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
      marketReady,
      marketError,
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
      avatarUrl,
      onboardingCompleted,
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

function clearPrivateGameState(state: GameState): GameState {
  return {
    ...state,
    userId: "demo-user",
    username: "Demo Guest",
    cashBalance: STARTING_CASH,
    holdings: [],
    shortPositions: [],
    transactions: []
  };
}

function clearMarketQuotes(state: GameState): GameState {
  return {
    ...state,
    artists: []
  };
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
        commission: payload.trade?.commission
      })
  };
}

function formatTradeMessage({
  side,
  shares,
  ticker,
  executionPrice,
  commission
}: {
  side: "buy" | "sell" | "short" | "cover";
  shares: number;
  ticker?: string;
  executionPrice?: number;
  commission?: number;
}) {
  const executionText =
    typeof executionPrice === "number" && Number.isFinite(executionPrice)
      ? ` at ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(executionPrice)}`
      : "";
  const commissionText =
    typeof commission === "number" && Number.isFinite(commission)
      ? ` Commission ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(commission)}.`
      : "";
  return `${getTradeVerb(side)} ${shares} ${ticker ?? "shares"}${executionText}.${commissionText}`;
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
