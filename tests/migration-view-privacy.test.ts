import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("final migration privileges", () => {
  it.each(["market_leaderboard", "market_trade_events", "short_position_risk"])("keeps %s behind server response shaping", view => {
    const statements = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort()
      .flatMap(name => readFileSync(`supabase/migrations/${name}`, "utf8").replace(/--[^\n]*/g, "").split(";"))
      .map(statement => statement.trim().replace(/\s+/g, " ").toLowerCase());
    const roleChanges = statements.filter(statement => new RegExp(`^(?:grant|revoke) .* on (?:table )?public\\.${view} (?:to|from) .*\\b(?:anon|authenticated)\\b`).test(statement));
    expect(roleChanges.at(-1)).toMatch(/^revoke all /);
    expect(roleChanges.at(-1)).toContain("from public, anon, authenticated");
  });
});
