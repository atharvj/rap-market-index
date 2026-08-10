import { decodeHtmlEntities } from "@/lib/html-entities";

type ArticleMetadataVerifierOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
  requestSpacingMs?: number;
};

export type VerifiedArticleMetadata = {
  canonicalUrl: string;
  publishedDate: string;
  headline: string;
  pageType: "article" | "news_article" | "review" | "blog_posting" | "report";
  summary?: string;
};

export type ArticleMetadataVerification =
  | { ok: true; metadata: VerifiedArticleMetadata }
  | { ok: false; reason: string };

const GOOGLE_NEWS_HOST = "news.google.com";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_REQUEST_SPACING_MS = 125;
const MAX_FETCH_ATTEMPTS = 3;
const MAX_ARTICLE_HTML_BYTES = 2_500_000;

export function createArticleMetadataVerifier({
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = 8,
  requestSpacingMs = DEFAULT_REQUEST_SPACING_MS
}: ArticleMetadataVerifierOptions = {}) {
  const cache = new Map<string, Promise<ArticleMetadataVerification>>();
  const limit = createConcurrencyLimiter(concurrency);
  const pace = createTaskPacer(requestSpacingMs);

  return {
    verifyGoogleNewsUrl(sourceUrl: string) {
      const cacheKey = `google:${normalizeUrlForCache(sourceUrl)}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      const verification = limit(async () => {
        await pace();
        return verifyGoogleNewsArticle({ sourceUrl, fetchImpl, timeoutMs });
      });
      cache.set(cacheKey, verification);
      return verification;
    },
    verifyPublisherArticleUrl(sourceUrl: string) {
      const cacheKey = `publisher:${normalizeUrlForCache(sourceUrl)}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      const verification = limit(async () => {
        await pace();
        return verifyPublisherArticle({ sourceUrl, fetchImpl, timeoutMs });
      });
      cache.set(cacheKey, verification);
      return verification;
    }
  };
}

export function isGoogleNewsArticleUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === GOOGLE_NEWS_HOST && /\/(?:rss\/)?articles\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

async function verifyGoogleNewsArticle({
  sourceUrl,
  fetchImpl,
  timeoutMs
}: {
  sourceUrl: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<ArticleMetadataVerification> {
  const articleId = getGoogleNewsArticleId(sourceUrl);

  if (!articleId) {
    return { ok: false, reason: "invalid_google_news_url" };
  }

  try {
    const decoderPage = await fetchTextWithTimeout({
      url: `https://${GOOGLE_NEWS_HOST}/articles/${encodeURIComponent(articleId)}?hl=en-US&gl=US&ceid=US:en`,
      fetchImpl,
      timeoutMs,
      headers: { accept: "text/html" }
    });
    const timestamp = getHtmlAttribute(decoderPage.text, "data-n-a-ts");
    const signature = getHtmlAttribute(decoderPage.text, "data-n-a-sg");

    if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
      return { ok: false, reason: "missing_google_news_decoder_metadata" };
    }

    const decodedUrl = await decodeGoogleNewsArticleUrl({
      articleId,
      timestamp: Number(timestamp),
      signature,
      fetchImpl,
      timeoutMs
    });

    if (!decodedUrl) {
      return { ok: false, reason: "google_news_decode_failed" };
    }

    return verifyPublisherArticle({ sourceUrl: decodedUrl, fetchImpl, timeoutMs });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 120) : "article_verification_failed"
    };
  }
}

async function verifyPublisherArticle({
  sourceUrl,
  fetchImpl,
  timeoutMs
}: {
  sourceUrl: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<ArticleMetadataVerification> {
  if (!isSafePublisherUrl(sourceUrl)) {
    return { ok: false, reason: "unsafe_publisher_url" };
  }

  try {
    const publisherPage = await fetchTextWithTimeout({
      url: sourceUrl,
      fetchImpl,
      timeoutMs,
      headers: { accept: "text/html,application/xhtml+xml" }
    });
    const finalUrl = publisherPage.finalUrl ?? sourceUrl;

    if (!isSafePublisherUrl(finalUrl)) {
      return { ok: false, reason: "unsafe_publisher_redirect" };
    }

    if (
      publisherPage.contentType &&
      !publisherPage.contentType.includes("text/html") &&
      !publisherPage.contentType.includes("application/xhtml+xml")
    ) {
      return { ok: false, reason: "publisher_response_not_html" };
    }

    const canonicalUrl = getCanonicalUrl(publisherPage.text, finalUrl);

    if (!canonicalUrl) {
      return { ok: false, reason: "missing_canonical_url" };
    }

    if (isLikelyNonArticlePageUrl(canonicalUrl)) {
      return { ok: false, reason: "non_article_page" };
    }

    const articleMetadata = getPublisherArticleMetadata(publisherPage.text, canonicalUrl);

    if (!articleMetadata) {
      return { ok: false, reason: "non_article_page" };
    }

    if (!articleMetadata.headline) {
      return { ok: false, reason: "missing_publisher_headline" };
    }

    if (!articleMetadata.publishedDate) {
      return { ok: false, reason: "missing_publisher_date" };
    }

    const summary = getPublisherSummary(publisherPage.text, articleMetadata.jsonLdNode);

    return {
      ok: true,
      metadata: {
        canonicalUrl,
        headline: articleMetadata.headline,
        publishedDate: articleMetadata.publishedDate,
        pageType: articleMetadata.pageType,
        ...(summary ? { summary } : {})
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 120) : "article_verification_failed"
    };
  }
}

async function decodeGoogleNewsArticleUrl({
  articleId,
  timestamp,
  signature,
  fetchImpl,
  timeoutMs
}: {
  articleId: string;
  timestamp: number;
  signature: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}) {
  const requestPayload = [
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0
    ],
    articleId,
    timestamp,
    signature
  ];
  const form = new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(requestPayload), null, "generic"]]])
  });
  const result = await fetchTextWithTimeout({
    url: `https://${GOOGLE_NEWS_HOST}/_/DotsSplashUi/data/batchexecute`,
    fetchImpl,
    timeoutMs,
    method: "POST",
    body: form,
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }
  });
  const responseLine = result.text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("[[\"wrb.fr\""));

  if (!responseLine) {
    return null;
  }

  try {
    const response = JSON.parse(responseLine) as unknown[][];
    const encodedResult = response.find((entry) => entry[0] === "wrb.fr" && entry[1] === "Fbv4je")?.[2];

    if (typeof encodedResult !== "string") {
      return null;
    }

    const decodedResult = JSON.parse(encodedResult) as unknown[];
    const candidate = decodedResult[0] === "garturlres" ? decodedResult[1] : null;

    return typeof candidate === "string" && isSafePublisherUrl(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function fetchTextWithTimeout({
  url,
  fetchImpl,
  timeoutMs,
  method = "GET",
  body,
  headers = {}
}: {
  url: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  method?: "GET" | "POST";
  body?: BodyInit;
  headers?: Record<string, string>;
}) {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method,
        body,
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; RMIArticleDateVerifier/1.0)",
          ...headers
        }
      });
      const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);

      if (Number.isFinite(contentLength) && contentLength > MAX_ARTICLE_HTML_BYTES) {
        throw new Error("article_verification_response_too_large");
      }

      const text = await response.text();

      if (text.length > MAX_ARTICLE_HTML_BYTES) {
        throw new Error("article_verification_response_too_large");
      }

      if (response.ok) {
        return {
          text,
          finalUrl: response.url || url,
          contentType: response.headers.get("content-type")?.toLowerCase() ?? ""
        };
      }

      if (!isRetryableStatus(response.status) || attempt === MAX_FETCH_ATTEMPTS - 1) {
        throw new Error(`article_verification_http_${response.status}`);
      }

      await sleep(getRetryDelayMs(response.headers.get("retry-after"), attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("article_verification_failed");
}

function getGoogleNewsArticleId(value: string) {
  try {
    const url = new URL(value);

    if (url.hostname !== GOOGLE_NEWS_HOST) {
      return null;
    }

    const match = url.pathname.match(/\/(?:rss\/)?articles\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function getCanonicalUrl(html: string, fallbackUrl: string) {
  const canonicalTag = Array.from(html.matchAll(/<link\b[^>]*>/gi), (match) => match[0]).find((tag) => {
    const rel = getTagAttribute(tag, "rel");
    return rel?.toLowerCase().split(/\s+/).includes("canonical");
  });
  const candidate = getTagAttribute(canonicalTag ?? "", "href") ?? fallbackUrl;

  return isSafePublisherUrl(candidate) ? stripTrackingParameters(candidate) : null;
}

type JsonLdNode = Record<string, unknown>;

type PublisherArticleMetadata = {
  headline: string | null;
  publishedDate: string | null;
  pageType: VerifiedArticleMetadata["pageType"];
  jsonLdNode?: JsonLdNode;
};

const ARTICLE_JSON_LD_TYPES = new Map<string, VerifiedArticleMetadata["pageType"]>([
  ["article", "article"],
  ["newsarticle", "news_article"],
  ["review", "review"],
  ["musicreview", "review"],
  ["criticreview", "review"],
  ["blogposting", "blog_posting"],
  ["report", "report"]
]);

function getPublisherArticleMetadata(html: string, canonicalUrl: string): PublisherArticleMetadata | null {
  const jsonLdArticles = getJsonLdArticleNodes(html);
  const linkedJsonLdArticle = jsonLdArticles
    .map((node) => ({ node, score: getJsonLdPageMatchScore(node, canonicalUrl) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score)[0]?.node;
  const ogType = getMetaContent(html, ["og:type"])?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  const ogArticleType = ARTICLE_JSON_LD_TYPES.get(ogType);
  const metaPublishedDate = getPublisherMetaDate(html);
  const singleArticleElement = (html.match(/<article\b/gi) ?? []).length === 1;
  const jsonLdNode = linkedJsonLdArticle ?? (ogArticleType && jsonLdArticles.length === 1 ? jsonLdArticles[0] : undefined);
  const jsonLdPageType = jsonLdNode ? getJsonLdArticleType(jsonLdNode) : null;
  const pageType = jsonLdPageType ?? ogArticleType ?? (metaPublishedDate ? "article" : null);

  if (!pageType && !singleArticleElement) {
    return null;
  }

  const publishedDate =
    getJsonLdDate(jsonLdNode) ??
    metaPublishedDate ??
    (singleArticleElement ? getSingleArticleElementDate(html) : null);
  const headline =
    normalizePublisherText(getJsonLdString(jsonLdNode, "headline")) ??
    normalizePublisherText(getJsonLdString(jsonLdNode, "name")) ??
    getPublisherHeadline(html);

  return {
    headline,
    publishedDate,
    pageType: pageType ?? "article",
    ...(jsonLdNode ? { jsonLdNode } : {})
  };
}

function getJsonLdArticleNodes(html: string) {
  const nodes: JsonLdNode[] = [];

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const payload = match[1]?.trim();

    if (!payload) {
      continue;
    }

    try {
      collectJsonLdNodes(JSON.parse(payload), nodes);
    } catch {
      // Invalid structured data cannot prove that this is an article page.
    }
  }

  return nodes.filter((node) => Boolean(getJsonLdArticleType(node)));
}

function collectJsonLdNodes(value: unknown, nodes: JsonLdNode[]) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdNodes(item, nodes);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const node = value as JsonLdNode;
  nodes.push(node);

  if (Array.isArray(node["@graph"])) {
    collectJsonLdNodes(node["@graph"], nodes);
  }
}

function getJsonLdArticleType(node: JsonLdNode) {
  const values = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const pageType = ARTICLE_JSON_LD_TYPES.get(value.toLowerCase().replace(/[^a-z]/g, ""));

    if (pageType) {
      return pageType;
    }
  }

  return null;
}

function getJsonLdPageMatchScore(node: JsonLdNode, canonicalUrl: string) {
  const candidates = [
    getJsonLdUrl(node.url),
    getJsonLdUrl(node.mainEntityOfPage),
    getJsonLdUrl(node["@id"])
  ].filter((value): value is string => Boolean(value));
  const matchesCanonical = candidates.some((value) => areEquivalentArticleUrls(value, canonicalUrl));

  if (!matchesCanonical) {
    return 0;
  }

  let score = 8;

  if (getJsonLdString(node, "headline")) {
    score += 2;
  }

  if (getJsonLdDate(node)) {
    score += 2;
  }

  return score;
}

function getJsonLdUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return typeof record["@id"] === "string"
      ? record["@id"]
      : typeof record.url === "string"
        ? record.url
        : null;
  }

  return null;
}

function getJsonLdString(node: JsonLdNode | undefined, key: string) {
  const value = node?.[key];
  return typeof value === "string" ? value : null;
}

function getJsonLdDate(node: JsonLdNode | undefined) {
  return normalizePublishedDate(getJsonLdString(node, "datePublished"));
}

function areEquivalentArticleUrls(first: string, second: string) {
  try {
    const normalize = (value: string) => {
      const url = new URL(decodeHtml(value));
      url.hash = "";
      url.search = "";
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname}`;
    };

    return normalize(first) === normalize(second);
  } catch {
    return false;
  }
}

function getPublisherMetaDate(html: string) {
  const value = getMetaContent(html, [
    "article:published_time",
    "datepublished",
    "pubdate",
    "publishdate",
    "publish-date"
  ]);

  return normalizePublishedDate(value);
}

function getSingleArticleElementDate(html: string) {
  const article = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0];

  if (!article) {
    return null;
  }

  for (const tag of Array.from(article.matchAll(/<time\b[^>]*>/gi), (match) => match[0])) {
    const itemProp = getTagAttribute(tag, "itemprop")?.toLowerCase();

    if (itemProp !== "datepublished") {
      continue;
    }

    const publishedDate = normalizePublishedDate(getTagAttribute(tag, "datetime"));

    if (publishedDate) {
      return publishedDate;
    }
  }

  return null;
}

function getPublisherHeadline(html: string) {
  const metaHeadline = getMetaContent(html, ["og:title", "twitter:title"]);

  if (metaHeadline) {
    return normalizePublisherText(metaHeadline);
  }

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return normalizePublisherText(h1) ?? normalizePublisherText(title);
}

function getMetaContent(html: string, acceptedKeys: string[]) {
  const normalizedKeys = new Set(acceptedKeys.map((key) => key.toLowerCase()));

  for (const tag of Array.from(html.matchAll(/<meta\b[^>]*>/gi), (match) => match[0])) {
    const key = (
      getTagAttribute(tag, "property") ??
      getTagAttribute(tag, "name") ??
      getTagAttribute(tag, "itemprop") ??
      ""
    ).toLowerCase();

    if (!normalizedKeys.has(key)) {
      continue;
    }

    const content = getTagAttribute(tag, "content");

    if (content) {
      return content;
    }
  }

  return null;
}

function getPublisherSummary(html: string, jsonLdNode?: JsonLdNode) {
  const metaSummary = getMetaContent(html, ["description", "og:description", "twitter:description"]);
  const summary = normalizePublisherSummary(metaSummary);

  if (summary) {
    return summary;
  }

  return normalizePublisherSummary(getJsonLdString(jsonLdNode, "description"));
}

function normalizePublisherText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, 300) : null;
}

function isLikelyNonArticlePageUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";

    if (path === "/" || /\.(?:xml|rss|json)$/.test(path)) {
      return true;
    }

    if (/^\/(?:artists?|authors?|contributors?|tags?|topics?|categories?|search)(?:\/|$)/.test(path)) {
      return true;
    }

    if (/^\/(?:news|reviews?|features?|lists?|columns?|video|music|rap)$/.test(path)) {
      return true;
    }

    return url.searchParams.has("s") || url.searchParams.has("search");
  } catch {
    return true;
  }
}

function normalizePublisherSummary(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, 1_200) : null;
}

function normalizePublishedDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const time = new Date(decodeHtml(value)).getTime();

  if (!Number.isFinite(time)) {
    return null;
  }

  const date = new Date(time);
  const year = date.getUTCFullYear();

  if (year < 2000 || year > 2100) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function getHtmlAttribute(html: string, attributeName: string) {
  const match = html.match(new RegExp(`${escapeRegExp(attributeName)}=["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : null;
}

function getTagAttribute(tag: string, attributeName: string) {
  return getHtmlAttribute(tag, attributeName);
}

function stripTrackingParameters(value: string) {
  const url = new URL(decodeHtml(value));

  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|mc_|bil$|debugld$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }

  url.hash = "";
  return url.toString();
}

function isSafePublisherUrl(value: string) {
  try {
    const url = new URL(decodeHtml(value));
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !hostname ||
      hostname === GOOGLE_NEWS_HOST ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port))
    ) {
      return false;
    }

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:")
    ) {
      return false;
    }

    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      const [first, second] = octets;

      if (
        octets.some((octet) => octet > 255) ||
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeUrlForCache(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function decodeHtml(value: string) {
  return decodeHtmlEntities(value).replace(/&#x2F;/gi, "/");
}

function createConcurrencyLimiter(limit: number) {
  const maximum = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    while (active < maximum && queue.length) {
      const start = queue.shift();
      active += 1;
      start?.();
    }
  };

  return function limitTask<T>(task: () => Promise<T>) {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            runNext();
          });
      });
      runNext();
    });
  };
}

function createTaskPacer(spacingMs: number) {
  const spacing = Math.max(0, Math.floor(spacingMs));
  let nextStart = 0;
  let sequence = Promise.resolve();

  return function paceTask() {
    const scheduled = sequence.then(async () => {
      const waitMs = Math.max(0, nextStart - Date.now());

      if (waitMs > 0) {
        await sleep(waitMs);
      }

      nextStart = Date.now() + spacing;
    });
    sequence = scheduled.catch(() => undefined);
    return scheduled;
  };
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

function getRetryDelayMs(retryAfter: string | null, attempt: number) {
  const retryAfterSeconds = Number.parseFloat(retryAfter ?? "");

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(5_000, retryAfterSeconds * 1_000);
  }

  return 400 * 2 ** attempt;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
