import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({failedTable:"market_events",execute:vi.fn()}));
vi.mock("@/server/user-auth",()=>({requireConfirmedUser:async()=>({ok:true,user:{id:"user",email:"person@example.com",created_at:"2020-01-01"},supabase:{rpc:async()=>({data:[{trading_mode:"continuous",market_open:true,market_impact_enabled:true,artist_halted:false,reason:"Open"}],error:null})}})}));
vi.mock("@/server/rate-limit",()=>({enforceRateLimit:async()=>null}));
vi.mock("@/server/observability",()=>({reportServerError:vi.fn()}));
vi.mock("@/server/market/release-window",()=>({loadReleaseWindowStatus:async()=>({ready:true})}));
vi.mock("@/lib/supabase/server",()=>({getSupabaseConfigStatus:()=>({readyForPublicReads:true,serviceRoleConfigured:true}),createServiceRoleClient:()=>({rpc:state.execute,from(table:string){
  const result=()=>({data:table==="profiles"?{is_admin:false,market_impact_exempt:false}:[],error:table===state.failedTable?{message:"Unavailable"}:null});
  const query={select:()=>query,eq:()=>query,gte:()=>query,or:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>result(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return query;
}})}));
import { POST } from "../app/api/trades/route";
beforeEach(()=>{state.execute.mockReset();});afterEach(()=>vi.unstubAllEnvs());
it.each(["market_events","price_ticks"])("does not execute an order when %s readiness cannot be verified",async table=>{
  state.failedTable=table;
  const response=await POST(new Request("https://example.test/trades",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({side:"buy",artistId:"a",shares:1})}));
  expect(response.status).toBe(503);expect(state.execute).not.toHaveBeenCalled();
});
