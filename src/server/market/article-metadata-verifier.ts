type ArticleMetadataVerifierOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  concurrency?: number;
  requestSpacingMs?: number;
};

export type VerifiedArticleMetadata = {
  canonicalUrl: string;
  publishedDate: string;
};

export type ArticleMetadataVerification =
  | { ok: true; metadata: VerifiedArticleMetadata }
  | { ok: false; reason: string };

const GOOGLE_NEWS_HOST = "news.google.com";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_REQUEST_SPACING_MS = 125;
const MAX_FETCH_ATTEMPTS = 3;

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
      const cacheKey = normalizeUrlForCache(sourceUrl);
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

    const publisherPage = await fetchTextWithTimeout({
      url: decodedUrl,
      fetchImpl,
      timeoutMs,
      headers: { accept: "text/html,application/xhtml+xml" }
    });
    const canonicalUrl = getCanonicalUrl(publisherPage.text, publisherPage.finalUrl ?? decodedUrl);
    const publishedDate = getPublisherDate(publisherPage.text);

    if (!canonicalUrl) {
      return { ok: false, reason: "missing_canonical_url" };
    }

    if (!publishedDate) {
      return { ok: false, reason: "missing_publisher_date" };
    }

    return {
      ok: true,
      metadata: {
        canonicalUrl,
        publishedDate
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
      const text = await response.text();

      if (response.ok) {
        return { text, finalUrl: response.url || url };
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

function getPublisherDate(html: string) {
  const jsonLdMatch = html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i);
  const jsonLdDate = normalizePublishedDate(jsonLdMatch?.[1]);

  if (jsonLdDate) {
    return jsonLdDate;
  }

  for (const tag of Array.from(html.matchAll(/<meta\b[^>]*>/gi), (match) => match[0])) {
    const key = (
      getTagAttribute(tag, "property") ??
      getTagAttribute(tag, "name") ??
      getTagAttribute(tag, "itemprop") ??
      ""
    ).toLowerCase();

    if (!["article:published_time", "datepublished", "pubdate", "publishdate", "publish-date"].includes(key)) {
      continue;
    }

    const publishedDate = normalizePublishedDate(getTagAttribute(tag, "content"));

    if (publishedDate) {
      return publishedDate;
    }
  }

  for (const tag of Array.from(html.matchAll(/<time\b[^>]*>/gi), (match) => match[0])) {
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
    return ["http:", "https:"].includes(url.protocol) && url.hostname !== GOOGLE_NEWS_HOST;
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
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x2F;/gi, "/");
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
