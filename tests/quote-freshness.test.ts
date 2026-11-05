import { expect, it } from "vitest";
import { summarizeQuoteFreshness } from "@/lib/quote-freshness";
const now=Date.parse("2026-11-05T17:00:00Z");
const row=(id:string,time:string,date="2026-11-05")=>({artist_id:id,observed_at:time,observed_date:date});
it("reports the oldest verified artist refresh instead of promoting one fresh artist to the whole market",()=>{
  const value=summarizeQuoteFreshness(["a","b"],[row("a","2026-11-05T16:59:00Z"),row("b","2026-11-05T15:00:00Z")],"2026-11-05",now);
  expect(value).toMatchObject({staleArtistCount:1,asOf:"2026-11-05T15:00:00.000Z"});
});
it("does not manufacture freshness from missing, invalid, future or prior-session rows",()=>{
  const value=summarizeQuoteFreshness(["a","b","c","d"],[row("a","bad"),row("b","2026-11-05T18:00:00Z"),row("c","2026-11-05T16:59:00Z","2026-11-04")],"2026-11-05",now);
  expect(value).toMatchObject({staleArtistCount:4,asOf:null});
});
