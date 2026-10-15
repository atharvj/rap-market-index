import { clamp } from "@/lib/pricing";

export function scoreMusicReception(text: string) {
  // Explicit sarcasm is not reliable polarity evidence for a lexical scorer.
  if (/(?:^|\s)\/s(?:\s|$|[.!?])/i.test(text)) return 0;
  let score = 0;
  const withoutRatings = text.replace(/https?:\/\/\S+/gi, " ").replace(
    /(^|[^\d.])((?:10(?:\.0+)?|[0-9](?:\.\d+)?))\s*\/\s*10(?![\d.])/g,
    (match, prefix: string, rating: string, offset: number, original: string) => {
      // Hypothetical/negated ratings are not a direct numerical opinion.
      const before = original.slice(Math.max(0, offset - 24), offset) + prefix;
      const after = original.slice(offset + match.length);
      if (!/\b(?:not|isnt|isn't|wasnt|wasn't)\s*$/i.test(before) && !/^\s*(?:if|unless)\b/i.test(after)) {
        score += (Number(rating) - 5) * 0.8;
      }
      return prefix;
    }
  );
  let normalized = normalizeCommentText(withoutRatings);
  // Consume negated phrases first so their constituent praise/criticism is not
  // counted again with the opposite sign. Unrecognized text stays unknown.
  normalized = normalized.replace(/\b(?:not|isnt|isn t|aint|ain t)\s+(?:bad|trash|mid|boring|terrible|ass)\b/g, () => { score += 1.1; return " "; });
  normalized = normalized.replace(/\b(?:not|isnt|isn t|aint|ain t)\s+(?:good|fire|hard|great|it)\b|\b(?:don t|dont|do not|didn t|didnt)\s+(?:like|love|enjoy)\b/g, () => { score -= 1.2; return " "; });
  normalized = normalized.replace(/\bno skips?\b/g, () => { score += 1.45; return " "; });
  normalized = normalized.replace(/\b(?:hard to listen(?: to)?|not feeling (?:it|this)|cant listen|couldnt get into (?:it|this))\b/g, () => { score -= 1.2; return " "; });
  score += countMatches(normalized, /\b(aoty|album of the year|instant classic)\b/g) * 1.45;
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

