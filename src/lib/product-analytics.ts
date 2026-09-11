export const PUBLIC_PRODUCT_EVENT_NAMES = [
  "session_start",
  "page_view",
  "artist_view",
  "signup_started"
] as const;

export type PublicProductEventName = (typeof PUBLIC_PRODUCT_EVENT_NAMES)[number];
export type ProductAuthMethod = "email" | "google";

export type ProductAnalyticsEventInput = {
  eventName: PublicProductEventName;
  visitorId: string;
  sessionId: string;
  path?: string;
  artistId?: string;
  authMethod?: ProductAuthMethod;
  campaignSource?: string | null;
  campaignMedium?: string | null;
  campaignName?: string | null;
  referrerHost?: string | null;
};

export type ValidatedProductAnalyticsEvent = {
  eventName: PublicProductEventName;
  visitorId: string;
  sessionId: string;
  path: string | null;
  artistId: string | null;
  authMethod: ProductAuthMethod | null;
  campaignSource: string | null;
  campaignMedium: string | null;
  campaignName: string | null;
  referrerHost: string | null;
};

const VISITOR_KEY = "rmi-analytics-visitor-v1";
const SESSION_KEY = "rmi-analytics-session-v1";
const CAMPAIGN_KEY = "rmi-analytics-campaign-v1";
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ARTIST_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateProductAnalyticsEvent(value: unknown):
  | { ok: true; value: ValidatedProductAnalyticsEvent }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Invalid analytics event." };
  }

  const input = value as Partial<ProductAnalyticsEventInput>;

  if (!PUBLIC_PRODUCT_EVENT_NAMES.includes(input.eventName as PublicProductEventName)) {
    return { ok: false, error: "Unsupported analytics event." };
  }

  if (
    typeof input.visitorId !== "string" ||
    !IDENTIFIER_PATTERN.test(input.visitorId) ||
    typeof input.sessionId !== "string" ||
    !IDENTIFIER_PATTERN.test(input.sessionId)
  ) {
    return { ok: false, error: "Invalid analytics identifier." };
  }

  const path = normalizeAnalyticsPath(input.path);
  const artistId = normalizeArtistId(input.artistId);
  const authMethod = input.authMethod === "email" || input.authMethod === "google" ? input.authMethod : null;

  if (input.eventName === "artist_view" && !artistId) {
    return { ok: false, error: "Artist views require an artist identifier." };
  }

  if (input.eventName === "signup_started" && !authMethod) {
    return { ok: false, error: "Signup events require an authentication method." };
  }

  return {
    ok: true,
    value: {
      eventName: input.eventName as PublicProductEventName,
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      path,
      artistId,
      authMethod,
      campaignSource: normalizeCampaignValue(input.campaignSource, 80),
      campaignMedium: normalizeCampaignValue(input.campaignMedium, 80),
      campaignName: normalizeCampaignValue(input.campaignName, 100),
      referrerHost: normalizeReferrerHost(input.referrerHost)
    }
  };
}

export function trackProductEvent(
  event: Omit<ProductAnalyticsEventInput, "visitorId" | "sessionId">,
  accessToken?: string
) {
  if (typeof window === "undefined" || window.navigator.doNotTrack === "1") {
    return;
  }

  let context: ReturnType<typeof getBrowserAnalyticsContext>;
  try { context = getBrowserAnalyticsContext(); } catch { return; }
  const payload: ProductAnalyticsEventInput = {
    ...event,
    ...context
  };

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {
    // Analytics must never interfere with navigation, signup, or trading.
  });
}

export function getBrowserAnalyticsContext() {
  const visitorId = getOrCreateStorageIdentifier(window.localStorage, VISITOR_KEY);
  const sessionId = getOrCreateStorageIdentifier(window.sessionStorage, SESSION_KEY);
  const campaign = getOrCreateCampaignContext();

  return {
    visitorId,
    sessionId,
    ...campaign
  };
}

export function normalizeAnalyticsPath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const path = value.trim().split(/[?#]/, 1)[0];

  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 240 || /[\u0000-\u001f\u007f]/.test(path)) {
    return null;
  }

  if (/^\/users\/[^/]+$/.test(path)) return "/users/profile";
  if (/^\/artists\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)) return path;
  const publicPaths = new Set(["/", "/account", "/account/confirmed", "/account/reset-password", "/onboarding", "/markets", "/news", "/portfolio", "/watchlist", "/leaderboard", "/rankings", "/settings", "/help", "/about", "/privacy", "/terms", "/scout", "/leagues"]);
  return publicPaths.has(path) ? path : null;
}

function normalizeArtistId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length <= 80 && ARTIST_ID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeCampaignValue(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);

  return normalized || null;
}

function normalizeReferrerHost(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const host = value.trim().toLowerCase().replace(/^www\./, "");

  if (!host || host.length > 160 || !/^[a-z0-9.-]+$/.test(host)) {
    return null;
  }

  return host;
}

function getOrCreateStorageIdentifier(storage: Storage, key: string) {
  try {
    const existing = storage.getItem(key);

    if (existing && IDENTIFIER_PATTERN.test(existing)) {
      return existing;
    }

    const created = createIdentifier();
    storage.setItem(key, created);
    return created;
  } catch {
    return createIdentifier();
  }
}

function createIdentifier() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function getOrCreateCampaignContext() {
  try {
    const query = new URLSearchParams(window.location.search);
    const incoming = {
      campaignSource: normalizeCampaignValue(query.get("utm_source"), 80),
      campaignMedium: normalizeCampaignValue(query.get("utm_medium"), 80),
      campaignName: normalizeCampaignValue(query.get("utm_campaign"), 100),
      referrerHost: getExternalReferrerHost()
    };
    const hasIncomingCampaign = Boolean(
      incoming.campaignSource || incoming.campaignMedium || incoming.campaignName || incoming.referrerHost
    );

    const saved = window.sessionStorage.getItem(CAMPAIGN_KEY);

    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      return {
        campaignSource: normalizeCampaignValue(parsed.campaignSource, 80),
        campaignMedium: normalizeCampaignValue(parsed.campaignMedium, 80),
        campaignName: normalizeCampaignValue(parsed.campaignName, 100),
        referrerHost: normalizeReferrerHost(parsed.referrerHost)
      };
    }
    if (hasIncomingCampaign) {
      window.sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(incoming));
      return incoming;
    }


  } catch {
    // Storage can be unavailable in strict privacy modes.
  }

  return {
    campaignSource: null,
    campaignMedium: null,
    campaignName: null,
    referrerHost: getExternalReferrerHost()
  };
}

function getExternalReferrerHost() {
  try {
    if (!document.referrer) {
      return null;
    }

    const referrer = new URL(document.referrer);

    if (referrer.origin === window.location.origin) {
      return null;
    }

    return normalizeReferrerHost(referrer.hostname);
  } catch {
    return null;
  }
}
