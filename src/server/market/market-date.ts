export const MARKET_TIME_ZONE = "America/New_York";

export function getMarketDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getMarketDayBoundsUtc(date: string) {
  return {
    start: getMarketLocalMidnightUtc(date),
    end: getMarketLocalMidnightUtc(shiftMarketDate(date, 1))
  };
}

export function getMarketLookbackBoundsUtc(runDate: string, lookbackDays: number) {
  return {
    start: getMarketLocalMidnightUtc(shiftMarketDate(runDate, -lookbackDays)),
    end: getMarketLocalMidnightUtc(runDate)
  };
}

export function shiftMarketDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}

function getMarketLocalMidnightUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const desiredLocalTimestamp = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guessTimestamp = Date.UTC(year, month - 1, day, 8, 0, 0);

  for (let index = 0; index < 4; index += 1) {
    const actual = getMarketParts(new Date(guessTimestamp));
    const actualLocalTimestamp = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );

    guessTimestamp += desiredLocalTimestamp - actualLocalTimestamp;
  }

  return new Date(guessTimestamp).toISOString();
}

function getMarketParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}
