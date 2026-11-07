import { expect, it } from "vitest";
import {
  getQuotePublications,
  type QuotePublication,
} from "@/lib/quote-publication";
const now = Date.parse("2026-11-07T17:00:00Z");
const row = (
  id: string,
  time: string,
  version: string,
  date = "2026-11-07",
): QuotePublication => ({
  artist_id: id,
  observed_at: time,
  observed_date: date,
  model_version: version,
});
it("associates the actual published model with the latest valid completion per artist", () => {
  const result = getQuotePublications(
    [
      row("a", "2026-11-07T16:00:00Z", "v47"),
      row("a", "2026-11-07T15:00:00Z", "v46"),
      row("b", "2026-11-06T15:00:00Z", "v45", "2026-11-06"),
    ],
    "2026-11-07",
    now,
  );
  expect(result.get("a")?.model_version).toBe("v47");
  expect(result.get("b")?.observed_date).toBe("2026-11-06");
});
it("ignores malformed and future publications instead of manufacturing current metadata", () => {
  const rows = [
    row("a", "invalid", "v99"),
    row("b", "2026-11-07T18:00:00Z", "v99"),
    row("c", "2026-11-07T16:00:00Z", "v99", "2026-11-08"),
    row("d", "2026-11-07T16:00:00Z", "v99", "2026-02-31"),
  ];
  expect(getQuotePublications(rows, "2026-11-07", now).size).toBe(0);
  expect(getQuotePublications(rows, "bad", now).size).toBe(0);
});
