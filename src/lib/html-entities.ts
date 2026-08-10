const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’"
};

export function decodeHtmlEntities(value: string) {
  let decoded = value;

  // Publisher feeds sometimes double-encode numeric entities as `&amp;#8217;`.
  // Two bounded passes decode those safely without turning this into a parser.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(
      /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
      (match, decimalValue: string | undefined, hexValue: string | undefined, namedValue: string | undefined) => {
        if (decimalValue || hexValue) {
          const codePoint = Number.parseInt(decimalValue ?? hexValue ?? "", decimalValue ? 10 : 16);

          if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
            return match;
          }

          try {
            return String.fromCodePoint(codePoint);
          } catch {
            return match;
          }
        }

        return NAMED_HTML_ENTITIES[namedValue?.toLowerCase() ?? ""] ?? match;
      }
    );

    decoded = next;
  }

  return decoded;
}
