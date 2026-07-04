import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101316",
        panel: "#171b1e",
        panelSoft: "#20262a",
        line: "#2d3438",
        paper: "#f3efe6",
        brass: "#c99a45",
        mint: "#4ccf94",
        ember: "#ed6a4a",
        cyan: "#51b8d9"
      },
      boxShadow: {
        market: "0 14px 34px rgba(0, 0, 0, 0.22)"
      }
    }
  },
  plugins: []
};

export default config;
