import { clamp } from "@/lib/pricing";

export type ArtistNameMatchStatus =
  | "empty"
  | "exact"
  | "compact_exact"
  | "source_suffix"
  | "trusted_external_id"
  | "short_ambiguous"
  | "contains"
  | "token_overlap"
  | "mismatch";

export type ArtistNameMatchResult = {
  confidence: number;
  status: ArtistNameMatchStatus;
  normalizedExpected: string;
  normalizedCandidate: string;
  compactExpected: string;
  compactCandidate: string;
  expectedTokenCount: number;
  candidateTokenCount: number;
  tokenOverlap: number;
};

const SOURCE_SUFFIX_TOKENS = new Set(["official", "music", "topic", "vevo", "channel"]);
const TOKEN_NOISE = new Set(["the"]);

export function scoreArtistNameMatch(expected: string, candidate?: string | null): ArtistNameMatchResult {
  const normalizedExpected = normalizeArtistNameForMatch(expected);
  const normalizedCandidate = normalizeArtistNameForMatch(candidate ?? "");
  const compactExpected = compactArtistName(normalizedExpected);
  const compactCandidate = compactArtistName(normalizedCandidate);
  const expectedTokens = getSignalTokens(normalizedExpected);
  const candidateTokens = getSignalTokens(normalizedCandidate);
  const tokenOverlap = expectedTokens.filter((token) => candidateTokens.includes(token)).length;

  if (!normalizedExpected || !normalizedCandidate || !compactExpected || !compactCandidate) {
    return buildResult({
      confidence: 0,
      status: "empty",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  if (normalizedExpected === normalizedCandidate) {
    return buildResult({
      confidence: 0.99,
      status: "exact",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  if (compactExpected === compactCandidate) {
    return buildResult({
      confidence: 0.97,
      status: "compact_exact",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  const sourceStrippedExpected = stripSourceSuffixes(normalizedExpected);
  const sourceStrippedCandidate = stripSourceSuffixes(normalizedCandidate);

  if (
    sourceStrippedExpected &&
    sourceStrippedCandidate &&
    compactArtistName(sourceStrippedExpected) === compactArtistName(sourceStrippedCandidate)
  ) {
    return buildResult({
      confidence: 0.94,
      status: "source_suffix",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  if (compactExpected.length <= 3) {
    const confidence = candidateTokens.includes(normalizedExpected) ? 0.34 : 0.08;

    return buildResult({
      confidence,
      status: "short_ambiguous",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  if (
    compactExpected.length >= 5 &&
    (normalizedCandidate.includes(normalizedExpected) || compactCandidate.includes(compactExpected))
  ) {
    return buildResult({
      confidence: normalizedCandidate.startsWith(normalizedExpected) ? 0.78 : 0.7,
      status: "contains",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  if (tokenOverlap > 0) {
    const expectedCoverage = tokenOverlap / Math.max(1, expectedTokens.length);
    const candidateCoverage = tokenOverlap / Math.max(1, candidateTokens.length);
    const singleTokenPenalty =
      expectedTokens.length === 1 && candidateTokens.length > 1 && compactExpected.length < 6 ? 0.18 : 0;
    const confidence = 0.22 + expectedCoverage * 0.42 + candidateCoverage * 0.26 - singleTokenPenalty;

    return buildResult({
      confidence,
      status: "token_overlap",
      normalizedExpected,
      normalizedCandidate,
      compactExpected,
      compactCandidate,
      expectedTokens,
      candidateTokens,
      tokenOverlap
    });
  }

  return buildResult({
    confidence: 0.06,
    status: "mismatch",
    normalizedExpected,
    normalizedCandidate,
    compactExpected,
    compactCandidate,
    expectedTokens,
    candidateTokens,
    tokenOverlap
  });
}

export function normalizeArtistNameForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll("$", "s")
    .replaceAll("@", "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function compactArtistName(value: string) {
  return normalizeArtistNameForMatch(value).replace(/\s+/g, "");
}

function stripSourceSuffixes(value: string) {
  const tokens = normalizeArtistNameForMatch(value).split(" ").filter(Boolean);

  while (tokens.length > 1 && SOURCE_SUFFIX_TOKENS.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
  }

  return tokens.join(" ");
}

function getSignalTokens(value: string) {
  return normalizeArtistNameForMatch(value)
    .split(" ")
    .filter((token) => token && !TOKEN_NOISE.has(token));
}

function buildResult({
  confidence,
  status,
  normalizedExpected,
  normalizedCandidate,
  compactExpected,
  compactCandidate,
  expectedTokens,
  candidateTokens,
  tokenOverlap
}: {
  confidence: number;
  status: ArtistNameMatchStatus;
  normalizedExpected: string;
  normalizedCandidate: string;
  compactExpected: string;
  compactCandidate: string;
  expectedTokens: string[];
  candidateTokens: string[];
  tokenOverlap: number;
}): ArtistNameMatchResult {
  return {
    confidence: clamp(confidence, 0, 1),
    status,
    normalizedExpected,
    normalizedCandidate,
    compactExpected,
    compactCandidate,
    expectedTokenCount: expectedTokens.length,
    candidateTokenCount: candidateTokens.length,
    tokenOverlap
  };
}
