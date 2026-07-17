import "server-only";

import * as Sentry from "@sentry/nextjs";

export function reportServerError(error: unknown, operation: string) {
  Sentry.withScope((scope) => {
    scope.setTag("operation", operation);
    Sentry.captureException(error);
  });

  if (process.env.NODE_ENV !== "production") {
    console.error(`[${operation}] request failed`, error);
  }
}
