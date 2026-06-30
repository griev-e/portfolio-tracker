import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { PortfolioProvider } from "@/lib/store";
import { AssumptionsProvider } from "@/lib/assumptions/store";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "alpha",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        {/* Unlock entrance. Runs before first paint so the black overlay covers
            the very first frame after the lock screen's full reload — no flash
            of the app, and the fade-out is a GPU-composited opacity transition
            (see #alpha-entrance in globals.css). The lock page sets the one-shot
            flag right before navigating. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(sessionStorage.getItem('alpha.entrance')==='1'){sessionStorage.removeItem('alpha.entrance');var r=document.documentElement;r.classList.add('alpha-entering');requestAnimationFrame(function(){requestAnimationFrame(function(){r.classList.add('alpha-revealing');});});}}catch(e){}})();`,
          }}
        />
        <div id="alpha-entrance" aria-hidden="true" />
        <MotionProvider>
          <AuthProvider
            authEnabled={!!process.env.AUTH_SECRET && !!process.env.DATABASE_URL}
          >
            <PortfolioProvider>
              <AssumptionsProvider>
                <AppShell>{children}</AppShell>
              </AssumptionsProvider>
            </PortfolioProvider>
          </AuthProvider>
        </MotionProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
