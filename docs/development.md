# Development

Setup, scripts, testing, deployment, and security for the SkinRoute repo.

## Stack

- **Next.js 15** (App Router, `"use client"` where needed), **React 18**, **Tailwind CSS 3.4**
- `jspdf` + `jspdf-autotable` (PDF export), `lucide-react` (icons), `framer-motion` (motion)
- Node 18+ (tested on Node 24)

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on `0.0.0.0:3000` (LAN-visible by design) |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint (`next lint`) |

## Project structure

```
app/                    routes: / (home), /plan/[eventId], /help; API: api/plan (POST); layout + globals.css
components/
  wizard/               StepOne..StepFour, WizardShell, ProgressBar
  ui/                   EventCard, EventCarousel, SummaryCard, ScheduleTable,
                        PackRecommendation, ReportModal, SupportButton
  layout/               Navbar
lib/                    planning engine + helpers (see docs/architecture.md)
data/                   events.json, packs.json (see docs/events.md)
public/assets/          banners, skin art, background images
docs/                   this documentation
.opencode/plans/        planning docs (working notes)
```

## Environment variables

- **`NEXT_PUBLIC_WEB3FORMS_KEY`** — Web3Forms access key for the bug-report modal. Public-safe by design (it's an alias to your inbox, not a secret). Without it the Report Bug button still opens, but submit is disabled and a warning is shown.
- Local: put it in `.env.local` (git-ignored via `.env*.local`). **Never commit `.env*` files.**
- Deployed: add it in the hosting provider's env settings (Vercel: Project → Settings → Environment Variables).

### Web3Forms dashboard

- Sign in at `app.web3forms.com` → your form → Submissions.
- Each report arrives as a row with the 6 summary fields (Event, Plan Start Day, Target, Draws Needed, Recharge BDT, Plan Error) + the full message with the technical block.
- Submissions can be deleted per-row in the dashboard; free plan auto-deletes after 30 days.

## Testing without a browser — the node harness

The planning engine is plain Node-compatible (except two CommonJS simulators, which Next interop handles). To run `lib/` code directly:

1. Create a loader that resolves the `@/` alias and JSON imports (Node ≥ 18.19/20.6 `--experimental-loader`):

```js
// register.mjs
import { pathToFileURL } from "url";
import { readFile } from "fs/promises";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const url = pathToFileURL("D:/path/to/SkinRoute/" + specifier.slice(2));
    if (specifier.endsWith(".json")) return { shortCircuit: true, url: url.href, format: "json" };
    return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const source = await readFile(new URL(url));
    return { format: "json", source, shortCircuit: true };
  }
  return next(url, context);
}
```

2. A wrapper that imports via absolute `pathToFileURL` (relative imports between lib files work fine):

```js
import { pathToFileURL } from "url";
const base = "D:/path/to/SkinRoute/";
const { buildPlan } = await import(pathToFileURL(base + "lib/planOrchestrator.js").href);
// ... assert on results
```

3. Run: `node --experimental-loader ./register.mjs ./wrapper.mjs`

**Gotchas**: relative imports between lib files must include the `.js` extension (ESM rule — extensionless imports fail); `data/*.json` imports need the JSON loader above; the two CommonJS simulators import fine through this loader.

## Lint / build status

- `npm run lint` — clean except pre-existing `@next/next/no-img-element` warnings (3 `<img>` usages that could become `next/image`).
- `npm run build` — **fails in network-restricted environments** because `next/font` fetches Rajdhani/Inter from Google Fonts at build time (ETIMEDOUT). This is environment-only; it succeeds where the font host is reachable (e.g. Vercel). No code workaround without vendoring fonts.

## Deployment (Vercel)

1. Push to GitHub (`origin` = `github.com/aa-jim/SkinRoute`).
2. Vercel → Import Project → select the repo. Next.js is auto-detected; no build config needed.
3. Project Settings → Environment Variables → add `NEXT_PUBLIC_WEB3FORMS_KEY` (the local `.env.local` is not committed).
4. Deploy. HTTPS is automatic; HSTS is applied by Vercel.
5. Before public launch: confirm the SupportButton donation numbers are correct in `components/ui/SupportButton.js`.

## Security posture

- **No secrets in the repo**: `.env.local` is git-ignored and has never been committed; the Web3Forms key is intentionally public-safe.
- **Planning engine runs server-side** (`app/api/plan/route.js`): Step 4 POSTs the wizard inputs and `buildPlan` executes in the route handler, so the algorithm (simulators, EV math, optimizer) is no longer shipped to the browser — *except* via `lib/reportBug.js`, which still calls `buildPlan` client-side for the report's technical block.
- **Public API surface**: `POST /api/plan` is unauthenticated with no rate limit (serverless invocations are a mild abuse/cost vector on Vercel; accepted for now). The route validates input — `confidence` must be one of `optimistic | realistic | worst` and `overrideStartDay` must be a number (both `400` otherwise); buildPlan runtime errors return `200 {data: null, error}` so the UI can render the error state. `events.json`/`packs.json` stay client-side since the UI needs them.
- **Security headers** (`next.config.mjs`, production builds only): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS.
- **Content-Security-Policy is set in `middleware.js`, not next.config** — Next.js renders its RSC bootstrap as inline `<script>` tags, which a plain `script-src 'self'` would block (the app would render then blank out). The middleware generates a per-request nonce (`crypto.randomUUID()`, edge-safe) and sets the CSP on **both the request headers and the response** — Next extracts the nonce from the request's CSP header at render time (`getScriptNonceFromHeader`) and applies it to its inline scripts. Directives: `script-src 'self' 'nonce-…'`, `style-src 'self' 'unsafe-inline'` (next/font), `connect-src 'self' https://api.web3forms.com https://fonts.googleapis.com`, `font-src 'self' fonts.gstatic.com`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self' https://api.web3forms.com`. Production-only (dev passes through); matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `assets/`.
- **Pages must be server-rendered per request**: a static prerender (baked at build time) has no request, hence no nonce, so its inline scripts would still be blocked. `/` and `/help` carry `export const dynamic = "force-dynamic"` (also keeps `deriveStatus`-based event statuses fresh between deploys). `/plan/[eventId]` and `/api/plan` are already dynamic. `/_not-found` stays static — acceptable, it's a non-interactive error page.
- **Spam protection**: the bug-report POST includes the Web3Forms `botcheck` honeypot field; Web3Forms rejects bot submissions server-side.
- **Dependency hygiene**: `xlsx` was removed (unused, known critical CVE). `package.json` `overrides` pin patched `sharp` (≥0.35, libvips CVEs) and `postcss` (≥8.5.18) for Next's nested copies; eslint was upgraded to 9. `npm audit` status: the 10 remaining advisories are all **dev-only lint tooling** (eslint 8/9 chain — fixed only in eslint 10, which `eslint-config-next` 15.5.21 doesn't peer-support yet) plus one low-severity `dompurify` via `jspdf` (no fix published). Nothing runtime-related remains. Run `npm audit` before release and on a schedule.
- No user data is stored by this app itself; bug reports go to Web3Forms (30-day retention on free plan).

## Support

- Bug reports: use the Report Bug button in the app (requires `NEXT_PUBLIC_WEB3FORMS_KEY`).
- Questions/feedback: via the repo.
