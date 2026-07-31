/** @type {import('next').NextConfig} */

// Production-only security headers (dev stays permissive so HMR/next dev work).
// Tuned for Next 15 + Google Fonts (next/font) + Web3Forms bug reports.
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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.web3forms.com https://fonts.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://api.web3forms.com",
    ].join("; "),
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
