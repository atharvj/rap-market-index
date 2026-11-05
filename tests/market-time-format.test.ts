import { expect,it } from "vitest";
import { formatDate } from "@/lib/formatters";
it("formats timestamp dates on the same Eastern session as the trading engine",()=>{
  expect(formatDate("2026-11-05T05:30:00Z")).toBe("Nov 5");
  expect(formatDate("2026-11-05T04:30:00Z")).toBe("Nov 4");
  expect(formatDate("2026-11-05")).toBe("Nov 5");
});
