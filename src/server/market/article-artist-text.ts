/** Quoted song/album titles can contain another artist's name without crediting
 * that artist. Explicit feature clauses remain evidence of a performing credit. */
export function stripQuotedMusicTitles(text: string) {
  if (!/\b(?:album|mixtape|song|single|track|video|drops?|dropped|releases?|released)\b/i.test(text)) return text;
  return text.replace(/“[^”]+”|"[^"]+"|‘.*?’(?=\W|$)|(?<!\w)'.*?'(?=\W|$)/g, (quote, offset: number) => {
    const prefix = text.slice(Math.max(0, offset - 30), offset);
    return /\b(?:feat\.?|ft\.?|featuring)\s*$/i.test(prefix) ? quote : " ";
  });
}
