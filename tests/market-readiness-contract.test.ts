import { expect, it } from "vitest";
import { assertMarketSnapshot, assertArtistHistory } from "../scripts/check-market-readiness.mjs";
const artist={id:"a",currentPrice:101,previousClose:100,dailyChangePercent:1};
const payload=()=>({ok:true,source:"supabase",state:{artists:[artist],quoteFreshness:{artistCount:1,staleArtistCount:0,checkedAt:"2026-11-05T12:00:00Z"}}});
it("rejects demo quotes, invalid prices and incorrect returns in live monitoring",()=>{
  expect(assertMarketSnapshot(payload())).toHaveLength(1);
  expect(()=>assertMarketSnapshot({...payload(),source:"mock"})).toThrow("demo");
  for(const change of [{currentPrice:0},{dailyChangePercent:10},{currentPrice:NaN}]){
    const data=payload();data.state.artists=[{...artist,...change}];expect(()=>assertMarketSnapshot(data)).toThrow();
  }
});
it("detects missing daily closes, repeated dates and chart/current-quote disagreement",()=>{
  const history={ok:true,source:"supabase",range:"1M",points:[{date:"2026-11-04",price:100},{date:"2026-11-05",price:101}]};
  expect(()=>assertArtistHistory(history,artist,"2026-11-05")).not.toThrow();
  expect(()=>assertArtistHistory({...history,points:history.points.slice(0,1)},artist,"2026-11-05")).toThrow("missing");
  expect(()=>assertArtistHistory({...history,points:[history.points[1],history.points[1]]},artist,"2026-11-05")).toThrow("duplicated");
  expect(()=>assertArtistHistory(history,{currentPrice:102},"2026-11-05")).toThrow("disagree");
});

it("respects the database's four-decimal percentage precision",()=>{
  const data=payload();const price=94.01,previousClose=93.72;
  data.state.artists=[{id:"a",currentPrice:price,previousClose,dailyChangePercent:Math.round((price/previousClose-1)*100*10000)/10000}];
  expect(()=>assertMarketSnapshot(data)).not.toThrow();
});
