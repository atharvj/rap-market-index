import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rap Market Index",
    short_name: "RMI",
    description: "Virtual rap exchange with artist prices, market news, portfolios, and fantasy cash.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b12",
    theme_color: "#070b12",
    icons: [
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
