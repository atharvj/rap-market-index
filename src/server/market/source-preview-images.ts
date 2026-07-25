import { getSourceTier } from "@/server/market/gdelt-source";

const MAX_SOURCE_PAGES = 40;
const MAX_CONCURRENT_REQUESTS = 8;
const MAX_HTML_BYTES = 640_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 6_500;

export async function loadSourcePreviewImageUrls(sourceUrls: Array<string | null>) {
  const uniqueUrls = [...new Set(sourceUrls.filter((value): value is string => Boolean(value)))].slice(0, MAX_SOURCE_PAGES);
  const entries: Array<readonly [string, string | null]> = [];

  for (let index = 0; index < uniqueUrls.length; index += MAX_CONCURRENT_REQUESTS) {
    const batch = uniqueUrls.slice(index, index + MAX_CONCURRENT_REQUESTS);
    entries.push(
      ...(await Promise.all(
        batch.map(async (sourceUrl) => [sourceUrl, await loadSourcePreviewImageUrl(sourceUrl)] as const)
      ))
    );
  }

  return new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}

async function loadSourcePreviewImageUrl(sourceUrl: string) {
  const initialPageUrl = getTrustedPublisherUrl(sourceUrl);

  if (!initialPageUrl) {
    return null;
  }

  let pageUrl: URL = initialPageUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response: Response = await fetch(pageUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 RMI-NewsPreview/2.0"
        },
        next: { revalidate: 86_400 }
      });

      if (response.status >= 300 && response.status < 400) {
        const location: string | null = response.headers.get("location");
        const redirectedUrl: URL | null = location
          ? getTrustedPublisherUrl(new URL(location, pageUrl).toString())
          : null;

        if (!redirectedUrl || redirectCount >= MAX_REDIRECTS) {
          return null;
        }

        pageUrl = redirectedUrl;
        continue;
      }

      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/html")) {
        return null;
      }

      const html = await readLimitedText(response.body, MAX_HTML_BYTES);
      const candidates = extractSourcePreviewImageCandidates(html);
      const resolvedCandidates = candidates
        .map((value) => resolveImageUrl(value, pageUrl))
        .filter((value): value is URL => Boolean(value && isPublicHttpUrl(value)));
      const preferred = resolvedCandidates.find((url) => !isLikelyNonArticleImage(url));

      return (preferred ?? resolvedCandidates[0])?.toString() ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export function extractSourcePreviewImageCandidates(html: string) {
  return uniqueStrings([
    ...getMetaContents(html, "property", [
      "og:image:secure_url",
      "og:image:url",
      "og:image"
    ]),
    ...getMetaContents(html, "name", [
      "twitter:image",
      "twitter:image:src",
      "thumbnail"
    ]),
    ...getMetaContents(html, "itemprop", ["image", "thumbnailurl"]),
    ...getLinkImageCandidates(html),
    ...getJsonLdImageCandidates(html),
    ...getArticleImageCandidates(html)
  ]);
}

function resolveImageUrl(value: string, pageUrl: URL) {
  try {
    return new URL(decodeHtmlAttribute(value), pageUrl);
  } catch {
    return null;
  }
}

function isLikelyNonArticleImage(url: URL) {
  const value = `${url.hostname}${url.pathname}`.toLowerCase();

  return /(?:^|[/_.-])(?:avatar|badge|brandmark|favicon|icon|logo|placeholder|sprite)(?:[/_.-]|$)/.test(value);
}

function isPublicHttpUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    isPrivate172Address(hostname) ||
    hostname.startsWith("169.254.") ||
    (hostname.includes(":") && /^(?:fc|fd|fe[89ab])/.test(hostname))
  ) {
    return false;
  }

  return true;
}

function isPrivate172Address(hostname: string) {
  const match = hostname.match(/^172\.(\d{1,3})\./);
  const secondOctet = match ? Number(match[1]) : Number.NaN;

  return Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
}

function getTrustedPublisherUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (url.port && url.port !== "80" && url.port !== "443") ||
      url.username ||
      url.password ||
      getSourceTier(hostname) < 1
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

async function readLimitedText(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = "";

  while (bytesRead < maxBytes) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    result += decoder.decode(value, { stream: true });

    if (bytesRead >= maxBytes) {
      await reader.cancel();
      break;
    }
  }

  return result + decoder.decode();
}

function getMetaContents(
  html: string,
  key: "property" | "name" | "itemprop",
  expectedValues: string[]
) {
  const values: string[] = [];
  const tags = (html.match(/<meta\s+[^>]*>/gi) ?? []).map(getHtmlAttributes);

  for (const expectedValue of expectedValues) {
    const normalizedExpectedValue = expectedValue.toLowerCase();

    for (const attributes of tags) {
      if (attributes[key]?.toLowerCase() === normalizedExpectedValue && attributes.content) {
        values.push(attributes.content);
      }
    }
  }

  return values;
}

function getLinkImageCandidates(html: string) {
  const values: string[] = [];
  const tags = html.match(/<link\s+[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const attributes = getHtmlAttributes(tag);
    const relations = (attributes.rel ?? "").toLowerCase().split(/\s+/);

    if ((relations.includes("image_src") || relations.includes("preload")) && attributes.href) {
      if (!relations.includes("preload") || attributes.as?.toLowerCase() === "image") {
        values.push(attributes.href);
      }
    }
  }

  return values;
}

function getJsonLdImageCandidates(html: string) {
  const values: string[] = [];
  const scripts = html.match(/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>[\s\S]*?<\/script>/gi) ?? [];

  for (const script of scripts) {
    const jsonText = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>\s*$/i, "").trim();

    try {
      collectJsonImageValues(JSON.parse(decodeHtmlAttribute(jsonText)), values, 0);
    } catch {
      continue;
    }
  }

  return values;
}

function collectJsonImageValues(value: unknown, result: string[], depth: number) {
  if (depth > 8 || value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) {
      collectJsonImageValues(item, result, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "image" || normalizedKey === "thumbnailurl" || normalizedKey === "contenturl") {
      collectDirectImageValue(item, result);
    }

    collectJsonImageValues(item, result, depth + 1);
  }
}

function collectDirectImageValue(value: unknown, result: string[]) {
  if (typeof value === "string" && value.trim()) {
    result.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 12)) {
      collectDirectImageValue(item, result);
    }
    return;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    collectDirectImageValue(record.url, result);
    collectDirectImageValue(record.contentUrl, result);
  }
}

function getArticleImageCandidates(html: string) {
  const articleBlocks = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi);
  const mainBlocks = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/gi);
  const content = [...(articleBlocks ?? []), ...(mainBlocks ?? [])].join("\n") || html;
  const values: string[] = [];
  const tags = content.match(/<img\s+[^>]*>/gi) ?? [];

  for (const tag of tags.slice(0, 80)) {
    const attributes = getHtmlAttributes(tag);
    const srcsetValue = getLargestSrcsetCandidate(attributes.srcset ?? attributes["data-srcset"]);
    const value =
      srcsetValue ??
      attributes.src ??
      attributes["data-src"] ??
      attributes["data-lazy-src"] ??
      attributes["data-original"];

    if (value) {
      values.push(value);
    }
  }

  return values;
}

function getLargestSrcsetCandidate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const candidates = value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/))
    .filter((candidate) => Boolean(candidate[0]))
    .map(([url, descriptor]) => ({
      url,
      size: Number.parseFloat(descriptor ?? "0") || 0
    }))
    .sort((first, second) => second.size - first.size);

  return candidates[0]?.url ?? null;
}

function getHtmlAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
