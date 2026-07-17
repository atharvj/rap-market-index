import type { ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_BREADCRUMB_KEYS = /auth|cookie|email|password|secret|token|user/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const CREDENTIAL_PATTERN = /\b(?:sk-|gsk_|gh[opusr]_)[A-Za-z0-9_-]{16,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~-]+\b/gi;

function redactSensitiveText(value: string) {
  return value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(UUID_PATTERN, "[redacted-id]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, "[redacted-token]")
    .replace(CREDENTIAL_PATTERN, "[redacted-secret]");
}

function scrubBreadcrumbValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(stripQuery(value) ?? value);
  if (Array.isArray(value)) return value.map(scrubBreadcrumbValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      SENSITIVE_BREADCRUMB_KEYS.test(key) ? [] : [[key, scrubBreadcrumbValue(nestedValue)]]
    )
  );
}

function stripQuery(url: string | undefined) {
  if (!url) return url;

  try {
    const parsed = new URL(url, "https://rmi.invalid");
    const path = parsed.origin === "https://rmi.invalid"
      ? parsed.pathname
      : `${parsed.origin}${parsed.pathname}`;
    return redactSensitiveText(path);
  } catch {
    return redactSensitiveText(url.split("?")[0]?.split("#")[0] ?? "");
  }
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.extra;

  if (event.message) event.message = redactSensitiveText(event.message);
  if (event.logentry?.message) event.logentry.message = redactSensitiveText(event.logentry.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redactSensitiveText(value.value);
  }

  if (event.request) {
    event.request.url = stripQuery(event.request.url);
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.env;
    delete event.request.headers;
    delete event.request.query_string;
  }

  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => {
    const data = breadcrumb.data
      ? scrubBreadcrumbValue(breadcrumb.data) as Record<string, unknown>
      : undefined;

    return {
      ...breadcrumb,
      data,
      message: breadcrumb.message
        ? redactSensitiveText(stripQuery(breadcrumb.message) ?? breadcrumb.message)
        : breadcrumb.message
    };
  });

  return event;
}
