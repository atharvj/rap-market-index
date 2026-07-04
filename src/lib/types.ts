export type ArtistCategory = "superstar" | "mainstream" | "rising" | "underground";

export type HypeStats = {
  streamingGrowth: number;
  youtubeGrowth: number;
  searchGrowth: number;
  socialGrowth: number;
  newsScore: number;
  traderDemand: number;
};

export type PricePoint = {
  date: string;
  price: number;
};

export type MarketObservationPoint = {
  date: string;
  value: number;
};

export type MarketObservationSeries = {
  key: string;
  source: string;
  metric: string;
  label: string;
  unit: string;
  points: MarketObservationPoint[];
  latestValue: number | null;
  latestDate: string | null;
};

export type Artist = {
  id: string;
  name: string;
  ticker: string;
  currentPrice: number;
  previousClose: number;
  dailyChangePercent: number;
  hypeScore: number;
  volatility: number;
  category: ArtistCategory;
  accent: string;
  stats: HypeStats;
  priceHistory: PricePoint[];
  lastMoveExplanation: string;
};

export type Holding = {
  artistId: string;
  shares: number;
  averageBuyPrice: number;
};

export type Transaction = {
  id: string;
  artistId: string;
  type: "buy" | "sell";
  shares: number;
  price: number;
  createdAt: string;
};

export type GameState = {
  userId: string;
  username: string;
  cashBalance: number;
  artists: Artist[];
  holdings: Holding[];
  transactions: Transaction[];
  lastUpdatedAt: string;
};

export type HoldingView = Holding & {
  artist: Artist;
  currentValue: number;
  costBasis: number;
  profitLoss: number;
  profitLossPercent: number;
};

export type LeaderboardEntry = {
  id: string;
  username: string;
  portfolioValue: number;
  cashBalance: number;
  gainPercent: number;
  isCurrentUser?: boolean;
};

export type TradeResult = {
  ok: boolean;
  message: string;
};
