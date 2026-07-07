"use client";

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
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#f5f7f9",
            color: "#1f2933",
            fontFamily: "Arial, Helvetica, sans-serif",
            padding: 24
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: 680,
              border: "1px solid #d9e0e7",
              background: "#fff",
              padding: 24,
              boxShadow: "0 10px 28px rgba(31, 41, 51, 0.08)"
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  display: "grid",
                  placeItems: "center",
                  background: "#fdeceb",
                  color: "#d93025"
                }}
              >
                <AlertTriangle size={20} aria-hidden="true" />
              </div>
              <div>
                <p style={{ margin: 0, color: "#6fa131", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
                  Rap Market Index
                </p>
                <h1 style={{ margin: "8px 0 0", fontSize: 28, lineHeight: 1.1 }}>The app hit a system error.</h1>
                <p style={{ margin: "12px 0 0", color: "#5f6b76", fontSize: 14, lineHeight: 1.6, fontWeight: 700 }}>
                  Reload the app. If this keeps happening, check the deployment logs before opening the site to users.
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
                background: "#1f2933",
                color: "#fff",
                padding: "0 16px",
                fontWeight: 800,
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
