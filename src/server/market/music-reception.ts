import { clamp } from "@/lib/pricing";

export function scoreMusicReception(text: string) {
  let normalized = normalizeCommentText(text);
  let score = 0;
  // Consume negated phrases first so their constituent praise/criticism is not
  // counted again with the opposite sign. Unrecognized text stays unknown.
  normalized = normalized.replace(/\b(?:not|isnt|isn t|aint|ain t)\s+(?:bad|trash|mid|boring|terrible|ass)\b/g, () => { score += 1.1; return " "; });
  normalized = normalized.replace(/\b(?:not|isnt|isn t|aint|ain t)\s+(?:good|fire|hard|great|it)\b|\b(?:don t|dont|do not|didn t|didnt)\s+(?:like|love|enjoy)\b/g, () => { score -= 1.2; return " "; });
  normalized = normalized.replace(/\bno skips?\b/g, () => { score += 1.45; return " "; });
  normalized = normalized.replace(/\b(?:hard to listen(?: to)?|not feeling (?:it|this)|cant listen|couldnt get into (?:it|this))\b/g, () => { score -= 1.2; return " "; });
  score += countMatches(normalized, /\b(no skips?|10\/10|aoty|album of the year|instant classic)\b/g) * 1.45;
  score += countMatches(normalized, /\b(fire|heat|banger|classic|masterpiece|goat|legendary|slaps|elite)\b/g) * 1.15;
  score += countMatches(normalized, /\b(love|amazing|incredible|excellent|great|good|hard|beautiful|underrated|perfect|tough|cold|gas)\b/g) * 0.7;
  score += countMatches(normalized, /\b(better than expected)\b/g) * 0.8;
  score -= countMatches(normalized, /\b(fell off|trash|garbage|mid|flop|boring|washed|terrible|worst|overrated|disappointing|disappointed|skip|weak|cringe|corny|hate|hated|awful|unlistenable|mocked|ridiculed|sucks|sucked|dogwater)\b/g) * 1.1;
  score -= countMatches(normalized, /\b(ass|bad)\b/g) * 0.7;
  score -= Math.min(2, Array.from(text.matchAll(/👎|🤮|💩/gu)).length) * 0.8;
  if (score >= 0) score += Math.min(2, Array.from(text.matchAll(/🔥|💯/gu)).length) * 0.8;

  return clamp(score / 4 * 100, -100, 100);
}

function normalizeCommentText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’']/g, "")
    .replace(/([a-z])\1{2,}/g, "$1$1")
    .replace(/[^\w\s/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

