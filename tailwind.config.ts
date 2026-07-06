import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#f5f7f9",
        panel: "#ffffff",
        panelSoft: "#eef2f5",
        line: "#d9e0e7",
        paper: "#1f2933",
        brass: "#6fa131",
        mint: "#00856f",
        ember: "#d93025",
        cyan: "#2364c8"
      },
      boxShadow: {
        market: "0 10px 28px rgba(31, 41, 51, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
