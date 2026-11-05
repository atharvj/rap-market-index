import { expect,it } from "vitest";
import { readJsonObject } from "@/server/request-body";
it.each(["null","[]",'"text"',"1","bad JSON"])("normalizes an invalid JSON root %s before field validation",async body=>{
  expect(await readJsonObject(new Request("https://example.test",{method:"POST",body}))).toEqual({});
});
it("preserves object fields for the route's own validation",async()=>{
  expect(await readJsonObject(new Request("https://example.test",{method:"POST",body:'{"shares":5}'}))).toEqual({shares:5});
});
