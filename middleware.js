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

export function middleware(request) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
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
