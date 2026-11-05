import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn(() => { throw new Error("Database must not be touched"); }));
vi.mock("@/server/admin-auth", () => ({ requireAdminRequest: async () => ({ ok:true }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: db }));
import { POST, GET } from "../app/api/admin/prelaunch-reset/route";
it("retires the nontransactional reset without touching records even with the old confirmation",async()=>{
  const req=new Request("https://example.test/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirm:"RESET RMI"})});
  expect((await POST(req)).status).toBe(410);expect(await(await GET(new Request("https://example.test/reset"))).json()).toMatchObject({available:false});expect(db).not.toHaveBeenCalled();
});
