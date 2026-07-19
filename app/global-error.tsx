"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#070b12",
            color: "#edf4ff",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            padding: 24
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: 680,
              border: "1px solid #223044",
              borderRadius: 8,
              background: "#0b111b",
              padding: 24
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 6,
                  background: "rgba(255, 82, 111, 0.12)",
                  color: "#ff526f"
                }}
              >
                <AlertTriangle size={20} aria-hidden="true" />
              </div>
              <div>
                <p style={{ margin: 0, color: "#27d7ff", fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
                  Rap Market Index
                </p>
                <h1 style={{ margin: "8px 0 0", fontSize: 28, lineHeight: 1.1 }}>The app hit a system error.</h1>
                <p style={{ margin: "12px 0 0", color: "#9ba9bb", fontSize: 14, lineHeight: 1.6 }}>
                  Reload the page. If the problem continues, try again in a few minutes.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24,
                display: "inline-flex",
                minHeight: 40,
                alignItems: "center",
                gap: 8,
                border: 0,
                borderRadius: 6,
                background: "#edf4ff",
                color: "#070b12",
                padding: "0 16px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              <RefreshCcw size={16} aria-hidden="true" />
              Retry
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
