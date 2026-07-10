import { clamp } from "@/lib/pricing";
import type { MarketEvent } from "@/server/market/market-data";

export type ArtistStatusSubtype =
  | "death"
  | "legal_arrest"
  | "legal_charge"
  | "legal_conviction"
  | "legal_sentencing"
  | "legal_incarceration"
  | "legal_release"
  | "hospitalization"
  | "injury";

export type ArtistStatusSeverity = "watch" | "material" | "critical";

export type ArtistStatusClassification = {
  eventType: MarketEvent["eventType"];
  sentimentScore: number;
  impactScore: number;
  baseConfidence: number;
  reason: string;
  statusSubtype: ArtistStatusSubtype;
  statusSeverity: ArtistStatusSeverity;
  statusHaltRecommended: boolean;
};

export function classifyArtistStatusText(
  text: string,
  {
    toneScore = 0,
    engagementImpact = 0
  }: {
    toneScore?: number;
    engagementImpact?: number;
  } = {}
): ArtistStatusClassification | null {
  const normalized = normalizeStatusText(text);

  if (!normalized) {
    return null;
  }

  if (hasDeathSignal(normalized)) {
    return {
      eventType: "news",
      sentimentScore: clamp(-82 + toneScore * 0.2, -100, -35),
      // Death can create a short-term attention spike while also ending active-career upside.
      impactScore: clamp(58 + Math.max(0, engagementImpact) + Math.max(0, toneScore) * 0.25, 18, 88),
      baseConfidence: 0.82,
      reason: "artist_death_status",
      statusSubtype: "death",
      statusSeverity: "critical",
      statusHaltRecommended: true
    };
  }

  if (hasLegalReleaseSignal(normalized)) {
    return {
      eventType: "news",
      sentimentScore: clamp(34 + toneScore * 0.35, -20, 78),
      impactScore: clamp(42 + engagementImpact * 0.55 + Math.max(0, toneScore) * 0.35, -15, 82),
      baseConfidence: 0.7,
      reason: "legal_release_status",
      statusSubtype: "legal_release",
      statusSeverity: "material",
      statusHaltRecommended: false
    };
  }

  if (hasLegalSentencingSignal(normalized)) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(-72 + toneScore * 0.2, -100, -30),
      impactScore: clamp(-76 - engagementImpact * 0.45 + toneScore * 0.15, -100, -18),
      baseConfidence: 0.78,
      reason: "legal_sentencing_status",
      statusSubtype: "legal_sentencing",
      statusSeverity: "critical",
      statusHaltRecommended: false
    };
  }

  if (hasLegalConvictionSignal(normalized)) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(-62 + toneScore * 0.2, -95, -24),
      impactScore: clamp(-62 - engagementImpact * 0.35 + toneScore * 0.15, -95, -12),
      baseConfidence: 0.74,
      reason: "legal_conviction_status",
      statusSubtype: "legal_conviction",
      statusSeverity: "critical",
      statusHaltRecommended: false
    };
  }

  if (hasLegalChargeSignal(normalized)) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(-48 + toneScore * 0.22, -90, -15),
      impactScore: clamp(-46 - engagementImpact * 0.25 + toneScore * 0.15, -88, -8),
      baseConfidence: 0.68,
      reason: "legal_charge_status",
      statusSubtype: "legal_charge",
      statusSeverity: "material",
      statusHaltRecommended: false
    };
  }

  if (hasLegalIncarcerationSignal(normalized)) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(-58 + toneScore * 0.22, -94, -22),
      impactScore: clamp(-60 - engagementImpact * 0.3 + toneScore * 0.15, -96, -12),
      baseConfidence: 0.7,
      reason: "legal_incarceration_status",
      statusSubtype: "legal_incarceration",
      statusSeverity: "critical",
      statusHaltRecommended: false
    };
  }

  if (hasLegalArrestSignal(normalized)) {
    return {
      eventType: "controversy",
      sentimentScore: clamp(-42 + toneScore * 0.22, -88, -10),
      impactScore: clamp(-40 - engagementImpact * 0.22 + toneScore * 0.15, -84, -6),
      baseConfidence: 0.66,
      reason: "legal_arrest_status",
      statusSubtype: "legal_arrest",
      statusSeverity: "material",
      statusHaltRecommended: false
    };
  }

  if (hasHospitalizationSignal(normalized)) {
    return {
      eventType: "news",
      sentimentScore: clamp(-44 + toneScore * 0.25, -90, -12),
      impactScore: clamp(-36 - engagementImpact * 0.15 + toneScore * 0.2, -80, -5),
      baseConfidence: 0.68,
      reason: "hospitalization_status",
      statusSubtype: "hospitalization",
      statusSeverity: "material",
      statusHaltRecommended: false
    };
  }

  if (hasInjurySignal(normalized)) {
    return {
      eventType: "news",
      sentimentScore: clamp(-34 + toneScore * 0.25, -82, -8),
      impactScore: clamp(-28 - engagementImpact * 0.12 + toneScore * 0.2, -70, -4),
      baseConfidence: 0.62,
      reason: "injury_status",
      statusSubtype: "injury",
      statusSeverity: "watch",
      statusHaltRecommended: false
    };
  }

  return null;
}

export function getArtistStatusSubtype(value: unknown): ArtistStatusSubtype | null {
  if (
    value === "death" ||
    value === "legal_arrest" ||
    value === "legal_charge" ||
    value === "legal_conviction" ||
    value === "legal_sentencing" ||
    value === "legal_incarceration" ||
    value === "legal_release" ||
    value === "hospitalization" ||
    value === "injury"
  ) {
    return value;
  }

  return null;
}

export function shouldRecommendStatusTradingHalt(event: MarketEvent) {
  return (
    getArtistStatusSubtype(event.rawPayload.statusSubtype) === "death" &&
    event.rawPayload.statusHaltRecommended === true &&
    event.confidence >= 0.72
  );
}

function normalizeStatusText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDeathSignal(text: string) {
  return STATUS_DEATH_PATTERNS.some((pattern) => pattern.test(text));
}

function hasLegalReleaseSignal(text: string) {
  return hasAny(text, [
    "freed from jail",
    "freed from prison",
    "released after serving",
    "released from custody",
    "released from jail",
    "released from prison",
    "released on bail",
    "out of jail",
    "out of prison"
  ]);
}

function hasLegalSentencingSignal(text: string) {
  return hasAny(text, [
    "gets prison sentence",
    "gets jail sentence",
    "jail sentence",
    "prison sentence",
    "sentenced",
    "sentenced to"
  ]);
}

function hasLegalConvictionSignal(text: string) {
  return hasAny(text, [
    "convicted",
    "found guilty",
    "pleaded guilty",
    "pleads guilty",
    "plea deal"
  ]);
}

function hasLegalChargeSignal(text: string) {
  return hasAny(text, [
    "charged in",
    "charged with",
    "faces charge",
    "faces charges",
    "indicted"
  ]);
}

function hasLegalIncarcerationSignal(text: string) {
  return hasAny(text, [
    "behind bars",
    "in custody",
    "in jail",
    "in prison",
    "incarcerated"
  ]);
}

function hasLegalArrestSignal(text: string) {
  return hasAny(text, [
    "arrested",
    "arrest warrant",
    "booked into",
    "taken into custody"
  ]);
}

function hasHospitalizationSignal(text: string) {
  return hasAny(text, [
    "hospitalized",
    "in hospital",
    "intensive care",
    "life support"
  ]);
}

function hasInjurySignal(text: string) {
  return hasAny(text, [
    "car crash",
    "injured",
    "shot in",
    "wounded"
  ]);
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

const STATUS_DEATH_PATTERNS = [
  /\bdead at \d{1,3}\b/,
  /\bdied at \d{1,3}\b/,
  /\bdies at \d{1,3}\b/,
  /\bdies aged\b/,
  /\bdied after\b/,
  /\bdies after\b/,
  /\bfatally shot\b/,
  /\bfound dead\b/,
  /\bkilled in\b/,
  /\bpassed away\b/,
  /\bpasses away\b/,
  /\bpronounced dead\b/,
  /\bshot and killed\b/
];
