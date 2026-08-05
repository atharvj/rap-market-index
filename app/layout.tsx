import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { GameProvider } from "@/components/GameProvider";
import { Shell } from "@/components/Shell";
import {
  getSiteUrl,
  isPublicIndexingEnabled,
  SITE_DESCRIPTION,
  SITE_NAME
} from "@/lib/site-metadata";

const siteUrl = getSiteUrl();
const publicIndexingEnabled = isPublicIndexingEnabled();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  category: "entertainment",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  authors: [{ name: SITE_NAME, url: siteUrl }],
  title: {
    default: SITE_NAME,
    template: "%s | Rap Market Index"
  },
  alternates: {
    canonical: "/"
  },
  formatDetection: {
    address: false,
    email: false,
    telephone: false
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: "/logo.svg",
    apple: "/logo.svg"
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl,
    siteName: SITE_NAME,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Rap Market Index market dashboard"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"]
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

const websiteStructuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: "RMI",
  url: siteUrl,
  description: SITE_DESCRIPTION,
  inLanguage: "en-US"
}).replace(/</g, "\\u003c");

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: websiteStructuredData }}
        />
        <AuthProvider>
          <GameProvider>
            <Shell>{children}</Shell>
          </GameProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
