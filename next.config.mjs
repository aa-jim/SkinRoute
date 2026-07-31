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

const nextConfig =
  process.env.NODE_ENV === "production"
    ? {
        async headers() {
          return [{ source: "/(.*)", headers: securityHeaders }];
        },
      }
    : {};

export default nextConfig;
