import { describe, expect, it } from "vitest";
import { createArtistReceptionSelector, getLongReactionCopyKey } from "@/server/market/artist-reception";
import { scoreMusicReception } from "@/server/market/music-reception";
const thug = { id: "young-thug", name: "Young Thug" }, drake = { id: "drake", name: "Drake" };
const select = createArtistReceptionSelector([thug, drake], {}, "2026-10-15");
describe("artist-specific reception", () => {
  it("separates explicit criticism and praise in a collaboration's comments", () => {
    const text = "Young Thug verse is trash but Drake verse is fire";
    expect(scoreMusicReception(select(text, thug))).toBeLessThan(0);
    expect(scoreMusicReception(select(text, drake))).toBeGreaterThan(0);
  });
  it("does not apply another named artist's opinion to an unnamed collaborator", () => {
    expect(select("Drake album is trash", thug)).toBe("");
    expect(scoreMusicReception(select("this song is fire", thug))).toBeGreaterThan(0);
  });
  it("abstains on unresolved comparisons and unanchored pronouns", () => {
    expect(select("Young Thug is better than Drake", thug)).toBe("");
    expect(select("Drake song is fire but he is trash", thug)).toBe("");
  });
  it("recognizes the rest of the registry even when the current batch has one artist", () => {
    const one = createArtistReceptionSelector([thug], {}, "2026-10-15");
    expect(scoreMusicReception(one("Young Thug album is trash but Drake album is fire", thug))).toBeLessThan(0);
  });
  it("does not promote quoted search terms into artist aliases", () => {
    const one = createArtistReceptionSelector([thug], { [thug.id]: { artistId: thug.id, gdeltQuery: '"some artist"' } }, "2026-10-15");
    expect(one("Drake song is fire but some artist is trash", thug)).toBe("");
  });
  it("deduplicates long copied text while preserving short independent opinions", () => {
    expect(getLongReactionCopyKey("Young Thug album review: this new project is genuinely boring and disappointing https://a.test/x")).toBe(
      getLongReactionCopyKey("Young Thug album review: this new project is genuinely boring and disappointing https://b.test/y"));
    expect(getLongReactionCopyKey("song is trash")).toBeNull();
  });
});
