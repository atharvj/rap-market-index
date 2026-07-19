import { ImageResponse } from "next/og";

export const alt = "Rap Market Index market dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070b12",
          color: "#edf4ff",
          padding: "72px 80px",
          fontFamily: "Arial, Helvetica, sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #27d7ff",
              borderRadius: 8,
              color: "#27d7ff",
              fontSize: 23,
              fontWeight: 700
            }}
          >
            RMI
          </div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>Rap Market Index</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ maxWidth: 920, fontSize: 68, lineHeight: 1.05, fontWeight: 700 }}>
            Follow artist momentum as a market.
          </div>
          <div style={{ maxWidth: 820, color: "#9ba9bb", fontSize: 27, lineHeight: 1.4 }}>
            Artist quotes, verified catalysts, portfolios, and fantasy trading in one live exchange.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, color: "#27d7ff", fontSize: 18, fontWeight: 600 }}>
          <span>MARKETS</span>
          <span style={{ color: "#36465d" }}>/</span>
          <span>NEWS</span>
          <span style={{ color: "#36465d" }}>/</span>
          <span>PORTFOLIOS</span>
          <span style={{ color: "#36465d" }}>/</span>
          <span>RANKINGS</span>
        </div>
      </div>
    ),
    size
  );
}
