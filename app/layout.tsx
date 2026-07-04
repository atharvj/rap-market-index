import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { GameProvider } from "@/components/GameProvider";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Rap Market Index",
  description: "A simulated artist-share market for rap and hip-hop."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
