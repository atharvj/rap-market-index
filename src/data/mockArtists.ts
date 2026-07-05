import { calculateHypeScore, getDailyChangePercent, roundPrice } from "@/lib/pricing";
import type { Artist, ArtistCategory, HypeStats, PricePoint } from "@/lib/types";

type ArtistSeed = {
  id: string;
  name: string;
  ticker: string;
  price: number;
  previousClose: number;
  volatility: number;
  category: ArtistCategory;
  accent: string;
  stats: HypeStats;
  explanation: string;
  historyBias: number;
};

const BASE_DATE = "2026-07-03";

const seeds: ArtistSeed[] = [
  {
    id: "playboi-carti",
    name: "Playboi Carti",
    ticker: "CARTI",
    price: 91.4,
    previousClose: 97.2,
    volatility: 1.28,
    category: "mainstream",
    accent: "from-rose-400 via-zinc-100 to-cyan-300",
    stats: {
      streamingGrowth: -3.2,
      youtubeGrowth: 2.4,
      searchGrowth: 16.7,
      socialGrowth: 28.9,
      newsScore: 64,
      traderDemand: -11.2
    },
    explanation: "CARTI slipped as selling pressure outweighed social trend strength.",
    historyBias: 2.6
  },
  {
    id: "drake",
    name: "Drake",
    ticker: "DRAKE",
    price: 132.45,
    previousClose: 134.1,
    volatility: 0.76,
    category: "superstar",
    accent: "from-blue-300 via-stone-100 to-emerald-300",
    stats: {
      streamingGrowth: 1.8,
      youtubeGrowth: -0.6,
      searchGrowth: 2.1,
      socialGrowth: 1.4,
      newsScore: 54,
      traderDemand: -3.4
    },
    explanation: "DRAKE softened as momentum cooled despite a large baseline audience.",
    historyBias: 0.9
  },
  {
    id: "future",
    name: "Future",
    ticker: "FUTR",
    price: 88.2,
    previousClose: 84.7,
    volatility: 1.02,
    category: "mainstream",
    accent: "from-violet-300 via-zinc-100 to-emerald-300",
    stats: {
      streamingGrowth: 9.9,
      youtubeGrowth: 7.7,
      searchGrowth: 8.5,
      socialGrowth: 13.2,
      newsScore: 62,
      traderDemand: 8.6
    },
    explanation: "FUTR advanced with streaming momentum and healthy trading demand.",
    historyBias: 1.9
  },
  {
    id: "che",
    name: "Che",
    ticker: "CHE",
    price: 18.4,
    previousClose: 16.2,
    volatility: 1.74,
    category: "underground",
    accent: "from-lime-300 via-cyan-200 to-zinc-100",
    stats: {
      streamingGrowth: 29.8,
      youtubeGrowth: 21.4,
      searchGrowth: 38.6,
      socialGrowth: 47.2,
      newsScore: 58,
      traderDemand: 24.1
    },
    explanation: "CHE jumped as underground discovery and social clips accelerated.",
    historyBias: 4.8
  },
  {
    id: "osamason",
    name: "Osamason",
    ticker: "OSAMA",
    price: 24.65,
    previousClose: 21.8,
    volatility: 1.82,
    category: "underground",
    accent: "from-fuchsia-300 via-lime-200 to-cyan-300",
    stats: {
      streamingGrowth: 31.2,
      youtubeGrowth: 18.8,
      searchGrowth: 34.1,
      socialGrowth: 52.9,
      newsScore: 61,
      traderDemand: 26.4
    },
    explanation: "OSAMA rallied as online momentum and trading demand stacked together.",
    historyBias: 5.2
  },
  {
    id: "yung-fazo",
    name: "Yung Fazo",
    ticker: "FAZO",
    price: 11.3,
    previousClose: 12.1,
    volatility: 1.92,
    category: "underground",
    accent: "from-sky-300 via-pink-200 to-yellow-200",
    stats: {
      streamingGrowth: -4.8,
      youtubeGrowth: 6.5,
      searchGrowth: 13.7,
      socialGrowth: 22.4,
      newsScore: 46,
      traderDemand: -6.2
    },
    explanation: "FAZO dipped as trading demand cooled despite fan discovery holding up.",
    historyBias: 5.8
  },
  {
    id: "yeat",
    name: "Yeat",
    ticker: "YEAT",
    price: 52.6,
    previousClose: 48.7,
    volatility: 1.42,
    category: "rising",
    accent: "from-lime-300 via-fuchsia-200 to-cyan-300",
    stats: {
      streamingGrowth: 18.9,
      youtubeGrowth: 12.8,
      searchGrowth: 23.2,
      socialGrowth: 31.4,
      newsScore: 61,
      traderDemand: 18.2
    },
    explanation: "YEAT broke higher as search and social growth outpaced the market.",
    historyBias: 3.1
  },
  {
    id: "ken-carson",
    name: "Ken Carson",
    ticker: "KEN",
    price: 41.75,
    previousClose: 39.2,
    volatility: 1.48,
    category: "rising",
    accent: "from-red-300 via-zinc-100 to-cyan-300",
    stats: {
      streamingGrowth: 16.4,
      youtubeGrowth: 14.9,
      searchGrowth: 19.8,
      socialGrowth: 28.6,
      newsScore: 57,
      traderDemand: 15.3
    },
    explanation: "KEN moved up as fan trading and social velocity improved.",
    historyBias: 3.6
  },
  {
    id: "bleood",
    name: "Bleood",
    ticker: "BLEOD",
    price: 7.85,
    previousClose: 6.4,
    volatility: 2.05,
    category: "underground",
    accent: "from-rose-300 via-emerald-200 to-stone-100",
    stats: {
      streamingGrowth: 42.6,
      youtubeGrowth: 26.3,
      searchGrowth: 48.1,
      socialGrowth: 64.4,
      newsScore: 43,
      traderDemand: 31.8
    },
    explanation: "BLEOD spiked as a low-price underground listing caught discovery momentum.",
    historyBias: 6.4
  },
  {
    id: "eminem",
    name: "Eminem",
    ticker: "EMNM",
    price: 118.5,
    previousClose: 116.9,
    volatility: 0.7,
    category: "superstar",
    accent: "from-stone-100 via-red-300 to-zinc-400",
    stats: {
      streamingGrowth: 2.6,
      youtubeGrowth: 4.1,
      searchGrowth: 5.5,
      socialGrowth: 3.8,
      newsScore: 56,
      traderDemand: 3.1
    },
    explanation: "EMNM edged higher on steady catalog strength and light trading demand.",
    historyBias: 0.8
  }
];

export function createInitialArtists(): Artist[] {
  return seeds.map((seed, index) => ({
    id: seed.id,
    name: seed.name,
    ticker: seed.ticker,
    currentPrice: seed.price,
    previousClose: seed.previousClose,
    dailyChangePercent: getDailyChangePercent(seed.price, seed.previousClose),
    hypeScore: calculateHypeScore(seed.stats),
    volatility: seed.volatility,
    category: seed.category,
    accent: seed.accent,
    stats: seed.stats,
    priceHistory: buildHistory(seed.price, seed.historyBias, index),
    lastMoveExplanation: seed.explanation
  }));
}

function buildHistory(currentPrice: number, bias: number, index: number): PricePoint[] {
  const points: PricePoint[] = [];
  const baseDate = new Date(`${BASE_DATE}T00:00:00`);

  for (let i = 27; i >= 0; i -= 1) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    const cycle = Math.sin((28 - i + index) / 2.4) * bias;
    const drift = (28 - i) * bias * 0.12;
    const price = roundPrice(currentPrice - drift - cycle);
    points.push({ date: date.toISOString().slice(0, 10), price });
  }

  points[points.length - 1].price = currentPrice;

  return points;
}
