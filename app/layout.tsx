import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { GameProvider } from "@/components/GameProvider";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Rap Market Index",
  description: "A simulated artist-share market for rap and hip-hop."
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
