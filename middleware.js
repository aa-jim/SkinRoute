import { NextResponse } from "next/server";

// Production-only CSP with a per-request nonce.
// Next.js renders its RSC bootstrap payload as inline <script> tags, which a
// strict `script-src 'self'` would block (black screen in production). Next
// extracts the nonce from the CSP in the REQUEST headers (render.js
// getScriptNonceFromHeader) and applies it to its inline scripts, so the CSP
// must be set on the request headers AND the response. Dev stays permissive
// so HMR/next dev work.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'nonce-%NONCE%'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.web3forms.com https://fonts.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://api.web3forms.com",
].join("; ");

// Known AI-training / SEO-scraper crawlers get a 403 BEFORE any render work.
// Matches against the lowercased UA — the list stays short so the substring
// scan costs nothing on normal human traffic. (Googlebot/Bing/Facebook are
// intentionally NOT here — we want indexing and link-preview crawlers.)
const BLOCKED_BOT_UA = [
  "bytespider",
  "claudebot",
  "claude-web",
  "gptbot",
  "chatgpt-user",
  "ccbot",
  "amazonbot",
  "perplexitybot",
  "meta-externalagent",
  "google-extended",
  "petalbot",
  "omgili",
  "cohere-ai",
  "anthropic-ai",
  "dataforseobot",
  "semrushbot",
  "ahrefsbot",
  "diffbot",
  "seekrbot",
  "magpie-crawler",
];

export function middleware(request) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  if (ua && BLOCKED_BOT_UA.some((bot) => ua.includes(bot))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = CSP_DIRECTIVES.replace("%NONCE%", nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
