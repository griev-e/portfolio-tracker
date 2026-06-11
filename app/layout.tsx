import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { PortfolioProvider } from "@/lib/store";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Sanctum — Private Portfolio Intelligence",
  description:
    "Institutional-grade personal portfolio analytics: risk, quality, factors, scenarios, and Monte Carlo simulation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${grotesk.variable} ${inter.variable} ${jetbrains.variable}`}
      >
        <div className="backdrop" />
        <PortfolioProvider>
          <AppShell>{children}</AppShell>
        </PortfolioProvider>
      </body>
    </html>
  );
}
