import { createInitialArtists } from "@/data/mockArtists";
import {
  calculateHypeScore,
  calculateSignalDelta,
  clamp,
  getDailyChangePercent,
  roundPrice
} from "@/lib/pricing";
import { STARTING_CASH } from "@/lib/trading";
import type {
  Artist,
  GameState,
  Holding,
  HoldingView,
  HypeStats,
  LeaderboardEntry,
  ShortPositionView,
  Transaction
} from "@/lib/types";

export { STARTING_CASH };

const BASE_DATE = "2026-07-03";

export function createInitialGameState(): GameState {
  return {
    userId: "current-user",
    username: "You",
    cashBalance: STARTING_CASH,
    artists: createInitialArtists(),
    holdings: [],
    shortPositions: [],
    transactions: [],
    lastUpdatedAt: BASE_DATE
  };
}

export function getHoldingViews(state: GameState): HoldingView[] {
  return state.holdings
    .map((holding) => {
      const artist = state.artists.find((candidate) => candidate.id === holding.artistId);

      if (!artist) {
        return null;
      }

      const currentValue = holding.shares * artist.currentPrice;
      const costBasis = holding.shares * holding.averageBuyPrice;
      const profitLoss = currentValue - costBasis;

      return {
        ...holding,
        artist,
        currentValue,
        costBasis,
        profitLoss,
        profitLossPercent: costBasis === 0 ? 0 : (profitLoss / costBasis) * 100
      };
    })
    .filter((holding): holding is HoldingView => Boolean(holding));
}

export function getShortPositionViews(state: GameState): ShortPositionView[] {
  return state.shortPositions
    .map((position) => {
      const artist = state.artists.find((candidate) => candidate.id === position.artistId);

      if (!artist) {
        return null;
      }

      const currentLiability = position.shares * artist.currentPrice;
      const unrealizedProfitLoss = (position.averageShortPrice - artist.currentPrice) * position.shares;
      const shortEquity = position.collateral + unrealizedProfitLoss;

      return {
        ...position,
        artist,
        currentLiability,
        shortEquity,
        unrealizedProfitLoss,
        equityPercent: currentLiability === 0 ? 0 : (shortEquity / currentLiability) * 100
      };
    })
    .filter((position): position is ShortPositionView => Boolean(position));
}

export function getPortfolioValue(state: GameState) {
  return (
    state.cashBalance +
    getHoldingViews(state).reduce((total, holding) => total + holding.currentValue, 0) +
    getShortPositionViews(state).reduce((total, position) => total + position.shortEquity, 0)
  );
}

export function getPortfolioDayChange(state: GameState) {
  const longDayChange = getHoldingViews(state).reduce((total, holding) => {
    const previousValue = holding.shares * holding.artist.previousClose;
    return total + (holding.currentValue - previousValue);
  }, 0);
  const shortDayChange = getShortPositionViews(state).reduce((total, position) => {
    const previousLiability = position.shares * position.artist.previousClose;
    return total + (previousLiability - position.currentLiability);
  }, 0);

  return longDayChange + shortDayChange;
}

export function getMockLeaderboard(state: GameState): LeaderboardEntry[] {
  const currentValue = getPortfolioValue(state);

  return [
    {
      id: state.userId,
      username: state.username,
      portfolioValue: currentValue,
      cashBalance: state.cashBalance,
      gainPercent: ((currentValue - STARTING_CASH) / STARTING_CASH) * 100,
      isCurrentUser: true
    }
  ].sort((a, b) => b.portfolioValue - a.portfolioValue);
}

export function applyBuy(state: GameState, artistId: string, shares: number): GameState {
  const artist = state.artists.find((candidate) => candidate.id === artistId);

  if (!artist) {
    return state;
  }

  const cost = shares * artist.currentPrice;
  const existingHolding = state.holdings.find((holding) => holding.artistId === artistId);
  const nextHolding: Holding = existingHolding
    ? {
        ...existingHolding,
        shares: existingHolding.shares + shares,
        averageBuyPrice:
          (existingHolding.averageBuyPrice * existingHolding.shares + cost) /
          (existingHolding.shares + shares)
      }
    : {
        artistId,
        shares,
        averageBuyPrice: artist.currentPrice
      };

  const holdings = existingHolding
    ? state.holdings.map((holding) => (holding.artistId === artistId ? nextHolding : holding))
    : [...state.holdings, nextHolding];

  return {
    ...state,
    cashBalance: state.cashBalance - cost,
    holdings,
    artists: state.artists.map((candidate) =>
      candidate.id === artistId ? applyTradeMove(candidate, cost, "buy") : candidate
    ),
    transactions: [createTransaction(artistId, "buy", shares, artist.currentPrice), ...state.transactions]
  };
}

export function applySell(state: GameState, artistId: string, shares: number): GameState {
  const artist = state.artists.find((candidate) => candidate.id === artistId);
  const existingHolding = state.holdings.find((holding) => holding.artistId === artistId);

  if (!artist || !existingHolding) {
    return state;
  }

  const proceeds = shares * artist.currentPrice;
  const remainingShares = existingHolding.shares - shares;
  const holdings =
    remainingShares <= 0.0001
      ? state.holdings.filter((holding) => holding.artistId !== artistId)
      : state.holdings.map((holding) =>
          holding.artistId === artistId ? { ...holding, shares: remainingShares } : holding
        );

  return {
    ...state,
    cashBalance: state.cashBalance + proceeds,
    holdings,
    artists: state.artists.map((candidate) =>
      candidate.id === artistId ? applyTradeMove(candidate, proceeds, "sell") : candidate
    ),
    transactions: [createTransaction(artistId, "sell", shares, artist.currentPrice), ...state.transactions]
  };
}

export function simulateDailyUpdate(state: GameState): GameState {
  const artists = state.artists.map((artist, index) => updateArtistForDay(artist, index));
  const nextDate = getNextDate(state.lastUpdatedAt);

  return {
    ...state,
    artists,
    lastUpdatedAt: nextDate
  };
}

export function resetGame() {
  return createInitialGameState();
}

function applyTradeMove(artist: Artist, orderValue: number, type: "buy" | "sell"): Artist {
  const direction = type === "buy" ? 1 : -1;
  const impact = clamp((orderValue / STARTING_CASH) * 0.028 * artist.volatility, 0.001, 0.045);
  const nextPrice = roundPrice(artist.currentPrice * (1 + direction * impact));
  const nextStats = {
    ...artist.stats,
    traderDemand: clamp(artist.stats.traderDemand + direction * impact * 240, -40, 40)
  };
  const latestHistory = [...artist.priceHistory];
  latestHistory[latestHistory.length - 1] = {
    ...latestHistory[latestHistory.length - 1],
    price: nextPrice
  };

  return {
    ...artist,
    currentPrice: nextPrice,
    dailyChangePercent: getDailyChangePercent(nextPrice, artist.previousClose),
    hypeScore: calculateHypeScore(nextStats),
    stats: nextStats,
    priceHistory: latestHistory,
    lastMoveExplanation:
      type === "buy"
        ? `Buy pressure lifted ${artist.ticker} as traders chased recent momentum.`
        : `Selling pressure cooled ${artist.ticker} after traders trimmed exposure.`
  };
}

function updateArtistForDay(artist: Artist, index: number): Artist {
  const nextStats = mutateStats(artist.stats, index, artist.volatility);
  const signalDelta = calculateSignalDelta(nextStats) * artist.volatility;
  const categoryCap = getCategoryDailyCap(artist.category);
  const targetPrice = artist.currentPrice * (1 + signalDelta);
  const blendedPrice = artist.currentPrice * 0.8 + targetPrice * 0.2;
  const cappedPrice = clamp(
    blendedPrice,
    artist.currentPrice * (1 - categoryCap),
    artist.currentPrice * (1 + categoryCap)
  );
  const currentPrice = roundPrice(cappedPrice);
  const dailyChangePercent = getDailyChangePercent(currentPrice, artist.currentPrice);
  const historyDate = getNextDate(artist.priceHistory[artist.priceHistory.length - 1].date);

  return {
    ...artist,
    previousClose: artist.currentPrice,
    currentPrice,
    dailyChangePercent,
    hypeScore: calculateHypeScore(nextStats),
    stats: nextStats,
    priceHistory: [...artist.priceHistory.slice(-27), { date: historyDate, price: currentPrice }],
    lastMoveExplanation: explainDailyMove(nextStats, dailyChangePercent, artist.ticker)
  };
}

function mutateStats(stats: HypeStats, index: number, volatility: number): HypeStats {
  const wave = Math.sin(Date.now() / 86400000 + index) * 2.8;
  const drift = (index % 3) - 1;

  return {
    streamingGrowth: clamp(stats.streamingGrowth * 0.72 + wave + drift, -18, 55),
    youtubeGrowth: clamp(stats.youtubeGrowth * 0.7 + wave * 1.1, -18, 60),
    searchGrowth: clamp(stats.searchGrowth * 0.75 + wave * volatility, -25, 70),
    socialGrowth: clamp(stats.socialGrowth * 0.68 + wave * 1.4, -30, 90),
    newsScore: clamp(stats.newsScore * 0.82 + 10 + Math.max(0, wave * 1.5), 0, 100),
    traderDemand: clamp(stats.traderDemand * 0.62, -40, 40)
  };
}

function explainDailyMove(stats: HypeStats, dailyChangePercent: number, ticker: string) {
  const signals = [
    ["streaming momentum", stats.streamingGrowth],
    ["video momentum", stats.youtubeGrowth],
    ["discovery trend", stats.searchGrowth],
    ["fan sentiment", stats.socialGrowth],
    ["media and reviews", stats.newsScore - 50],
    ["trading demand", stats.traderDemand]
  ] as const;
  const [signalName] = signals.reduce((best, current) =>
    Math.abs(current[1]) > Math.abs(best[1]) ? current : best
  );
  const direction = dailyChangePercent >= 0 ? "moved higher" : "pulled back";

  return `${ticker} ${direction} as ${signalName} became the strongest momentum signal.`;
}

function getCategoryDailyCap(category: Artist["category"]) {
  const caps: Record<Artist["category"], number> = {
    superstar: 0.12,
    mainstream: 0.18,
    rising: 0.24,
    underground: 0.3
  };

  return caps[category];
}

function createTransaction(
  artistId: string,
  type: Transaction["type"],
  shares: number,
  price: number
): Transaction {
  return {
    id: `${type}-${artistId}-${Date.now()}`,
    artistId,
    type,
    shares,
    price,
    createdAt: new Date().toISOString()
  };
}

function getNextDate(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}
