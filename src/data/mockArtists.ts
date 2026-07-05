import { calculateHypeScore, clamp, getDailyChangePercent, roundPrice } from "@/lib/pricing";
import type { Artist, HypeStats, PricePoint } from "@/lib/types";

type RosterSeed = {
  id: string;
  name: string;
  ticker: string;
  price: number;
  previousClose: number;
  volatility: number;
  category: Artist["category"];
  historyBias: number;
};

const BASE_DATE = "2026-07-03";

const accents = [
  "from-fuchsia-300 via-lime-200 to-cyan-300",
  "from-sky-300 via-pink-200 to-yellow-200",
  "from-lime-300 via-cyan-200 to-zinc-100",
  "from-rose-300 via-emerald-200 to-stone-100",
  "from-violet-300 via-zinc-100 to-emerald-300",
  "from-red-300 via-zinc-100 to-cyan-300",
  "from-blue-300 via-stone-100 to-emerald-300",
  "from-amber-200 via-fuchsia-200 to-cyan-300"
];

const roster: RosterSeed[] = [
  { id: "drake", name: "Drake", ticker: "DRAKE", price: 132.45, previousClose: 134.1, volatility: 0.76, category: "superstar", historyBias: 0.9 },
  { id: "kendrick-lamar", name: "Kendrick Lamar", ticker: "KDOT", price: 118.8, previousClose: 115.6, volatility: 0.82, category: "superstar", historyBias: 1 },
  { id: "travis-scott", name: "Travis Scott", ticker: "TRAVIS", price: 124.7, previousClose: 121.2, volatility: 0.92, category: "superstar", historyBias: 1.1 },
  { id: "ye", name: "Ye", ticker: "YE", price: 110.5, previousClose: 112.2, volatility: 0.9, category: "superstar", historyBias: 1.2 },
  { id: "eminem", name: "Eminem", ticker: "EMNM", price: 118.5, previousClose: 116.9, volatility: 0.7, category: "superstar", historyBias: 0.8 },
  { id: "jay-z", name: "Jay-Z", ticker: "JAYZ", price: 121.3, previousClose: 120.5, volatility: 0.68, category: "superstar", historyBias: 0.7 },
  { id: "tyler-the-creator", name: "Tyler, The Creator", ticker: "TYLER", price: 116.3, previousClose: 114.7, volatility: 0.8, category: "superstar", historyBias: 0.9 },
  { id: "future", name: "Future", ticker: "FUTR", price: 88.2, previousClose: 84.7, volatility: 1.02, category: "mainstream", historyBias: 1.9 },
  { id: "playboi-carti", name: "Playboi Carti", ticker: "CARTI", price: 91.4, previousClose: 97.2, volatility: 1.28, category: "mainstream", historyBias: 2.6 },
  { id: "don-toliver", name: "Don Toliver", ticker: "DON", price: 74.25, previousClose: 72, volatility: 1.1, category: "mainstream", historyBias: 1.8 },
  { id: "youngboy-never-broke-again", name: "YoungBoy Never Broke Again", ticker: "YB", price: 67.2, previousClose: 65.4, volatility: 1.18, category: "mainstream", historyBias: 2.2 },
  { id: "lil-uzi-vert", name: "Lil Uzi Vert", ticker: "UZI", price: 76.4, previousClose: 74.9, volatility: 1.05, category: "mainstream", historyBias: 1.7 },
  { id: "central-cee", name: "Central Cee", ticker: "CENCH", price: 63.7, previousClose: 61.9, volatility: 1.14, category: "mainstream", historyBias: 2 },
  { id: "asap-rocky", name: "A$AP Rocky", ticker: "ASAP", price: 72.4, previousClose: 70.8, volatility: 1.02, category: "mainstream", historyBias: 1.6 },
  { id: "lil-yachty", name: "Lil Yachty", ticker: "YACHTY", price: 58.5, previousClose: 56.8, volatility: 1.2, category: "mainstream", historyBias: 2.3 },
  { id: "young-thug", name: "Young Thug", ticker: "THUG", price: 82.1, previousClose: 79.8, volatility: 1.05, category: "mainstream", historyBias: 1.8 },
  { id: "lil-baby", name: "Lil Baby", ticker: "LBABY", price: 73.2, previousClose: 71.1, volatility: 1.08, category: "mainstream", historyBias: 1.9 },
  { id: "gunna", name: "Gunna", ticker: "GUNNA", price: 70.5, previousClose: 68.6, volatility: 1.04, category: "mainstream", historyBias: 1.7 },
  { id: "yeat", name: "Yeat", ticker: "YEAT", price: 52.6, previousClose: 48.7, volatility: 1.42, category: "rising", historyBias: 3.1 },
  { id: "ken-carson", name: "Ken Carson", ticker: "KEN", price: 41.75, previousClose: 39.2, volatility: 1.48, category: "rising", historyBias: 3.6 },
  { id: "baby-keem", name: "Baby Keem", ticker: "KEEM", price: 54.3, previousClose: 52.1, volatility: 1.24, category: "rising", historyBias: 2.8 },
  { id: "sexyy-red", name: "Sexyy Red", ticker: "SEXYY", price: 39.8, previousClose: 41, volatility: 1.42, category: "rising", historyBias: 3.3 },
  { id: "doechii", name: "Doechii", ticker: "DOECHII", price: 47.6, previousClose: 45.3, volatility: 1.38, category: "rising", historyBias: 3.2 },
  { id: "destroy-lonely", name: "Destroy Lonely", ticker: "LONE", price: 29.4, previousClose: 30.2, volatility: 1.65, category: "rising", historyBias: 4.1 },
  { id: "lucki", name: "Lucki", ticker: "LUCKI", price: 36.9, previousClose: 34.5, volatility: 1.42, category: "rising", historyBias: 3.5 },
  { id: "jid", name: "JID", ticker: "JID", price: 43.6, previousClose: 42.2, volatility: 1.32, category: "rising", historyBias: 3 },
  { id: "flo-milli", name: "Flo Milli", ticker: "FLO", price: 35.4, previousClose: 33.8, volatility: 1.5, category: "rising", historyBias: 3.8 },
  { id: "ian", name: "ian", ticker: "IAN", price: 44.8, previousClose: 42.3, volatility: 1.52, category: "rising", historyBias: 3.6 },
  { id: "2hollis", name: "2hollis", ticker: "2HOL", price: 31.6, previousClose: 29.9, volatility: 1.68, category: "rising", historyBias: 4.3 },
  { id: "homixide-gang", name: "Homixide Gang", ticker: "HXG", price: 34.2, previousClose: 32.6, volatility: 1.62, category: "rising", historyBias: 3.9 },
  { id: "jane-remover", name: "Jane Remover", ticker: "JANE", price: 22.5, previousClose: 21.4, volatility: 1.72, category: "rising", historyBias: 4.4 },
  { id: "osamason", name: "Osamason", ticker: "OSAMA", price: 24.65, previousClose: 21.8, volatility: 1.82, category: "underground", historyBias: 5.2 },
  { id: "fakemink", name: "Fakemink", ticker: "FAKEM", price: 12.4, previousClose: 11.75, volatility: 1.95, category: "underground", historyBias: 5.9 },
  { id: "lucy-bedrouqe", name: "Lucy Bedrouqe", ticker: "LUCYB", price: 9.85, previousClose: 10.2, volatility: 1.88, category: "underground", historyBias: 5.5 },
  { id: "nettspend", name: "Nettspend", ticker: "NETT", price: 27.3, previousClose: 25.1, volatility: 1.78, category: "underground", historyBias: 4.9 },
  { id: "che", name: "Che", ticker: "CHE", price: 18.4, previousClose: 16.2, volatility: 1.74, category: "underground", historyBias: 4.8 },
  { id: "jaydes", name: "Jaydes", ticker: "JAYDES", price: 14.25, previousClose: 15.1, volatility: 1.92, category: "underground", historyBias: 5.7 },
  { id: "esdeekid", name: "EsDeeKid", ticker: "ESDEE", price: 10.6, previousClose: 9.7, volatility: 2.02, category: "underground", historyBias: 6.1 },
  { id: "1oneam", name: "1oneam", ticker: "1ONEAM", price: 8.95, previousClose: 8.1, volatility: 2.08, category: "underground", historyBias: 6.3 },
  { id: "duwap-kaine", name: "Duwap Kaine", ticker: "DUWAP", price: 13.75, previousClose: 13.1, volatility: 1.9, category: "underground", historyBias: 5.4 },
  { id: "autumn", name: "Autumn", ticker: "AUTUMN", price: 16.8, previousClose: 15.95, volatility: 1.86, category: "underground", historyBias: 5.1 },
  { id: "molly-santana", name: "Molly Santana", ticker: "MOLLY", price: 15.3, previousClose: 14.05, volatility: 1.94, category: "underground", historyBias: 5.8 },
  { id: "tana", name: "Tana", ticker: "TANA", price: 17.45, previousClose: 18.3, volatility: 1.88, category: "underground", historyBias: 5.2 },
  { id: "2slimey", name: "2slimey", ticker: "2SLIME", price: 7.4, previousClose: 6.95, volatility: 2.15, category: "underground", historyBias: 6.7 },
  { id: "nine-vicious", name: "Nine Vicious", ticker: "NINEV", price: 6.85, previousClose: 7.1, volatility: 2.12, category: "underground", historyBias: 6.6 },
  { id: "yung-fazo", name: "Yung Fazo", ticker: "FAZO", price: 11.3, previousClose: 12.1, volatility: 1.92, category: "underground", historyBias: 5.8 },
  { id: "feng", name: "Feng", ticker: "FENG", price: 5.95, previousClose: 5.5, volatility: 2.2, category: "underground", historyBias: 7.1 },
  { id: "bleood", name: "Bleood", ticker: "BLEOD", price: 7.85, previousClose: 6.4, volatility: 2.05, category: "underground", historyBias: 6.4 },
  { id: "slayr", name: "Slayr", ticker: "SLAYR", price: 8.6, previousClose: 8.25, volatility: 2.06, category: "underground", historyBias: 6.2 },
  { id: "boolymon", name: "Boolymon", ticker: "BOOLY", price: 9.25, previousClose: 8.8, volatility: 2, category: "underground", historyBias: 5.9 },
  { id: "lazerdim700", name: "Lazer Dim 700", ticker: "LZR700", price: 19.75, previousClose: 17.9, volatility: 1.98, category: "underground", historyBias: 6 },
  { id: "protect", name: "Protect", ticker: "PRTCT", price: 6.7, previousClose: 6.45, volatility: 2.12, category: "underground", historyBias: 6.6 },
  { id: "xaviersobased", name: "xaviersobased", ticker: "XAVIER", price: 12.95, previousClose: 12.2, volatility: 1.96, category: "underground", historyBias: 5.6 },
  { id: "prettifun", name: "prettifun", ticker: "PRETTY", price: 6.25, previousClose: 5.85, volatility: 2.18, category: "underground", historyBias: 7 },
  { id: "babychiefdoit", name: "BabyChiefDoIt", ticker: "BCDOIT", price: 8.2, previousClose: 7.7, volatility: 2.14, category: "underground", historyBias: 6.8 }
];

export function createInitialArtists(): Artist[] {
  return roster.map((seed, index) => {
    const stats = buildStats(index, seed.volatility);

    return {
      id: seed.id,
      name: seed.name,
      ticker: seed.ticker,
      currentPrice: seed.price,
      previousClose: seed.previousClose,
      dailyChangePercent: getDailyChangePercent(seed.price, seed.previousClose),
      hypeScore: calculateHypeScore(stats),
      volatility: seed.volatility,
      category: seed.category,
      accent: accents[index % accents.length],
      stats,
      priceHistory: buildHistory(seed.price, seed.historyBias, index),
      lastMoveExplanation: `${seed.ticker} moved as audience momentum, media activity, and trading demand shifted.`
    };
  });
}

function buildStats(index: number, volatility: number): HypeStats {
  const wave = Math.sin((index + 1) * 1.7);
  const counterWave = Math.cos((index + 2) * 1.15);
  const momentum = 8 + (index % 6) * 4 + volatility * 5;

  return {
    streamingGrowth: roundSignal(momentum + wave * 6),
    youtubeGrowth: roundSignal(momentum * 0.65 + counterWave * 5),
    searchGrowth: roundSignal(momentum * 0.9 + ((index % 4) - 1) * 7),
    socialGrowth: roundSignal(momentum * 1.1 + wave * 10),
    newsScore: roundSignal(48 + (index % 5) * 4 + counterWave * 5),
    traderDemand: roundSignal(((index % 7) - 3) * 4 + wave * 8)
  };
}

function roundSignal(value: number) {
  return Math.round(clamp(value, -35, 95) * 10) / 10;
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
