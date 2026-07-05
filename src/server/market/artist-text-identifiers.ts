const GDELT_QUERY_OVERRIDES: Record<string, string> = {
  "1oneam": '"1oneam" rapper OR "1oneam" music',
  "2hollis": '"2hollis" rapper OR "2hollis" music',
  "2slimey": '"2slimey" rapper OR "2slimey" music',
  autumn: '"Autumn!" rapper OR "Autumn" rapper music',
  che: '"Che" rapper music',
  feng: '"Feng" rapper music',
  future: '"Future" rapper OR "Future" hip hop OR "Future" album',
  ian: '"ian" rapper music OR "ian" rap artist',
  jayz: '"Jay-Z" rapper OR "Jay Z" music',
  "lucy-bedrouqe": '"Lucy Bedrouqe" rapper OR "Lucy Bedrouqe" music',
  protect: '"Protect" rapper music OR "Protect" rap artist',
  tana: '"Tana" rapper OR "BabySantana" rapper OR "Tana" music',
  ye: '"Ye" rapper OR "Kanye West" music OR "Kanye West" album'
};

const WIKIPEDIA_SEARCH_OVERRIDES: Record<string, string> = {
  autumn: '"Autumn!" rapper musician',
  che: '"Che" rapper musician',
  future: '"Future" rapper musician',
  ian: '"ian" rapper musician',
  "jay-z": '"Jay-Z" rapper musician',
  protect: '"Protect" rapper musician',
  tana: '"Tana" rapper BabySantana musician',
  ye: '"Ye" Kanye West rapper musician'
};

const WIKIPEDIA_TITLE_OVERRIDES: Record<string, string[]> = {
  "asap-rocky": ["ASAP Rocky", "A$AP Rocky"],
  autumn: ["Autumn!"],
  future: ["Future (rapper)", "Future"],
  "jay-z": ["Jay-Z"],
  tana: ["Tana (rapper)", "BabySantana"],
  ye: ["Kanye West", "Ye"]
};

export function buildDefaultLastfmName(artistName: string) {
  return artistName.trim();
}

export function buildDefaultGdeltQuery(artistName: string) {
  const key = getArtistTextKey(artistName);
  const override = GDELT_QUERY_OVERRIDES[key];

  if (override) {
    return override;
  }

  const phrase = quoteSearchPhrase(artistName);

  return `"${phrase}" rapper OR "${phrase}" hip hop OR "${phrase}" music`;
}

export function buildWikipediaSearchQuery(artistName: string) {
  const key = getArtistTextKey(artistName);
  const override = WIKIPEDIA_SEARCH_OVERRIDES[key];

  if (override) {
    return override;
  }

  return `${artistName.trim()} rapper musician hip hop`;
}

export function buildWikipediaTitleCandidates(artistName: string) {
  const key = getArtistTextKey(artistName);
  const candidates = WIKIPEDIA_TITLE_OVERRIDES[key] ?? [];
  const cleanName = artistName.trim();
  const normalizedDollarName = cleanName.replace(/\$/g, "S");

  return Array.from(
    new Set([
      ...candidates,
      cleanName,
      normalizedDollarName !== cleanName ? normalizedDollarName : null
    ].filter((value): value is string => Boolean(value)))
  );
}

export function getArtistTextKey(artistName: string) {
  return artistName
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function quoteSearchPhrase(value: string) {
  return value.replace(/"/g, "").replace(/\s+/g, " ").trim();
}
