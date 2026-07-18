import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontWeight: {
        bold: "500",
        black: "700"
      },
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        panelSoft: "rgb(var(--color-panel-soft) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        brass: "rgb(var(--color-brass) / <alpha-value>)",
        mint: "rgb(var(--color-mint) / <alpha-value>)",
        ember: "rgb(var(--color-ember) / <alpha-value>)",
        cyan: "rgb(var(--color-cyan) / <alpha-value>)",
        violet: "rgb(var(--color-violet) / <alpha-value>)"
      },
      boxShadow: {
        market: "0 18px 50px rgba(0, 0, 0, 0.24), 0 0 0 1px rgb(var(--color-cyan) / 0.025)"
      }
    }
  },
  plugins: []
};

export default config;
