import type { NextConfig } from "next";

/**
 * Defense-in-depth response headers applied to every route.
 *
 * The Content-Security-Policy here is the *framework-safe subset*: `base-uri`,
 * `object-src`, `frame-ancestors` and `form-action` don't touch `script-src` /
 * `style-src`, so they can't break the App Router's inline hydration scripts,
 * the inline entrance animation in app/layout.tsx, or framer-motion's inline
 * styles — yet they still close real holes (base-tag injection, plugin embeds,
 * clickjacking, cross-origin form posts). A full `script-src`/`style-src` CSP
 * needs a per-request nonce via middleware and browser verification; that stays
 * a deliberate follow-up.
 */
const CSP = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: CSP },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Tree-shake barrel imports from these large UI packages so only the
    // components actually used ship to the browser. framer-motion in
    // particular is pulled in across nearly every page.
    optimizePackageImports: ["framer-motion", "geist"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
