import { getSourceTier } from "@/server/market/gdelt-source";

const MAX_SOURCE_PAGES = 16;
const MAX_HTML_BYTES = 320_000;
const REQUEST_TIMEOUT_MS = 5_000;

export async function loadSourcePreviewImageUrls(sourceUrls: Array<string | null>) {
  const uniqueUrls = [...new Set(sourceUrls.filter((value): value is string => Boolean(value)))].slice(0, MAX_SOURCE_PAGES);
  const entries = await Promise.all(
    uniqueUrls.map(async (sourceUrl) => [sourceUrl, await loadSourcePreviewImageUrl(sourceUrl)] as const)
  );

  return new Map(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}

async function loadSourcePreviewImageUrl(sourceUrl: string) {
  const pageUrl = getTrustedPublisherUrl(sourceUrl);

  if (!pageUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "RMI-NewsPreview/1.0 (+https://rap-market-index.vercel.app/about)"
      },
      next: { revalidate: 86_400 }
    });

    if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/html")) {
      return null;
    }

    const html = await readLimitedText(response.body, MAX_HTML_BYTES);
    const imageValue = getMetaContent(html, "property", "og:image") ?? getMetaContent(html, "name", "twitter:image");

    if (!imageValue) {
      return null;
    }

    const imageUrl = new URL(decodeHtmlAttribute(imageValue), pageUrl);
    return isPublicHttpUrl(imageUrl) ? imageUrl.toString() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

function getMetaContent(html: string, key: "property" | "name", expectedValue: string) {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const attributes = getHtmlAttributes(tag);

    if (attributes[key]?.toLowerCase() === expectedValue && attributes.content) {
      return attributes.content;
    }
  }

  return null;
}

function getHtmlAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
