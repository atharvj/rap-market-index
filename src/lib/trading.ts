export const STARTING_CASH = 25_000;
export const TRADE_COMMISSION_RATE = 0.01;
export const MIN_COMMISSION_PER_SHARE = 0.02;
export const MIN_TRADE_COMMISSION = 0.01;
export const MIN_TRADE_VALUE = 1;
export const MAX_TRADE_SHARES = 1_000_000;
const SHARE_QUANTITY_PRECISION = 1_000_000;

export type MarketMakerSide = "buy" | "sell";

export type MarketMakerQuoteEstimate = {
  midPrice: number;
  bidPrice: number;
  askPrice: number;
  buyExecutionPrice: number;
  sellExecutionPrice: number;
  executionPrice: number;
  spreadPercent: number;
  slippagePercent: number;
  liquidityScore: number;
  orderValue: number;
  commission: number;
  totalCost: number;
  netProceeds: number;
};

export function estimateTradeCommission(orderValue: number, shares: number) {
  if (!Number.isFinite(orderValue) || !Number.isFinite(shares) || orderValue <= 0 || shares <= 0) {
    return 0;
  }

  return roundMoney(
    Math.max(orderValue * TRADE_COMMISSION_RATE, shares * MIN_COMMISSION_PER_SHARE, MIN_TRADE_COMMISSION)
  );
}

export function estimateTradeTotal(orderValue: number, shares: number) {
  return roundMoney(orderValue + estimateTradeCommission(orderValue, shares));
}

export function estimateMarketMakerQuote({
  side,
  midPrice,
  shares,
  volatility = 1
}: {
  side: MarketMakerSide;
  midPrice: number;
  shares: number;
  volatility?: number;
}): MarketMakerQuoteEstimate {
  const cleanMidPrice = Math.max(1, Number.isFinite(midPrice) ? midPrice : 1);
  const cleanShares = Math.max(0, Number.isFinite(shares) ? shares : 0);
  const cleanVolatility = Math.max(0.5, Number.isFinite(volatility) ? volatility : 1);
  const priceSpread =
    cleanMidPrice < 10 ? 0.006 : cleanMidPrice < 25 ? 0.004 : cleanMidPrice < 50 ? 0.0025 : 0.0015;
  const spread = clamp(0.004 + cleanVolatility * 0.003 + priceSpread, 0.006, 0.035);
  const liquidityBase = clamp(90000 / cleanVolatility + cleanMidPrice * 350, 10000, 160000);
  const referenceOrderValue = cleanShares * cleanMidPrice;
  const slippage = Math.min(
    0.018,
    Math.pow(Math.max(referenceOrderValue / liquidityBase, 0), 0.7) * 0.0032 * cleanVolatility
  );
  const bidPrice = roundMoney(Math.max(1, cleanMidPrice * (1 - spread / 2)));
  const askPrice = roundMoney(Math.max(1, cleanMidPrice * (1 + spread / 2)));
  const buyExecutionPrice = roundMoney(Math.max(1, cleanMidPrice * (1 + spread / 2 + slippage)));
  const sellExecutionPrice = roundMoney(Math.max(1, cleanMidPrice * (1 - spread / 2 - slippage)));
  const executionPrice = side === "buy" ? buyExecutionPrice : sellExecutionPrice;
  const orderValue = roundMoney(cleanShares * executionPrice);
  const commission = estimateTradeCommission(orderValue, cleanShares);

  return {
    midPrice: roundMoney(cleanMidPrice),
    bidPrice,
    askPrice,
    buyExecutionPrice,
    sellExecutionPrice,
    executionPrice,
    spreadPercent: roundPercent(spread * 100),
    slippagePercent: roundPercent(slippage * 100),
    liquidityScore: roundPercent(
      clamp(100 - spread * 1300 - slippage * 900 - Math.max(cleanVolatility - 1, 0) * 10, 1, 100)
    ),
    orderValue,
    commission,
    totalCost: roundMoney(orderValue + commission),
    netProceeds: roundMoney(Math.max(0, orderValue - commission))
  };
}

export function getMaximumBuyShares({
  cashBalance,
  remainingPositionValue,
  midPrice,
  volatility = 1
}: {
  cashBalance: number;
  remainingPositionValue: number;
  midPrice: number;
  volatility?: number;
}) {
  const availableCash = Math.max(0, Number.isFinite(cashBalance) ? cashBalance : 0);
  const availablePositionValue = Math.max(
    0,
    Number.isFinite(remainingPositionValue) ? remainingPositionValue : 0
  );
  const cleanMidPrice = Math.max(1, Number.isFinite(midPrice) ? midPrice : 1);
  let lowerBound = 0;
  let upperBound = Math.min(
    MAX_TRADE_SHARES,
    availableCash / cleanMidPrice,
    availablePositionValue / cleanMidPrice
  );

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const candidate = (lowerBound + upperBound) / 2;
    const quote = estimateMarketMakerQuote({
      side: "buy",
      midPrice: cleanMidPrice,
      shares: candidate,
      volatility
    });

    if (quote.totalCost <= availableCash && quote.orderValue <= availablePositionValue) {
      lowerBound = candidate;
    } else {
      upperBound = candidate;
    }
  }

  return roundShareQuantityDown(lowerBound);
}

export function roundShareQuantityDown(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor((value + Number.EPSILON) * SHARE_QUANTITY_PRECISION) / SHARE_QUANTITY_PRECISION;
}

export function clampTradeShareInput(value: string, maxShares: number) {
  if (!value.trim()) {
    return value;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return value;
  }

  return parsedValue > maxShares ? formatTradeShareInput(maxShares) : value;
}

export function formatTradeShareInput(value: number) {
  return String(roundShareQuantityDown(value));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
