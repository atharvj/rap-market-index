import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { GameProvider } from "@/components/GameProvider";
import { Shell } from "@/components/Shell";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rap-market-index.vercel.app";
const publicIndexingEnabled = process.env.NEXT_PUBLIC_RMI_PUBLIC_INDEXING === "true";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Rap Market Index",
  title: {
    default: "Rap Market Index",
    template: "%s | Rap Market Index"
  },
  description: "Virtual rap exchange with artist prices, market news, portfolios, and fantasy cash.",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: "/logo.svg",
    apple: "/logo.svg"
  },
  openGraph: {
    title: "Rap Market Index",
    description: "Virtual rap exchange with artist prices, market news, portfolios, and fantasy cash.",
    url: siteUrl,
    siteName: "Rap Market Index",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Rap Market Index",
    description: "Virtual rap exchange with artist prices, market news, portfolios, and fantasy cash."
  },
  robots: {
    index: publicIndexingEnabled,
    follow: publicIndexingEnabled
  }
};

const themeScript = `
(() => {
  try {
    const storedPreference = window.localStorage.getItem("rmi-theme");
    const preference =
      storedPreference === "light" || storedPreference === "dark" || storedPreference === "system"
        ? storedPreference
        : "system";
    const resolved =
      preference === "dark" ||
      (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";

    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.themePreference = "system";
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>
          <GameProvider>
            <Shell>{children}</Shell>
          </GameProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
