const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  "1oneam": "1oneam",
  "2hollis": "2hollis",
  "2slimey": "2slimey",
  "a boogie wit da hoodie": "A Boogie wit da Hoodie",
  "a$ap rocky": "A$AP Rocky",
  "asap rocky": "A$AP Rocky",
  "babychiefdoit": "BabyChiefDoIt",
  "bigxthaplug": "BigXthaPlug",
  "big x tha plug": "BigXthaPlug",
  "bossman dlow": "BossMan Dlow",
  "cardi b": "Cardi B",
  "esdeekid": "EsDeeKid",
  "glorilla": "GloRilla",
  "ian": "ian",
  "j cole": "J. Cole",
  "j. cole": "J. Cole",
  "jay z": "Jay-Z",
  "jay-z": "Jay-Z",
  "jid": "JID",
  "jpegmafia": "JPEGMAFIA",
  "lazer dim 700": "Lazer Dim 700",
  "lazerdim700": "Lazer Dim 700",
  "nav": "NAV",
  "nle choppa": "NLE Choppa",
  "plaqueboymax": "PlaqueBoyMax",
  "prettifun": "prettifun",
  "that mexican ot": "That Mexican OT",
  "tyler the creator": "Tyler, The Creator",
  "xaviersobased": "xaviersobased",
  "youngboy never broke again": "YoungBoy Never Broke Again",
  "ye": "Ye"
};

const TICKER_OVERRIDES: Record<string, string> = {
  "21 savage": "21SAV",
  "a boogie wit da hoodie": "ABOOGIE",
  "a$ap rocky": "ASAP",
  "asap rocky": "ASAP",
  "babychiefdoit": "BCDOIT",
  "bigxthaplug": "BIGX",
  "big x tha plug": "BIGX",
  "bossman dlow": "DLOW",
  "cardi b": "CARDI",
  "glorilla": "GLORILLA",
  "ice spice": "ICE",
  "j cole": "JCOLE",
  "j. cole": "JCOLE",
  "jpegmafia": "JPEG",
  "kodak black": "KODAK",
  "lil durk": "DURK",
  "lil tecca": "TECCA",
  "megan thee stallion": "MEGAN",
  "nle choppa": "NLE",
  "plaqueboymax": "PBM",
  "that mexican ot": "MXOT",
  "ynw melly": "MELLY",
  "youngboy never broke again": "YB"
};

const LOWERCASE_CONNECTORS = new Set(["and", "da", "de", "del", "la", "of", "the", "wit", "with"]);
const UPPERCASE_TOKENS = new Set(["b", "dj", "jid", "mc", "mf", "nav", "nba", "nle", "ot", "ymw", "ynw"]);

export function formatArtistDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const cleanName = value.trim().replace(/\s+/g, " ").slice(0, 120);

  if (!cleanName) {
    return "";
  }

  const override = DISPLAY_NAME_OVERRIDES[getArtistDisplayNameKey(cleanName)];

  if (override) {
    return override;
  }

  if (hasIntentionalMixedCase(cleanName)) {
    return cleanName;
  }

  return cleanName
    .split(" ")
    .map((word, wordIndex) => formatArtistWord(word, wordIndex))
    .join(" ");
}

export function getArtistDisplayNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9$]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function getArtistTickerOverride(value: string) {
  return TICKER_OVERRIDES[getArtistDisplayNameKey(value)] ?? null;
}

function hasIntentionalMixedCase(value: string) {
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) {
    return false;
  }

  return value.split(/\s+/).some((word) => {
    const letters = word.replace(/[^A-Za-z]/g, "");

    return /[a-z][A-Z]/.test(letters) || /[A-Z]{2,}[a-z]/.test(letters);
  });
}

function formatArtistWord(word: string, wordIndex: number) {
  return word
    .split("-")
    .map((part, partIndex) => formatArtistToken(part, wordIndex, partIndex))
    .join("-");
}

function formatArtistToken(token: string, wordIndex: number, partIndex: number) {
  const match = token.match(/^([^A-Za-z0-9]*)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/);

  if (!match) {
    return token;
  }

  const [, prefix, core, suffix] = match;
  const lower = core.toLowerCase();
  const isLeadingToken = wordIndex === 0 && partIndex === 0;

  if (UPPERCASE_TOKENS.has(lower)) {
    return `${prefix}${lower.toUpperCase()}${suffix}`;
  }

  if (!isLeadingToken && LOWERCASE_CONNECTORS.has(lower)) {
    return `${prefix}${lower}${suffix}`;
  }

  if (/^\d/.test(core)) {
    return `${prefix}${lower}${suffix}`;
  }

  return `${prefix}${lower.charAt(0).toUpperCase()}${lower.slice(1)}${suffix}`;
}
