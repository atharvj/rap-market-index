import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
let db:PGlite;
const user="10000000-0000-4000-8000-000000000001";
const sql=async(name:string)=>readFile("supabase/migrations/"+name,"utf8");
const functions=(text:string)=>text.match(/create or replace function public\.[\s\S]*?\n\$\$;/g)??[];
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
    create type artist_category as enum('superstar','mainstream','rising','underground');
    create type transaction_type as enum('buy','sell');create type market_update_status as enum('running','succeeded','failed');`);
  const initial=await sql("001_initial_schema.sql");
  for(const table of ["profiles","artists","artist_stats","price_history","holdings","transactions","market_update_runs"]){
    let schema=initial.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))![0];
    schema=schema.replace(/^.*season_id uuid.*\n/gm,"").replace('user_id, artist_id, season_id','user_id, artist_id');
    await db.exec(schema);
  }
  await db.exec(functions(initial).join("\n"));
  await db.exec(`alter table profiles add column is_admin boolean default false,add column market_impact_exempt boolean default false;
    alter table transactions add column gross_value numeric default 0,add column commission numeric default 0,add column market_eligible boolean default true;`);
  for(const name of ["007_market_events.sql","013_price_ticks.sql"]){const text=await sql(name);await db.exec(text.match(/create table if not exists public\.[\s\S]*?\n\);/)![0]);}
  const score=functions(await sql("002_trading_functions.sql"))[0]!;await db.exec(score);
  const commission=functions(await sql("014_market_economy_guardrails.sql")).find(s=>s.includes('public.calculate_trade_commission('))!;await db.exec(commission);
  await db.exec(functions(await sql("015_market_maker_quotes.sql")).join("\n"));
  await db.exec(await sql("016_market_integrity_guardrails.sql"));
  await db.exec(await sql("017_market_operation_controls.sql"));
  await db.exec(await sql("018_short_selling_foundation.sql"));
  await db.exec(await sql("036_enforce_admin_trade_exclusion.sql"));
  await db.exec(await sql("040_enforce_whole_share_trading.sql"));
  await db.exec(await sql("049_strict_market_opening.sql"));
  await db.exec(await sql("050_transactional_trade_readiness.sql"));
});
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`truncate auth.users,profiles,artists,market_update_runs,market_events,price_ticks,artist_trading_halts cascade;
    update market_controls set allow_trading=true,trading_mode='continuous';
    insert into auth.users values('${user}','person@example.com',now(),now()-interval '3 days');
    insert into profiles(id,username,cash_balance,created_at) values('${user}','Tester',25000,now()-interval '3 days');
    insert into artists(id,name,ticker,current_price,previous_close,category) values('a','Artist','ART',100,100,'mainstream');
    insert into price_history(artist_id,price_date,price,hype_score,explanation) values('a',(now() at time zone 'America/New_York')::date,100,50,'Opening');
    insert into market_update_runs(run_date,source,status) values((now() at time zone 'America/New_York')::date,'core','succeeded');
    set request.jwt.claim.role='service_role';`);
});
async function trade(side:string,shares:number){return db.query("select execute_artist_trade_as_user($1,$2,'a',$3,true) result",[user,side,shares]);}
async function cash(){return Number((await db.query<{cash_balance:string}>("select cash_balance from profiles where id=$1",[user])).rows[0].cash_balance);}
it("buys and sells whole shares with commissions and without creating fantasy cash",async()=>{
  await trade("buy",5);expect(await cash()).toBeLessThan(24500);
  await db.exec("update transactions set created_at=now()-interval '31 seconds'");
  await trade("sell",5);expect(await cash()).toBeLessThan(25000);
  expect((await db.query<{n:number}>("select count(*)::int n from holdings")).rows[0].n).toBe(0);
});
it("shorts and covers without allowing overlap or overselling",async()=>{
  await trade("short",5);
  expect(await cash()).toBeLessThan(25000);
  await expect(trade("cover",6)).rejects.toThrow();
  await expect(trade("buy",1)).rejects.toThrow();
  await db.exec("update short_transactions set created_at=now()-interval '31 seconds'");
  await trade("cover",5);
  expect(await cash()).toBeLessThan(25000);
  expect((await db.query<{n:number}>("select count(*)::int n from short_positions")).rows[0].n).toBe(0);
});
it("blocks a pause occurring after the API check, including exempt accounts",async()=>{
  await db.exec("update profiles set is_admin=true;update market_controls set allow_trading=false");
  await expect(trade("buy",1)).rejects.toThrow();expect(await cash()).toBe(25000);
});
it("rolls back cash and positions if a late order insert fails",async()=>{
  await db.exec(`create function reject_order() returns trigger language plpgsql as $$begin raise exception 'Injected order failure';end$$;
    create trigger reject_order before insert on transactions for each row execute function reject_order();`);
  try{await expect(trade("buy",5)).rejects.toThrow("Injected order failure");}
  finally{await db.exec("drop trigger reject_order on transactions;drop function reject_order()");}
  expect(await cash()).toBe(25000);
  expect((await db.query<{n:number}>("select count(*)::int n from holdings")).rows[0].n).toBe(0);
});
it("enforces whole shares and rejects oversized exposure",async()=>{
  await expect(trade("buy",1.5)).rejects.toThrow();await expect(trade("buy",100)).rejects.toThrow();expect(await cash()).toBe(25000);
});
