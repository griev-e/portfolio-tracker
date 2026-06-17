import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { PortfolioProvider } from "@/lib/store";
import { AppShell } from "@/components/shell/AppShell";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "grieve",
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
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <PortfolioProvider>
          <AppShell>{children}</AppShell>
        </PortfolioProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
