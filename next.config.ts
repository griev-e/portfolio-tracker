import type { NextConfig } from "next";

/**
 * Defense-in-depth response headers applied to every route. These are the
 * framework-safe set — a strict Content-Security-Policy is intentionally left
 * out here because the App Router injects inline hydration scripts (and the
 * entrance animation in app/layout.tsx is inline too), so a correct CSP needs a
 * per-request nonce via middleware rather than a static header. Add that as a
 * follow-up; these headers carry no such risk.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
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
