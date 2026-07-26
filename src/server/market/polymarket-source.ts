import { clamp } from "@/lib/pricing";
import type { HypeStats, MarketForecastKind } from "@/lib/types";
import { normalizeArtistNameForMatch, scoreArtistNameMatch } from "@/server/market/artist-name-match";
import type { MarketUpdateArtist } from "@/server/market/daily-update";
import type { AdapterSignals, MarketObservation } from "@/server/market/market-data";

type PolymarketCollectOptions = {
  artists: MarketUpdateArtist[];
  runDate: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  searchQueries?: string[];
  previousPayloads?: Record<string, Record<string, unknown>>;
};

type PolymarketSearchResponse = {
  events?: unknown;
};

type PolymarketEventRow = {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  active?: unknown;
  closed?: unknown;
  markets?: unknown;
};

type PolymarketMarketRow = {
  id?: unknown;
  question?: unknown;
  groupItemTitle?: unknown;
  outcomes?: unknown;
  outcomePrices?: unknown;
  bestBid?: unknown;
  bestAsk?: unknown;
  lastTradePrice?: unknown;
  liquidity?: unknown;
  volume?: unknown;
  volume24hr?: unknown;
  oneDayPriceChange?: unknown;
  active?: unknown;
  closed?: unknown;
  acceptingOrders?: unknown;
  endDate?: unknown;
  createdAt?: unknown;
};

type ForecastDirection = "bullish_yes" | "bearish_yes" | "informational";

type EligibleContract = {
  marketId: string;
  eventId: string | null;
  eventTitle: string;
  eventSlug: string | null;
  question: string;
  groupItemTitle: string | null;
  probability: number;
  oneDayPriceChange: number | null;
  probabilityChangeSource: "polymarket_24h" | "previous_snapshot" | null;
  liquidity: number;
  volume: number;
  volume24hr: number;
  spread: number;
  endDate: string | null;
  createdAt: string | null;
  forecastKind: MarketForecastKind;
  direction: ForecastDirection;
  directionMultiplier: -1 | 0 | 1;
  artistOutlookProbability: number;
  artistOutlookChange: number | null;
  importanceWeight: number;
  horizonWeight: number;
  qualityScore: number;
  tracked: boolean;
  isNew: boolean;
  matchConfidence: number;
  signalEligible: boolean;
  signalEligibilityReason: string;
};

type ParsedContract = Pick<
  EligibleContract,
  | "marketId"
  | "eventId"
  | "eventTitle"
  | "eventSlug"
  | "question"
  | "groupItemTitle"
  | "probability"
  | "oneDayPriceChange"
  | "liquidity"
  | "volume"
  | "volume24hr"
  | "spread"
  | "endDate"
  | "createdAt"
>;

export type PolymarketMarketSignals = {
  signals: AdapterSignals;
  observations: MarketObservation[];
  warnings: string[];
};

const SOURCE = "polymarket";
const PROBABILITY = "music_market_probability";
const PROBABILITY_CHANGE = "music_market_probability_1d_change";
const LIQUIDITY = "music_market_liquidity";
const VOLUME = "music_market_volume";
const CONTRACT_COUNT = "music_market_contract_count";
const NEW_CONTRACT_COUNT = "music_market_new_contract_count";
const FORECAST_KIND_COUNT = "music_market_forecast_kind_count";
const GENERIC_ARTIST_NAMES = new Set(["future", "common", "logic", "offset", "ye"]);
const MIN_LIQUIDITY = 2000;
const MIN_VOLUME = 25000;
const MIN_DAILY_VOLUME = 250;
const MAX_SPREAD = 0.12;
const MIN_TRACKED_LIQUIDITY = 100;
const MIN_TRACKED_VOLUME = 500;
const MAX_TRACKED_SPREAD = 0.35;
const MIN_SIGNAL_CHANGE = 0.02;
const MAX_CONTRACTS_PER_ARTIST = 12;
const SEARCH_CONCURRENCY = 12;
const MUSIC_CONTEXT =
  /\b(album|song|single|track|music|spotify|billboard|grammy|stream(?:s|ed|ing)?|record|release|mixtape|ep|music video|hot 100|tour|concert|festival|collab(?:oration)?|feature|first[- ]week sales)\b/i;
const POSITIVE_MUSIC_OUTCOME =
  /\b(release|drop|album|song|single|track|music video|billboard|hot 100|grammy|award|win|top artist|top album|top song|most streamed|number one|#1|no\.?\s*1|sales|tour|concert|festival|collab(?:oration)?|feature)\b/i;
const INVERTED_OR_NEGATIVE_OUTCOME =
  /\b(not release|won't release|will not release|no new|without releasing|fewer than|less than|lowest|worst|flop|delay(?:ed)?|cancel(?:led|ed)?|miss(?:es)?|fail(?:s|ed)? to)\b/i;

export async function collectPolymarketMarketSignals({
  artists,
  runDate,
  timeoutMs = 15000,
  fetchImpl = fetch,
  searchQueries,
  previousPayloads = {}
}: PolymarketCollectOptions): Promise<PolymarketMarketSignals> {
  const queries = searchQueries ?? Array.from(new Set(artists.map((artist) => artist.name.trim()).filter(Boolean)));

  if (!artists.length || !queries.length) {
    return { signals: {}, observations: [], warnings: [] };
  }

  const search = await fetchMusicEvents({
    searchQueries: queries,
    timeoutMs,
    fetchImpl
  });

  if (!search.events.length) {
    return {
      signals: {},
      observations: [],
      warnings: search.warnings.length
        ? search.warnings
        : ["Polymarket returned no active music prediction markets."]
    };
  }

  const contractsByArtist = new Map<string, EligibleContract[]>();

  for (const event of search.events) {
    const eventTitle = getString(event.title) ?? "";

    if (event.active === false || event.closed === true) {
      continue;
    }

    const markets = Array.isArray(event.markets)
      ? event.markets.filter((value): value is PolymarketMarketRow => Boolean(value && typeof value === "object"))
      : [];

    for (const market of markets) {
      const contract = parseContract(event, market);

      if (!contract || !MUSIC_CONTEXT.test(`${eventTitle} ${contract.question}`)) {
        continue;
      }

      for (const artist of artists) {
        const match = matchArtistToContract(artist.name, contract);

        if (!match.matched) {
          continue;
        }

        const matchedContract = buildMatchedContract({
          contract,
          runDate,
          matchConfidence: match.confidence,
          previousPayload: previousPayloads[artist.id]
        });
        const eligibility = getSignalEligibility(matchedContract);
        matchedContract.signalEligible = eligibility.eligible;
        matchedContract.signalEligibilityReason = eligibility.reason;
        const current = contractsByArtist.get(artist.id) ?? [];

        if (!current.some((item) => item.marketId === matchedContract.marketId)) {
          current.push(matchedContract);
          contractsByArtist.set(artist.id, current);
        }
      }
    }
  }

  const signals: AdapterSignals = {};
  const observations: MarketObservation[] = [];
  let suppressedContractCount = 0;

  for (const artist of artists) {
    const matchedContracts = (contractsByArtist.get(artist.id) ?? [])
      .sort((a, b) => getContractWeight(b) - getContractWeight(a))
      .slice(0, MAX_CONTRACTS_PER_ARTIST);

    if (!matchedContracts.length) {
      continue;
    }

    const trackedContracts = matchedContracts.filter((contract) => contract.tracked);
    const signalContracts = trackedContracts.filter((contract) => contract.signalEligible);
    suppressedContractCount += matchedContracts.length - signalContracts.length;
    const probability = weightedAverage(trackedContracts, (contract) => contract.artistOutlookProbability);
    const probabilityChange = weightedAverage(
      signalContracts.filter((contract) => typeof contract.artistOutlookChange === "number"),
      (contract) => contract.artistOutlookChange ?? 0
    );
    const influenceMovement = calculateInfluenceMovement(signalContracts);
    const totalLiquidity = trackedContracts.reduce((total, contract) => total + contract.liquidity, 0);
    const totalVolume = trackedContracts.reduce((total, contract) => total + contract.volume, 0);
    const newContractCount = trackedContracts.filter((contract) => contract.isNew).length;
    const forecastKindCount = new Set(trackedContracts.map((contract) => contract.forecastKind)).size;
    const signalEligible =
      typeof influenceMovement === "number" &&
      Math.abs(influenceMovement) >= MIN_SIGNAL_CHANGE;
    const traderDemand = signalEligible
      ? clamp(influenceMovement * 100 * 1.2, -10, 10)
      : null;
    const stats: Partial<HypeStats> =
      typeof traderDemand === "number" ? { traderDemand } : {};
    const rawPayload = {
      source: SOURCE,
      runDate,
      status: typeof traderDemand === "number" ? "momentum" : "baseline_only",
      interpretation: "classified_music_forecasts_and_liquidity_filtered_probability_movement",
      matchedContractCount: matchedContracts.length,
      trackedContractCount: trackedContracts.length,
      signalContractCount: signalContracts.length,
      newContractCount,
      forecastKindCount,
      probability,
      probabilityChange,
      influenceMovement,
      totalLiquidity: round(totalLiquidity),
      totalVolume: round(totalVolume),
      traderDemand,
      contracts: matchedContracts.map(toContractPayload)
    };

    signals[artist.id] = {
      stats,
      confidence: getConfidence(signalContracts, probabilityChange),
      rawPayload
    };

    if (typeof probability === "number") {
      observations.push(createObservation(artist.id, runDate, PROBABILITY, probability * 100, "percent", rawPayload));
    }

    if (typeof probabilityChange === "number") {
      observations.push(
        createObservation(artist.id, runDate, PROBABILITY_CHANGE, probabilityChange * 100, "percentage_points", rawPayload)
      );
    }

    observations.push(
      createObservation(artist.id, runDate, LIQUIDITY, totalLiquidity, "usd", rawPayload),
      createObservation(artist.id, runDate, VOLUME, totalVolume, "usd", rawPayload),
      createObservation(artist.id, runDate, CONTRACT_COUNT, trackedContracts.length, "contracts", rawPayload),
      createObservation(artist.id, runDate, NEW_CONTRACT_COUNT, newContractCount, "contracts", rawPayload),
      createObservation(artist.id, runDate, FORECAST_KIND_COUNT, forecastKindCount, "forecast_types", rawPayload)
    );
  }

  const warnings = [...search.warnings];

  if (suppressedContractCount > 0) {
    warnings.push(
      `Kept ${suppressedContractCount} Polymarket contract${suppressedContractCount === 1 ? "" : "s"} out of pricing because of relevance, liquidity, activity, or spread safeguards.`
    );
  }

  return { signals, observations, warnings };
}

async function fetchMusicEvents({
  searchQueries,
  timeoutMs,
  fetchImpl
}: {
  searchQueries: string[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
}) {
  const requests = await mapWithConcurrency(searchQueries, SEARCH_CONCURRENCY, async (query) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const params = new URLSearchParams({
        q: query,
        events_status: "active",
        limit_per_type: "25",
        sort: "volume",
        ascending: "false",
        search_profiles: "false",
        search_tags: "false"
      });
      const response = await fetchImpl(`https://gamma-api.polymarket.com/public-search?${params}`, {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "rap-market-index/0.1 market research"
        }
      });
      const text = await response.text();

      if (!response.ok) {
        return {
          query,
          events: [] as PolymarketEventRow[],
          warning: `Polymarket search for "${query}" failed with ${response.status}: ${text.slice(0, 120)}`
        };
      }

      const value = JSON.parse(text) as PolymarketSearchResponse;
      const events = Array.isArray(value.events)
        ? value.events.filter((event): event is PolymarketEventRow => Boolean(event && typeof event === "object"))
        : [];

      return { query, events, warning: null };
    } catch (error) {
      return {
        query,
        events: [] as PolymarketEventRow[],
        warning: `Polymarket search for "${query}" failed: ${getErrorMessage(error)}`
      };
    } finally {
      clearTimeout(timeout);
    }
  });
  const deduped = new Map<string, PolymarketEventRow>();

  for (const result of requests) {
    for (const event of result.events) {
      const key = getString(event.id) ?? getString(event.slug) ?? getString(event.title);

      if (key) {
        deduped.set(key, event);
      }
    }
  }

  return {
    events: Array.from(deduped.values()),
    warnings: requests.flatMap((result) => result.warning ? [result.warning] : [])
  };
}

function parseContract(event: PolymarketEventRow, market: PolymarketMarketRow): ParsedContract | null {
  const marketId = getString(market.id);
  const question = getString(market.question);
  const probability = getYesProbability(market);
  const liquidity = getNumber(market.liquidity);
  const volume = getNumber(market.volume);
  const volume24hr = getNumber(market.volume24hr) ?? 0;
  const bestBid = getNumber(market.bestBid);
  const bestAsk = getNumber(market.bestAsk);

  if (
    !marketId ||
    !question ||
    typeof probability !== "number" ||
    typeof liquidity !== "number" ||
    typeof volume !== "number" ||
    market.active === false ||
    market.closed === true ||
    market.acceptingOrders === false
  ) {
    return null;
  }

  return {
    marketId,
    eventId: getString(event.id),
    eventTitle: getString(event.title) ?? "",
    eventSlug: getString(event.slug),
    question,
    groupItemTitle: getString(market.groupItemTitle),
    probability,
    oneDayPriceChange: getNumber(market.oneDayPriceChange),
    liquidity,
    volume,
    volume24hr,
    endDate: getString(market.endDate),
    createdAt: getString(market.createdAt),
    spread:
      typeof bestBid === "number" && typeof bestAsk === "number"
        ? Math.max(0, bestAsk - bestBid)
        : 1
  };
}

function buildMatchedContract({
  contract,
  runDate,
  matchConfidence,
  previousPayload
}: {
  contract: ParsedContract;
  runDate: string;
  matchConfidence: number;
  previousPayload?: Record<string, unknown>;
}): EligibleContract {
  const previous = getPreviousContract(previousPayload, contract.marketId);
  const officialChange = contract.oneDayPriceChange;
  const snapshotChange =
    typeof previous?.probability === "number"
      ? contract.probability - previous.probability
      : null;
  const oneDayPriceChange =
    typeof officialChange === "number"
      ? officialChange
      : snapshotChange;
  const probabilityChangeSource =
    typeof officialChange === "number"
      ? "polymarket_24h"
      : typeof snapshotChange === "number"
        ? "previous_snapshot"
        : null;
  const forecastKind = getForecastKind(`${contract.eventTitle} ${contract.question}`);
  const direction = getForecastDirection(contract.question);
  const directionMultiplier = direction === "bullish_yes" ? 1 : direction === "bearish_yes" ? -1 : 0;
  const tracked =
    contract.liquidity >= MIN_TRACKED_LIQUIDITY &&
    contract.volume >= MIN_TRACKED_VOLUME &&
    contract.spread <= MAX_TRACKED_SPREAD &&
    contract.probability > 0.005 &&
    contract.probability < 0.995;
  const importanceWeight = getForecastImportance(forecastKind);
  const horizonWeight = getHorizonWeight(runDate, contract.endDate);
  const qualityScore = getForecastQuality({
    ...contract,
    matchConfidence
  });
  const hasPreviousSnapshot = Array.isArray(previousPayload?.contracts);

  return {
    ...contract,
    oneDayPriceChange,
    probabilityChangeSource,
    forecastKind,
    direction,
    directionMultiplier,
    artistOutlookProbability:
      directionMultiplier === -1 ? 1 - contract.probability : contract.probability,
    artistOutlookChange:
      directionMultiplier === 0 || typeof oneDayPriceChange !== "number"
        ? null
        : oneDayPriceChange * directionMultiplier,
    importanceWeight,
    horizonWeight,
    qualityScore,
    tracked,
    isNew: hasPreviousSnapshot && !previous,
    matchConfidence,
    signalEligible: false,
    signalEligibilityReason: "not_evaluated"
  };
}

function getPreviousContract(payload: Record<string, unknown> | undefined, marketId: string) {
  if (!Array.isArray(payload?.contracts)) {
    return null;
  }

  for (const value of payload.contracts) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const contract = value as Record<string, unknown>;

    if (getString(contract.marketId) === marketId) {
      return {
        probability: getNumber(contract.probability)
      };
    }
  }

  return null;
}

function getForecastKind(value: string): MarketForecastKind {
  if (/\b(grammy|award|aoty|album of the year|song of the year|record of the year)\b/i.test(value)) {
    return "award";
  }

  if (/#\s*1\b|\b(billboard|hot 100|number one|no\.?\s*1|top album|top song|chart)\b/i.test(value)) {
    return "chart";
  }

  if (/\b(first[- ]week sales|album sales|sell \d|sales)\b/i.test(value)) {
    return "sales";
  }

  if (/\b(spotify|stream(?:s|ed|ing)?|monthly listeners|top artist|most listened)\b/i.test(value)) {
    return "streaming";
  }

  if (/\b(collab(?:oration)?|feature|featured on|joint album)\b/i.test(value)) {
    return "collaboration";
  }

  if (/\b(tour|concert|festival|headline|headliner|perform live)\b/i.test(value)) {
    return "tour";
  }

  if (/\b(release|drop|album|song|single|track|mixtape|ep|music video)\b/i.test(value)) {
    return "release";
  }

  return "other";
}

function getForecastDirection(question: string): ForecastDirection {
  if (INVERTED_OR_NEGATIVE_OUTCOME.test(question)) {
    return "bearish_yes";
  }

  if (POSITIVE_MUSIC_OUTCOME.test(question)) {
    return "bullish_yes";
  }

  return "informational";
}

function getForecastImportance(kind: MarketForecastKind) {
  const weights: Record<MarketForecastKind, number> = {
    release: 0.62,
    chart: 0.92,
    award: 0.86,
    streaming: 0.78,
    sales: 0.82,
    collaboration: 0.46,
    tour: 0.52,
    other: 0.3
  };

  return weights[kind];
}

function getHorizonWeight(runDate: string, endDate: string | null) {
  if (!endDate) {
    return 0.5;
  }

  const start = new Date(`${runDate}T00:00:00.000Z`).getTime();
  const end = new Date(endDate).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0.5;
  }

  const days = Math.max(0, (end - start) / 86_400_000);

  if (days <= 30) {
    return 1;
  }

  if (days <= 90) {
    return 0.86;
  }

  if (days <= 180) {
    return 0.72;
  }

  if (days <= 365) {
    return 0.58;
  }

  return 0.42;
}

function getForecastQuality(
  contract: Pick<EligibleContract, "liquidity" | "volume" | "volume24hr" | "spread" | "matchConfidence">
) {
  const liquidity = clamp(Math.log10(contract.liquidity + 1) / 5, 0, 1);
  const volume = clamp(Math.log10(contract.volume + 1) / 7, 0, 1);
  const activity = clamp(Math.log10(contract.volume24hr + 1) / 5, 0, 1);
  const spread = clamp(1 - contract.spread / MAX_TRACKED_SPREAD, 0, 1);

  return clamp(
    liquidity * 0.27 +
      volume * 0.25 +
      activity * 0.18 +
      spread * 0.18 +
      contract.matchConfidence * 0.12,
    0,
    1
  );
}

function matchArtistToContract(
  artistName: string,
  contract: Pick<EligibleContract, "groupItemTitle" | "question">
) {
  const normalizedArtist = normalizeArtistNameForMatch(artistName);
  const groupTitle = contract.groupItemTitle?.trim();

  if (groupTitle) {
    const groupMatch = scoreArtistNameMatch(artistName, groupTitle);
    const requiresStrictLabel =
      normalizedArtist.length <= 3 || GENERIC_ARTIST_NAMES.has(normalizedArtist);

    return {
      matched:
        groupMatch.confidence >= 0.7 &&
        (!requiresStrictLabel || hasStrictArtistLabel(artistName, groupTitle)),
      confidence: groupMatch.confidence
    };
  }

  if (normalizedArtist.length <= 3 || GENERIC_ARTIST_NAMES.has(normalizedArtist)) {
    return { matched: false, confidence: 0 };
  }

  const questionMatch = scoreArtistNameMatch(artistName, contract.question);

  return {
    matched: questionMatch.confidence >= 0.78,
    confidence: questionMatch.confidence
  };
}

function hasStrictArtistLabel(artistName: string, candidate: string) {
  const normalizedArtist = normalizeArtistNameForMatch(artistName);
  const normalizedCandidate = normalizeArtistNameForMatch(candidate);

  if (normalizedArtist === normalizedCandidate) {
    return true;
  }

  const escapedArtist = artistName
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rawCandidate = candidate.trim().toLowerCase();

  return new RegExp(`^(?:["']\\s*)?${escapedArtist}\\s*(?:-|–|—|:)`).test(rawCandidate) ||
    new RegExp(`(?:-|–|—|:)\\s*${escapedArtist}(?:\\s*["'])?$`).test(rawCandidate);
}

function getSignalEligibility(contract: EligibleContract) {
  if (!contract.tracked) {
    return { eligible: false, reason: "below_tracking_quality" };
  }

  if (contract.liquidity < MIN_LIQUIDITY) {
    return { eligible: false, reason: "insufficient_liquidity" };
  }

  if (contract.volume < MIN_VOLUME) {
    return { eligible: false, reason: "insufficient_lifetime_volume" };
  }

  if (contract.volume24hr < MIN_DAILY_VOLUME) {
    return { eligible: false, reason: "insufficient_recent_activity" };
  }

  if (contract.spread > MAX_SPREAD) {
    return { eligible: false, reason: "wide_spread" };
  }

  if (contract.probability <= 0.02 || contract.probability >= 0.98) {
    return { eligible: false, reason: "near_resolved_probability" };
  }

  if (contract.direction === "informational") {
    return { eligible: false, reason: "ambiguous_price_direction" };
  }

  if (contract.isNew && contract.probabilityChangeSource !== "polymarket_24h") {
    return { eligible: false, reason: "new_contract_baseline" };
  }

  if (typeof contract.artistOutlookChange !== "number") {
    return { eligible: false, reason: "no_daily_probability_change" };
  }

  return { eligible: true, reason: "eligible" };
}

function getYesProbability(market: PolymarketMarketRow) {
  const outcomes = parseStringArray(market.outcomes);
  const prices = parseStringArray(market.outcomePrices).map((value) => Number(value));
  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
  const value = yesIndex >= 0 ? prices[yesIndex] : null;

  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }

  const lastTradePrice = getNumber(market.lastTradePrice);

  return outcomes[0]?.toLowerCase() === "yes" &&
    typeof lastTradePrice === "number" &&
    lastTradePrice >= 0 &&
    lastTradePrice <= 1
    ? lastTradePrice
    : null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function weightedAverage(
  contracts: EligibleContract[],
  getValue: (contract: EligibleContract) => number
) {
  if (!contracts.length) {
    return null;
  }

  const totals = contracts.reduce((memo, contract) => {
    const weight = getContractWeight(contract);

    return {
      value: memo.value + getValue(contract) * weight,
      weight: memo.weight + weight
    };
  }, { value: 0, weight: 0 });

  return totals.weight > 0 ? totals.value / totals.weight : null;
}

function calculateInfluenceMovement(contracts: EligibleContract[]) {
  const bestByEventAndKind = new Map<string, EligibleContract>();

  for (const contract of contracts) {
    if (typeof contract.artistOutlookChange !== "number") {
      continue;
    }

    const key = `${contract.eventId ?? contract.marketId}:${contract.forecastKind}`;
    const existing = bestByEventAndKind.get(key);

    if (!existing || getContractWeight(contract) > getContractWeight(existing)) {
      bestByEventAndKind.set(key, contract);
    }
  }

  const byKind = new Map<MarketForecastKind, EligibleContract[]>();

  for (const contract of bestByEventAndKind.values()) {
    const current = byKind.get(contract.forecastKind) ?? [];
    current.push(contract);
    byKind.set(contract.forecastKind, current);
  }

  if (!byKind.size) {
    return null;
  }

  let total = 0;
  let totalWeight = 0;

  for (const contractsOfKind of byKind.values()) {
    const kindMovement = weightedAverage(
      contractsOfKind,
      (contract) =>
        (contract.artistOutlookChange ?? 0) *
        contract.importanceWeight *
        contract.horizonWeight
    );

    if (typeof kindMovement !== "number") {
      continue;
    }

    const kindWeight = Math.max(...contractsOfKind.map(getContractWeight));
    total += kindMovement * kindWeight;
    totalWeight += kindWeight;
  }

  return totalWeight > 0 ? total / totalWeight : null;
}

function getContractWeight(
  contract: Pick<EligibleContract, "qualityScore" | "importanceWeight" | "matchConfidence">
) {
  return clamp(
    contract.qualityScore *
      (0.7 + contract.importanceWeight * 0.2 + contract.matchConfidence * 0.1),
    0.05,
    1
  );
}

function getConfidence(contracts: EligibleContract[], probabilityChange: number | null) {
  if (!contracts.length || typeof probabilityChange !== "number") {
    return 0.15;
  }

  const averageWeight = contracts.reduce((total, contract) => total + getContractWeight(contract), 0) / contracts.length;
  const breadth = clamp(contracts.length / 4, 0.25, 1);

  return clamp(0.18 + averageWeight * 0.18 + breadth * 0.08, 0.18, 0.44);
}

function toContractPayload(contract: EligibleContract) {
  return {
    marketId: contract.marketId,
    eventId: contract.eventId,
    eventTitle: contract.eventTitle,
    eventUrl: contract.eventSlug ? `https://polymarket.com/event/${contract.eventSlug}` : null,
    question: contract.question,
    groupItemTitle: contract.groupItemTitle,
    probability: contract.probability,
    artistOutlookProbability: contract.artistOutlookProbability,
    oneDayPriceChange: contract.oneDayPriceChange,
    artistOutlookChange: contract.artistOutlookChange,
    probabilityChangeSource: contract.probabilityChangeSource,
    liquidity: round(contract.liquidity),
    volume: round(contract.volume),
    volume24hr: round(contract.volume24hr),
    spread: contract.spread,
    endDate: contract.endDate,
    createdAt: contract.createdAt,
    forecastKind: contract.forecastKind,
    direction: contract.direction,
    importanceWeight: contract.importanceWeight,
    horizonWeight: contract.horizonWeight,
    qualityScore: contract.qualityScore,
    tracked: contract.tracked,
    isNew: contract.isNew,
    matchConfidence: contract.matchConfidence,
    signalEligible: contract.signalEligible,
    signalEligibilityReason: contract.signalEligibilityReason
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker())
  );

  return results;
}

function createObservation(
  artistId: string,
  observedDate: string,
  metric: string,
  value: number,
  unit: string,
  rawPayload: Record<string, unknown>
): MarketObservation {
  return {
    artistId,
    source: SOURCE,
    metric,
    observedDate,
    value,
    unit,
    rawPayload
  };
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown request error";
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
