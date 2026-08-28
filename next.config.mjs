/** @type {import('next').NextConfig} */

// Production-only security headers (dev stays permissive so HMR/next dev work).
// The Content-Security-Policy header is NOT here — it's set in middleware.js
// with a per-request nonce so Next's inline RSC scripts can hydrate.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// Dynamic pages are force-dynamic (CSP nonce + "today"-dependent statuses),
// so every visit re-renders on the Worker. Edge-cache the HTML instead:
// repeat visitors (crawlers, re-shares, back-navigations) get a 60s-fresh,
// 5-min stale-while-revalidate copy from the CDN, which keeps the free
// Workers plan under its 100k requests/day cap during viral traffic days.
// The CSP nonce stays consistent inside the cached response, and these pages
// have no POST forms, so caching is safe.
const htmlCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, s-maxage=60, stale-while-revalidate=300",
  },
];

// `images: { unoptimized: true }` is applied in BOTH dev and production so
// the dev server matches the live site: Cloudflare Pages has no built-in
// /_next/image optimizer (Cloudflare Images is paid), so we serve the small
// event assets raw. Without this, dev runs the optimizer and re-encodes
// assets through /_next/image — which makes card art look blurry in dev
// while it's sharp on the deployed site.
const nextConfig = {
  images: { unoptimized: true },
  ...(process.env.NODE_ENV === "production" && {
    async headers() {
      return [
        { source: "/(.*)", headers: securityHeaders },
        { source: "/", headers: htmlCacheHeaders },
        { source: "/help", headers: htmlCacheHeaders },
        { source: "/plan/:path*", headers: htmlCacheHeaders },
      ];
    },
  }),
};

export default nextConfig;
