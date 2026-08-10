import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "@/lib/html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes publisher punctuation entities", () => {
    expect(decodeHtmlEntities("Drake&#8217;s &#8220;MAID OF HONOUR&#8221;"))
      .toBe("Drake’s “MAID OF HONOUR”");
  });

  it("decodes hexadecimal and double-encoded entities", () => {
    expect(decodeHtmlEntities("A&amp;#x2014;B &amp; C"))
      .toBe("A—B & C");
  });

  it("does not mistake a truncated entity for readable punctuation", () => {
    expect(decodeHtmlEntities("Artist - &#8220")).toBe("Artist - &#8220");
  });

  it("leaves unknown and invalid entities unchanged", () => {
    expect(decodeHtmlEntities("A &madeup; &#99999999;"))
      .toBe("A &madeup; &#99999999;");
  });
});
