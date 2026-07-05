export const STARTING_CASH = 100000;
export const TRADE_COMMISSION_RATE = 0.01;
export const MIN_COMMISSION_PER_SHARE = 0.02;
export const MIN_TRADE_COMMISSION = 0.01;

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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
