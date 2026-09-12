import { getArtistTextKey } from "@/server/market/artist-text-identifiers";
import type { ArtistStatusSubtype } from "@/server/market/status-events";

const COMMON_WORD_ARTIST_KEYS = new Set([
  "autumn",
  "che",
  "feng",
  "future",
  "ian",
  "nav",
  "ye"
]);

const MUSIC_CONTEXT_TERMS = [
  "album",
  "artist",
  "concert",
  "ep",
  "festival",
  "hip hop",
  "mixtape",
  "music",
  "performance",
  "rapper",
  "rap",
  "record",
  "release",
  "single",
  "song",
  "spotify",
  "tour",
  "track",
  "video",
  "youtube"
];

const CATALYST_TERMS = [
  "album",
  "announces",
  "announced",
  "arrest",
  "arrested",
  "beef",
  "charged",
  "concert",
  "controversy",
  "cosign",
  "diss",
  "disses",
  "drop",
  "dropped",
  "drops",
  "ep",
  "feature",
  "festival",
  "fight",
  "jail",
  "mixtape",
  "performance",
  "performs",
  "release",
  "released",
  "releases",
  "review",
  "sentenced",
  "single",
  "snippet",
  "song",
  "tour",
  "track",
  "verse",
  "video"
];

const LOW_TIER_CLAIMS_REQUIRING_CORROBORATION = new Set([
  "award_terms",
  "chart_terms",
  "controversy_terms",
  "decline_terms",
  "feature_terms",
  "major_feature_terms",
  "performance_terms",
  "public_conflict_terms",
  "public_reaction_terms",
  "review_keyword",
  "snippet_terms",
  "music_social_trend_terms",
  "tour_terms",
  "tracklist_reaction_terms",
  "viral_terms"
]);

export function hasRequiredArtistEventDisambiguation({
  artistName,
  text,
  query,
  sourceTier = 0
}: {
  artistName: string;
  text: string;
  query?: string;
  sourceTier?: number;
}) {
  const normalizedText = normalizeEventSearchText(text);
  const aliases = getArtistAliases(artistName, query);

  if (
    aliases.some((alias) =>
      !isAmbiguousAlias(alias) &&
      !isCommonWordAlias(alias) &&
      containsNormalizedPhrase(normalizedText, alias)
    )
  ) {
    return true;
  }

  const primaryAlias = normalizeEventSearchText(artistName);
  const isAmbiguous = isAmbiguousAlias(primaryAlias);
  const isCommonWord = isCommonWordAlias(primaryAlias);

  if (!isAmbiguous && !isCommonWord) {
    // A search result is not artist evidence by itself. Google News and other
    // broad providers can return adjacent or completely unrelated results for
    // even distinctive names. Require the artist to appear in the returned
    // title/summary before the story can enter any artist's signal.
    return false;
  }

  if (aliases.some((alias) => hasStrongArtistCatalystContext(normalizedText, alias))) {
    return true;
  }

  if (isCommonWord) {
    return false;
  }

  return sourceTier >= 1 && hasMusicContext(normalizedText);
}

export function isAmbiguousArtistName(name: string) {
  return isAmbiguousAlias(normalizeEventSearchText(name));
}

export function hasMusicContext(value: string) {
  const normalized = normalizeEventSearchText(value);

  return MUSIC_CONTEXT_TERMS.some((term) => normalized.includes(term));
}

export function hasArtistStatusSubjectContext({
  artistName,
  text,
  query,
  statusSubtype
}: {
  artistName: string;
  text: string;
  query?: string;
  statusSubtype?: ArtistStatusSubtype | null;
}) {
  const normalizedText = normalizeEventSearchText(text);
  const aliases = getArtistAliases(artistName, query);

  return aliases.some((alias) => hasDirectStatusSubject(normalizedText, alias, statusSubtype));
}

export function hasArtistReleaseSubjectContext({
  artistName,
  text,
  query
}: {
  artistName: string;
  text: string;
  query?: string;
}) {
  const normalizedText = normalizeEventSearchText(text);

  if (hasArtistFeatureCreditContext({ artistName, text, query })) {
    return false;
  }

  const aliases = getArtistAliases(artistName, query);

  return aliases.some((alias) => hasDirectReleaseSubject(normalizedText, alias));
}

export function hasArtistControversySubjectContext({
  artistName,
  text,
  query
}: {
  artistName: string;
  text: string;
  query?: string;
}) {
  const normalizedText = normalizeEventSearchText(text);
  const aliases = getArtistAliases(artistName, query);

  return aliases.some((alias) => {
    if (!alias || !containsNormalizedPhrase(normalizedText, alias)) {
      return false;
    }

    if (hasControversyActorContext(normalizedText, alias)) {
      return false;
    }

    return (
      !hasIncidentalControversyContext(normalizedText, alias) &&
      hasDirectControversySubjectContext(normalizedText, alias)
    );
  });
}

export function hasArtistFeatureCreditContext({
  artistName,
  text,
  query
}: {
  artistName: string;
  text: string;
  query?: string;
}) {
  const normalizedText = normalizeEventSearchText(text);
  const aliases = getArtistAliases(artistName, query);

  return aliases.some((normalizedAlias) => {
    if (!normalizedAlias || !containsNormalizedPhrase(normalizedText, normalizedAlias)) {
      return false;
    }

    const alias = toRegexPhrase(normalizedAlias);
    // "with" and "alongside" describe many non-credit relationships (for
    // example, "beef with Kendrick Lamar"). Require explicit music-credit
    // language before changing the artist's role to featured.
    const creditPrefix = "(?:feat|ft|featuring|features)";

    return (
      new RegExp(`\\b${creditPrefix}(?:\\s+\\S+){0,2}\\s+${alias}\\b`).test(normalizedText) ||
      new RegExp(`\\b${alias}\\b(?:\\s+\\S+){0,2}\\s+(?:feature|guest\\s+verse|verse)\\b`).test(normalizedText)
    );
  });
}

export function isGenericMusicListicleTitle(title: string) {
  const normalized = normalizeEventSearchText(title);

  return (
    /\b(?:new|best|top)\s+(?:albums?|songs?|tracks?|mixtapes?|eps?)\b.*\b(?:you|we)\s+(?:should|need|must)\b/.test(normalized) ||
    /\b(?:albums?|songs?|tracks?)\s+(?:you|we)\s+(?:should|need|must)\b/.test(normalized) ||
    /\b(?:new|best)\s+(?:music|rap songs|hip hop songs)\b/.test(normalized) ||
    /\band more\b/.test(normalized)
  );
}

export function isLowValueMarketArticleTitle(title: string) {
  const normalized = normalizeEventSearchText(title);
  const hasExplicitMusicDemandContext =
    /\b(?:album|chart|concert|festival|listening|music|performance|release|single|song|spotify|stream|streaming|ticket|tour|track)\b/.test(
      normalized
    );

  if (isGenericMusicListicleTitle(title)) {
    return true;
  }

  if (
    /\bmagazine\b/.test(normalized) &&
    !/\b(?:announces?\s+(?:a\s+)?tour|tour\s+dates?)\b/.test(normalized)
  ) {
    return true;
  }

  return (
    /\b(?:top|best|greatest)\s+\d+\b/.test(normalized) ||
    /\b\d+\s+(?:best|greatest|top)\b/.test(normalized) ||
    /\b(?:best|greatest)\b.*\bof all time\b/.test(normalized) ||
    /\branked\b.*\b(?:best|greatest|verses|songs|albums|moments)\b/.test(normalized) ||
    /\b(?:best|greatest|verses|songs|albums|moments)\b.*\branked\b/.test(normalized) ||
    /\b(?:fragrance|perfume|cologne|cosmetics?|makeup|skin ?care|hair ?care|beauty (?:brand|line|product))\b/.test(normalized) ||
    /\b(?:ulta beauty|sephora|tiktok shop)\b/.test(normalized) ||
    (
      /\b(?:launches?|unveils?|debuts?|fronts?|stars? in)\b.*\b(?:apparel|brand|campaign|collection|product|store|storefront)\b/.test(
        normalized
      ) &&
      !hasExplicitMusicDemandContext
    ) ||
    (
      /\b(?:joins?|takes? on|does?|tries?)\b.*\b(?:tiktok|viral|dance)\s+challenge\b/.test(normalized) &&
      !hasExplicitMusicDemandContext
    ) ||
    /\bmoments?\s+(?:we|you)\s+(?:will\s+)?never\s+forget\b/.test(normalized) ||
    /\bdream\s+setlist\b/.test(normalized) ||
    /\bsetlist\s+for\b/.test(normalized) ||
    /\b(?:dating|kiss photos?|white party|girlfriend|boyfriend)\b/.test(normalized) ||
    /\b(?:tells|told)\s+women\b/.test(normalized) ||
    /\bbang\s+them\b/.test(normalized) ||
    /\bfans?\s+sign\b/.test(normalized) ||
    /\bholds?\s+up\s+fans?\s+sign\b/.test(normalized) ||
    /\b(?:thinks?|believes?|says?)\b.*\bwon\b.*\b(?:beef|diss|feud)\b/.test(normalized) ||
    /\balleged\s+real\s+reason\b.*\b(?:beef|diss|feud)\b/.test(normalized) ||
    /\breal\s+reason\s+behind\b.*\b(?:beef|diss|feud)\b/.test(normalized) ||
    /\b(?:reveals?|explains?|claims?|weighs?\s+in|reacts?|laughs?)\b.*\b(?:beef|diss|feud)\b/.test(normalized) ||
    /\bcame\s+out\s+on\s+top\b.*\b(?:beef|diss|feud)\b/.test(normalized) ||
    /\b(?:shows?\s+up|appears?|attends?|comes?|flies?)\b.*\b(?:support|supporting)\b.*\b(?:trial|court|hearing)\b/.test(normalized) ||
    /\b(?:supports?|stands?\s+with)\b.*\b(?:at|during|outside)\b.*\b(?:trial|court|hearing)\b/.test(normalized) ||
    /\b(?:says?|claims?|argues?|insists?)\b.*\b(?:arrest|trial|lawsuit)\b.*\b(?:proves?\s+(?:him|her|me|them)\s+right|told\s+you|smarter\s+than)\b/.test(normalized) ||
    /\b(?:co signs?|cosigns?)\b.*\bcontroversial\s+(?:artist|rapper|figure)\b/.test(normalized) ||
    /\b(?:defends?|supports?)\b.*\b(?:after|amid|over)\b.*\b(?:backlash|controversy)\b/.test(normalized) ||
    /\b(?:old|unreleased|alleged)\b.*\b(?:leak|song|track)\b.*\b(?:supposed\s+to|meant\s+to|would\s+have)\b.*\b(?:feature|include)\b/.test(normalized) ||
    /\b(?:alleged|private)\s+(?:text|texts|messages?)\b.*\b(?:leak|leaks|leaked)\b/.test(normalized) ||
    /\b(?:calls?|clowns?|mocks?|roasts?)\b.*\b(?:little|short|ugly|washed)\b.*\b(?:after|amid|over)\b/.test(normalized) ||
    /\b(?:sneakers?|shoes?|air\s+jordans?)\b.*\b(?:auction|sale|sold)\b/.test(normalized) ||
    /\b(?:photographer|videographer|crew\s+member|staffer)\b.*\b(?:arrested|detained|charged)\b.*\b(?:music\s+video|video\s+shoot|shoot)\b/.test(normalized) ||
    /\b(?:says?|claims?|argues?|insists?)\b.*\b(?:internet|social\s+media)\b.*\b(?:fame|famous|viral)\b/.test(normalized) ||
    /\b(?:looks?\s+back|reflects?|revisits?)\b.*\b(?:co produced|co producing|produced|producing|making|recording|working\s+on)\b.*\b(?:at\s+age|years?\s+old|as\s+a\s+teen)\b/.test(normalized) ||
    /^(?:is|are|will|could|might|can)\b.*\b(?:album|feature|release|tour)\b/.test(normalized) ||
    /\b(?:food|eating)\s+(?:rules?|habits?|preferences?)\b/.test(normalized) ||
    /\b(?:hates?|hating)\s+(?:mayo|mayonnaise|milk)\b/.test(normalized) ||
    /\b(?:mom|dad|mother|father|parent)\b.*\bviral\b.*\bcomparisons?\b/.test(normalized) ||
    /\binspires?\b.*\bnew sound\b/.test(normalized) ||
    /\b(?:are|is|will|could|might)\b.*\b(?:on|featured|featuring|join)\b.*\b(?:album|song|track|project)\b.*\bwhat we know\b/.test(normalized) ||
    /\b(?:sneakers?|shoes?)\s+(?:we|you)\s+want\s+to\s+see\b/.test(normalized) ||
    /\b(?:needs?|wants?|calls?\s+for)\b.*\bcollab(?:oration)?\s+album\b/.test(normalized) ||
    /\b(?:rumou?red|set to)\b.*\b(?:album|collab|song)\b.*\bwhat we know\b/.test(normalized) ||
    /\bhow\b.*\bbecame\b.*\b(?:star|viral|famous|popular)\b/.test(normalized) ||
    /\bviral\s+chaos\b/.test(normalized) ||
    /\bdeath\s+(?:rumou?r|hoax)\b/.test(normalized) ||
    /\brumou?rs?\s+debunked\b/.test(normalized)
  );
}

export function isUncorroboratedLowTierMarketClaim({
  sourceTier,
  classificationReason,
  corroborated = false,
  corroboratingSourceCount = 0
}: {
  sourceTier: number;
  classificationReason: string;
  corroborated?: boolean;
  corroboratingSourceCount?: number;
}) {
  return (
    sourceTier <= 0 &&
    LOW_TIER_CLAIMS_REQUIRING_CORROBORATION.has(classificationReason) &&
    !corroborated &&
    corroboratingSourceCount < 2
  );
}

function getArtistAliases(artistName: string, query?: string) {
  return Array.from(
    new Set(
      [artistName, ...extractQuotedSearchPhrases(query)]
        .map((alias) => normalizeEventSearchText(alias))
        .filter(Boolean)
    )
  );
}

function hasStrongArtistCatalystContext(normalizedText: string, normalizedAlias: string) {
  if (!normalizedAlias || !containsNormalizedPhrase(normalizedText, normalizedAlias)) {
    return false;
  }

  const catalystAlternation = CATALYST_TERMS.map(escapeRegex).join("|");
  const alias = escapeRegex(normalizedAlias);
  const patterns = [
    // A performer can be the subject without a catalyst immediately following
    // their name. Keep this bounded to performance verbs and concert context;
    // mere co-occurrence of a common-word name and "tour" is insufficient.
    new RegExp(`^${alias}\\s+(?:brings? out|brought out|surpasses?|welcomes?)\\b(?:\\s+\\w+){0,16}\\s+(?:show|concert|tour|festival|stage)\\b`),
    new RegExp(`\\b${alias}\\s+(?:${catalystAlternation})\\b`),
    new RegExp(`\\b(?:${catalystAlternation})\\s+(?:from|by|with|for|to|against)\\s+${alias}\\b`),
    new RegExp(`\\b(?:rapper|rap artist|hip hop artist|artist)\\s+${alias}\\b`),
    new RegExp(`\\b${alias}\\s+(?:the\\s+)?(?:rapper|rap artist|hip hop artist|artist)\\b`),
    new RegExp(`\\b(?:feat|ft|featuring|with|alongside)\\s+${alias}\\b`),
    new RegExp(`\\b(?:response to|responds to|responding to|beef with|disses|calls out|fights?)\\s+${alias}\\b`),
    new RegExp(`\\b${alias}\\s+(?:responds to|beefs with|disses|calls out|fights?)\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasDirectStatusSubject(
  normalizedText: string,
  normalizedAlias: string,
  statusSubtype?: ArtistStatusSubtype | null
) {
  if (!normalizedAlias || !containsNormalizedPhrase(normalizedText, normalizedAlias)) {
    return false;
  }

  if (hasCreditObjectContext(normalizedText, normalizedAlias)) {
    return false;
  }

  const alias = toRegexPhrase(normalizedAlias);
  const terms = getStatusTerms(statusSubtype).map(escapeRegex).join("|");
  const nouns = getStatusNouns(statusSubtype).map(escapeRegex).join("|");

  if (hasThirdPartyStatusSubjectContext(normalizedText, alias, terms)) {
    return false;
  }

  const qualifiers = "(?:is|was|has\\s+been|reportedly|allegedly|officially|just|now)";
  const personPrefix = "(?:rapper|rap\\s+artist|artist|music\\s+artist|singer|producer)";
  const patterns = [
    new RegExp(`\\b${alias}\\b(?:\\s+${qualifiers}){0,2}\\s+(?:${terms})\\b`),
    new RegExp(`\\b${personPrefix}\\s+${alias}\\b(?:\\s+${qualifiers}){0,2}\\s+(?:${terms})\\b`),
    new RegExp(`\\b(?:${nouns})\\s+(?:of|for)\\s+${alias}\\b`),
    new RegExp(`\\b${alias}(?:\\s+s|'s|’s)?\\s+(?:${nouns})\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasThirdPartyStatusSubjectContext(normalizedText: string, alias: string, statusTerms: string) {
  const thirdParty =
    "(?:associate|brother|crew\\s+member|executive|father|founder|friend|label\\s+head|manager|mother|parent|photographer|producer|relative|sister|staffer|team\\s+member|videographer)";
  const relationship =
    "(?:associated\\s+with|for|helped\\s+launch|known\\s+for|managed|manager\\s+of|of|signed|worked\\s+with)";
  const patterns = [
    new RegExp(`\\b${thirdParty}\\b.*\\b${relationship}\\b.*\\b${alias}\\b.*\\b(?:${statusTerms})\\b`),
    new RegExp(`\\b${thirdParty}\\b.*\\b(?:${statusTerms})\\b.*\\b${relationship}\\b.*\\b${alias}\\b`),
    new RegExp(`\\b${alias}(?:\\s+s|'s|’s)?\\s+${thirdParty}\\b.*\\b(?:${statusTerms})\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasCreditObjectContext(normalizedText: string, normalizedAlias: string) {
  const alias = toRegexPhrase(normalizedAlias);
  const filler = "(?:\\S+\\s+){0,8}";
  const patterns = [
    new RegExp(`\\b(?:producer|collaborator|songwriter|engineer|manager|friend|labelmate)\\s+(?:for|with|of)\\s+${filler}${alias}\\b`),
    new RegExp(`\\b(?:worked|works|collaborated|collaborates|teamed\\s+up)\\s+(?:with|for|on)\\s+${filler}${alias}\\b`),
    new RegExp(`\\b(?:song|track|single|album|project|beat|production)\\s+(?:for|with|by|from)\\s+${filler}${alias}\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasDirectReleaseSubject(normalizedText: string, normalizedAlias: string) {
  if (!normalizedAlias || !containsNormalizedPhrase(normalizedText, normalizedAlias)) {
    return false;
  }

  if (hasIncidentalDramaContext(normalizedText, normalizedAlias)) {
    return false;
  }

  const alias = toRegexPhrase(normalizedAlias);
  const releaseNouns =
    "(?:album|deluxe|ep|full\\s+length|mixtape|music\\s+video|project|single|song|track|tracklist|video|visualizer)";
  const releaseActions =
    "(?:announces|announced|drops|dropped|delivers|previews|previewed|releases|released|returns\\s+with|shares|shared|stream|teases|teased|unveils|unveiled|watch)";
  const patterns = [
    new RegExp(`\\b${alias}\\b(?:\\s+\\S+){0,5}\\s+${releaseActions}\\b`),
    // Keep ownership adjacent. The old eight-word window turned headlines such
    // as "takes shots at Kendrick Lamar on new album" into Kendrick releases.
    new RegExp(`\\b${alias}\\b(?:\\s+s)?\\s+(?:(?:new|latest|upcoming)\\s+)?${releaseNouns}\\b`),
    new RegExp(`\\b${releaseNouns}\\s+(?:from|by)\\s+${alias}\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasIncidentalDramaContext(normalizedText: string, normalizedAlias: string) {
  const alias = toRegexPhrase(normalizedAlias);
  const patterns = [
    new RegExp(`\\b(?:amid|after|following|during|over)\\s+${alias}\\s+(?:beef|controversy|drama|feud)\\b`),
    new RegExp(`\\b(?:beef|controversy|drama|feud)\\s+(?:around|involving|with)\\s+${alias}\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasIncidentalControversyContext(normalizedText: string, normalizedAlias: string) {
  const alias = toRegexPhrase(normalizedAlias);
  const filler = "(?:\\S+\\s+){0,5}";
  const patterns = [
    new RegExp(`\\b(?:drag|drags|dragged|pull|pulls|pulled|bring|brings|brought)\\s+${filler}${alias}\\s+(?:into|in\\s+to)\\s+(?:his\\s+|her\\s+|their\\s+|the\\s+)?(?:beef|controversy|drama|feud)\\b`),
    new RegExp(`\\b(?:beef|controversy|drama|feud)\\s+over\\s+(?:calling\\s+out|mentioning|referencing)\\s+${alias}\\b`),
    new RegExp(`\\b(?:uses|used|mentions|mentioned|references|referenced)\\s+${filler}${alias}\\s+(?:to|while)\\s+(?:explain|defend|attack|drag)\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function hasControversyActorContext(normalizedText: string, normalizedAlias: string) {
  const alias = toRegexPhrase(normalizedAlias);

  return new RegExp(
    `\\b${alias}\\b(?:\\s+\\S+){0,3}\\s+(?:accuses|calls\\s+out|criticizes|denies|slams)\\b`
  ).test(normalizedText);
}

function hasDirectControversySubjectContext(normalizedText: string, normalizedAlias: string) {
  const alias = toRegexPhrase(normalizedAlias);
  const controversyNouns =
    "(?:allegation|allegations|arrest|backlash|boycott|case|charge|charges|controversy|criticism|indictment|lawsuit|sentencing|trial)";
  const controversyActions =
    "(?:accused|arrested|booked|charged|criticized|faces|facing|indicted|sentenced|sued|under\\s+fire)";
  const qualifier = "(?:civil|criminal|defamation|federal|legal|murder|rape|sexual\\s+assault)";
  const patterns = [
    new RegExp(`\\b${alias}\\b(?:\\s+(?:is|was|has\\s+been|reportedly|allegedly))?\\s+${controversyActions}\\b`),
    new RegExp(`\\b${alias}(?:\\s+s|'s|’s)?(?:\\s+${qualifier}){0,2}\\s+${controversyNouns}\\b`),
    new RegExp(`\\b${controversyNouns}\\s+(?:against|involving|of)\\s+${alias}\\b`),
    new RegExp(`\\b${alias}\\b(?:\\s+\\S+){0,3}\\s+(?:must|will)\\s+face\\s+(?:a\\s+)?(?:lawsuit|trial)\\b`),
    new RegExp(`\\b${alias}(?:\\s+s|'s|’s)?\\s+(?:attorneys?|lawyers?)\\b`),
    new RegExp(`\\b(?:attorneys?|lawyers?)\\s+(?:for|representing)\\s+${alias}\\b`),
    new RegExp(`\\b${alias}(?:\\s+s|'s|’s)?(?:\\s+\\S+){0,6}\\s+(?:criminal\\s+|murder(?:\\s+plot\\s+|\\s+for\\s+hire\\s+)?)?trial\\b`)
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function getStatusTerms(statusSubtype?: ArtistStatusSubtype | null) {
  switch (statusSubtype) {
    case "death":
      return ["dead", "died", "dies", "fatally shot", "found dead", "killed", "passed away", "passes away", "shot and killed"];
    case "legal_arrest":
      return ["arrested", "booked", "taken into custody"];
    case "legal_charge":
      return ["charged", "faces charge", "faces charges", "indicted"];
    case "legal_conviction":
      return ["convicted", "found guilty", "pleaded guilty", "pleads guilty"];
    case "legal_sentencing":
      return ["gets jail sentence", "gets prison sentence", "sentenced", "sentenced to"];
    case "legal_incarceration":
      return ["behind bars", "in custody", "in jail", "in prison", "incarcerated", "jailed"];
    case "legal_release":
      return ["freed from jail", "freed from prison", "out of jail", "out of prison", "released from jail", "released from prison", "released on bail"];
    case "hospitalization":
      return ["hospitalized", "in hospital", "in intensive care", "on life support"];
    case "injury":
      return ["injured", "shot", "wounded"];
    default:
      return [
        "arrested",
        "charged",
        "convicted",
        "dead",
        "died",
        "dies",
        "fatally shot",
        "found dead",
        "hospitalized",
        "incarcerated",
        "injured",
        "killed",
        "passed away",
        "released from jail",
        "released from prison",
        "sentenced",
        "shot and killed",
        "wounded"
      ];
  }
}

function getStatusNouns(statusSubtype?: ArtistStatusSubtype | null) {
  switch (statusSubtype) {
    case "death":
      return ["death", "killing"];
    case "legal_arrest":
      return ["arrest"];
    case "legal_charge":
      return ["charge", "charges", "indictment"];
    case "legal_conviction":
      return ["conviction", "guilty plea"];
    case "legal_sentencing":
      return ["jail sentence", "prison sentence", "sentencing", "sentence"];
    case "legal_incarceration":
      return ["incarceration", "jail time", "prison time"];
    case "legal_release":
      return ["jail release", "prison release", "release"];
    case "hospitalization":
      return ["hospitalization"];
    case "injury":
      return ["injury", "shooting", "wounding"];
    default:
      return [
        "arrest",
        "charges",
        "conviction",
        "death",
        "hospitalization",
        "injury",
        "jail release",
        "killing",
        "prison release",
        "sentencing",
        "shooting"
      ];
  }
}

function isAmbiguousAlias(normalizedAlias: string) {
  const compact = normalizedAlias.replace(/\s+/g, "");
  const wordCount = normalizedAlias.split(/\s+/).filter(Boolean).length;

  return compact.length <= 3 || (wordCount === 1 && compact.length <= 4);
}

function isCommonWordAlias(normalizedAlias: string) {
  return COMMON_WORD_ARTIST_KEYS.has(getArtistTextKey(normalizedAlias));
}

function containsNormalizedPhrase(normalizedText: string, normalizedPhrase: string) {
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function toRegexPhrase(normalizedPhrase: string) {
  return normalizedPhrase.split(/\s+/).map(escapeRegex).join("\\s+");
}

function extractQuotedSearchPhrases(query?: string) {
  if (!query) {
    return [];
  }

  return [...query.matchAll(/"([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
}

function normalizeEventSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\$/g, "s")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
