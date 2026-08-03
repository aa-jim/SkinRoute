# SkinRoute — Session Context

## Git identity (Vercel deploy gate)
- Commit author email **must** be a valid GitHub account email (`aa-jim <abdullahaljim2@gmail.com>`). Vercel blocks deployments whose commit author email doesn't match a GitHub account — history was rewritten (filter-branch) on 2026-07-31 to fix commits authored by `builder@skinroute.local`, which silently blocked all deploys.

## Documentation
- All docs live in `docs/` (`README.md` index, `features.md`, `architecture.md`, `events.md` — adding a new event baseline, `development.md`)
- When making user-facing or planner changes, update the relevant docs + this file

## Recent Changes

### Site-down message: branded error pages (`error.js` + `global-error.js`)
- `app/error.js` — client error boundary for `/`, `/help`, `/plan/*`: page render/SSR failures now show a branded "flood of players" message with a **Try again** button (`reset()`) and a link to the Vercel mirror (`skin-route.vercel.app`) instead of Next's default error page. Dev-only echo of `error.message`.
- `app/global-error.js` — root-layout boundary for the blank-screen worst case; supplies its own `<html>/<body>` (layout font CSS vars not guaranteed, so no `font-heading`/`font-body` there), same copy/actions.
- **Scope limit**: on `*.workers.dev` free, a *fully* over-quota Worker (edge 429/1027/1102 before any code runs) still shows Cloudflare's default error page — not custom in the app; full-down custom pages need a custom domain later. `/api/plan` keeps its own client-side error states (unchanged).
- Docs: `docs/features.md` (error page), updated deployment docs reference this too.

### Viral-day hardening: bots + capacity (free Workers plan)
- **Symptom**: FB group post (71k members, 130+ shares) → 138k requests/24h vs ~385 the prior day; brief outages + 664 worker errors during peaks. Diagnosis: mostly **legit viral traffic**, not an attack — free Workers caps at 100k requests/day, so the day blew the budget (throttle/error windows). Old `skinroute.abdullahaljim2.workers.dev` URL in docs was WRONG (NXDOMAIN, caused a false "site down" scare) — real hostname is `skinroute.events-mlbb.workers.dev` (account subdomain `events-mlbb`)
- `next.config.mjs` — HTML CDN cache on `/`, `/help`, `/plan/*`: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (repeat visitors get an edge copy; cached response carries its own baked CSP nonce — safe, no POST forms on those pages)
- `app/api/plan/route.js` — in-worker per-IP rate limit (sliding window 30 req/60s, keyed by `cf-connecting-ip` → 429 + Retry-After; size-capped Map). Edge rate limiting isn't viable on free (10k req/month budget); buildPlan is the only compute-heavy unauthenticated route
- `public/robots.txt` — disallow AI crawlers (GPTBot, ClaudeBot, CCBot, Amazonbot, Bytespider, PerplexityBot, meta-externalagent, Google-Extended, SEO bots, …); search engines + FB preview crawler allowed
- `middleware.js` — `BLOCKED_BOT_UA` list returns 403 before render (same UA families as robots.txt; cheap substring scan, short list)
- `public/_headers` — `/assets/*` now `Cache-Control: public,max-age=604800` (non-hashed assets; 7 days so banner swaps propagate) alongside the immutable `/_next/static` rule
- Dashboard to-do (free): Bot Fight Mode + Browser Integrity Check ON, usage alert before the 100k/day cap
- Docs updated: `docs/development.md` (correct URL, free-plan 100k/day cap note, new "Traffic management" section, API rate limit)


### JJK Step 4 "reading 'notes'" fix: empty-window crash + sticky error cache
- **Symptom**: planning a skin showed "Can't calculate a plan yet — Cannot read properties of undefined (reading 'notes')" with **no `/api/plan` network request** (Network tab empty)
- **Root cause 1 (crash)**: all three simulators did unguarded `finalRow.notes.push(...)` where `finalRow = sim.rows[sim.rows.length - 1]`; when `startDay > duration_days` (event window already over — stale/broken `start_date` in a long-running dev server's compiled JSON) the day loop never runs → empty rows → `finalRow` undefined → the exact error above
- **Root cause 2 (sticky)**: `StepFour.jsx` module-level `planCache` cached **error responses** too (`planCache.set(cacheKey, result)` unconditionally), so a transient server error re-rendered forever with no refetch — looked target-specific (Gojo) purely because that cache key was poisoned first
- **Fix**:
  - `lib/idealSchedule.themedCrest.js` / `lib/idealSchedule.collector.js` / `lib/idealSchedule.aspirants.js` — every `finalRow.notes/draws/diaSpent` mutation block now guarded with `finalRow &&` (empty rows → empty schedule + zero shortfall, no crash; all math identical when rows exist)
  - `lib/planOrchestrator.js` — `buildPlan` throws a clear error (`Event window has already ended — no planable days left`) when `startDay > duration_days`; note-injection spots (`day1Row`, `lastRow`, themed-crest `row`) guarded (`if (row)`) — bingo branch already had `if (!row) continue`
  - `components/wizard/StepFour.jsx` — `planCache.set` only when `result.data` exists, so failed responses never stick across visits
- **User-side remedy**: restart the dev server (it predates the `events.json` edit — stale compiled JSON) + hard-refresh the browser to clear the in-memory cached error
- Verified: all 4 JJK skins → identical plans (121 draws, 30/29 rows) to pre-fix; 300-iteration fuzz 0 fails; edge case returns the clear error; `next lint` clean

### Event card progress bar: linear time progress (all events)
- `lib/eventHelpers.js` — `urgencyStyle(days)` (stepped 20/40/70/92% fills keyed to days-left buckets, so any event ≤14 days from ending looked ~halfway full and identical to a just-started one) replaced by:
  - `eventProgress(event)` — true linear fill: elapsed / total window (08:00 UTC anchors, closes 2PM BDT day after `end_date`), clamped 0–100, `null` when dates missing (coming-soon cards keep the gray 100% look)
  - `progressColor(pct)` — smooth green→red `hsl` sweep keyed to elapsed time (inline style, no Tailwind dynamic classes)
  - `urgencyLabel(days)` — countdown text only ("N days left" / "Coming soon")
- `components/ui/EventCard.jsx` — bar width = `progress ?? 100`, `backgroundColor = progressColor(progress)`, label from `urgencyLabel`
- Docs updated: `docs/features.md` (card status strip), `docs/architecture.md` (module map row)

### Collector event: recurring monthly dates (auto-rollover)
- `data/events.json` — collector (`exquisite_collection`) now `"recurring": { "pattern": "monthly" }`, no static dates; `lib/eventHelpers.js` `resolveEventDates()` computes the window from the current in-game month at the 2PM BDT (08:00 UTC) boundary; `lib/eventRepo.js` (`getEvents`/`getEvent`) re-resolves **per call** so long-lived Workers isolates never serve a stale month; 3 import sites swapped (`app/page.js`, `app/api/plan/route.js`, `app/plan/[eventId]/page.js`)
- Explicit `start_date`/`end_date` in JSON always override the pattern (escape hatch for deviant months); StepFour planCache key now includes the resolved `start_date` (no cross-month cached plans)
- Monthly manual work is now **content only**: `shop_items` targets + `prize_pool` (quantities/rules constant) — see `docs/events.md` §1b

### Cloudflare deployment (primary host, free plan)
- `@opennextjs/cloudflare` adapter + `wrangler.jsonc` + `open-next.config.ts` + `build:cf` script — site live at `https://skinroute.events-mlbb.workers.dev/`; Vercel (`skin-route.vercel.app`) kept as parallel fallback (both auto-deploy on push)
- `next.config.mjs` — `images: { unoptimized: true }` (Cloudflare's optimizer is paid; assets served raw)
- `public/_headers` — immutable caching for `/_next/static/*` (ignored by Vercel)
- **Traps hit during setup** (see `docs/development.md` → Cloudflare section): wrangler needs Workers-style `main` + `assets` (Pages-style `pages_build_output_dir` alone fails with "Missing entry-point"); the `WORKER_SELF_REFERENCE` service binding must reference the exact project name `skinroute` (CI overrides config `name` but not the binding → `[10143]`)
- Verified on Workers runtime: CSP nonce middleware works unmodified (edge-only APIs), all routes/banners/API parity with Vercel; worker ~1.3 MiB gzip (3 MiB free limit)

### Street Fighter banner case fix (`public/assets/events/street_fighter_2026/`)
- `banner.JPEG` → `banner.jpeg` (via two-step `git mv` — Windows FS is case-insensitive so direct rename failed) — `events.json` referenced lowercase, Vercel/Linux is case-sensitive → `/_next/image` 400, banner hidden on every deployed profile
- `docs/events.md` — asset section now warns: filenames must match `events.json` byte-for-byte (case-sensitive on Vercel); use `git mv` for case-only renames

### CSP nonce middleware (`middleware.js`) — production black screen fix
- **Symptom**: deployed site (Vercel) showed black screen; landing page flashed for a split second on refresh. Console: `Executing inline script violates ... script-src 'self'` + `Uncaught Error: Connection closed`
- **Cause**: `next.config.mjs` production CSP had `script-src 'self'` with no nonce/hash — Next.js renders its RSC bootstrap as inline scripts, so hydration never ran and the client error boundary blanked the page. Dev was unaffected (headers production-gated)
- **Fix**: new `middleware.js` — per-request nonce (`crypto.randomUUID().replaceAll("-", "")`, edge-safe, no Buffer), CSP set on **request + response headers** (Next extracts the nonce from the request CSP header at render time — `getScriptNonceFromHeader`; the `x-nonce` header is NOT read by Next 15.5); production-only (dev passes through); matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `assets/`
- **Static pages can't carry nonces** — prerenders are baked at build time with no request, so `/` and `/help` now have `export const dynamic = "force-dynamic"` (bonus: event statuses no longer go stale between deploys); `/plan/[eventId]` was already dynamic; `/_not-found` stays static (non-interactive error page)
- `next.config.mjs` — CSP removed from `securityHeaders` (two CSP headers = intersection; old one would still block); X-Frame-Options/nosniff/HSTS/Referrer-Policy/Permissions-Policy stay
- Docs updated: `docs/development.md` security section
- **Verify on Vercel after deploy**: home page stays visible, no CSP violations in console, CSP header present with `nonce-…`, rest of headers intact, wizard + PDF + report modal

### Step 4 plan loading: cache + stale-while-revalidate (`StepFour.jsx`)
- Previously every toggle of "Start Today vs Day 1" (and every return to Step 4 after navigating steps — steps unmount) re-ran the effect with `setPlanLoading(true)` → full-screen "Calculating your plan..." flash each time
- Now: module-level `planCache` Map keyed by `JSON.stringify([event.id, resources, target, ownedItems, activeStartDay])`; lazy `useState` initializers read it → already-computed day renders instantly, zero refetch; cache-miss toggles keep the previous plan visible ("Updating…" spinner next to the toggle) while refetching; refresh failure keeps the last plan + inline "Couldn't refresh" note (error screen only when no plan exists yet)
- `hasPlanRef` tracks "a plan has been shown" (set on successful fetch) so full-screen loading only ever shows before the first plan
- `ScheduleTable` now gets `startDay={p.startDay ?? activeStartDay}` so the visible table matches the plan shown during a refresh

### API plan route + async Step Four
- `app/api/plan/route.js` — new server-side `POST /api/plan`: validates body (`confidence` whitelist `optimistic|realistic|worst`, numeric `overrideStartDay` — both 400 otherwise, unknown `eventId` 400), calls `buildPlan`, returns `{data, error}` (buildPlan runtime errors → 200 with error field, matching the client contract)
- `StepFour.jsx` — switched from direct `buildPlan` call to `fetch("/api/plan")` in `useEffect` (with `cancelled` flag, deps `[event.id, resources, target, ownedItems, activeStartDay]`); new `planLoading` state + "Calculating your plan..." loading screen; plan error state unchanged
- **Security effect**: planning engine (simulators/EV/optimizer) no longer ships in the client bundle via StepFour — but `lib/reportBug.js` still calls `buildPlan` client-side for the report technical block, so the engine is only partially hidden. CSP already allowed it (`connect-src 'self'`), no `next.config.mjs` change
- **Stray `+` fix**: `StepFour.jsx:67-68` had pasted diff markers (`+` chars rendering as JSX text) — removed
- `SupportButton.js:101` — mobile offset `bottom-8` → `bottom-12` (cosmetic)
- Docs updated: `docs/architecture.md` (invocation note + module map row), `docs/features.md` (Step 4 loading state), `docs/development.md` (security posture + project structure + stale SupportButton TODO line removed)
- `lib/test_write.txt` deleted (stray "hello" debug artifact; deletion still uncommitted)

### Collector (`planOrchestrator.js`)
- **Starlight for expired window**: `starlightExtra` now triggers when `startDay > windowEnd`, using `Math.max(0, 300 - startingDia)` — no longer gated by `hasPasses`
- **Dump all packs on day 1 when totalSpan ≤ 2**: Sequential two-step injection (Starlight first, then remaining shortfall) both on `startDay`, no final-day split
- `day1PackDia` accumulates correctly across both steps

### Starlight buying timing (`idealSchedule.collector.js`)
- No changes needed — post-phase block already checks Starlight daily when `diamondPhaseActive = false`

### Bingo/StepFour labels
- `StepFour.jsx:128` — header shows "The Aspirants" for aspirants, "Bingo — first line completion" for regular bingo
- `exporter.js:475` — same conditional in PDF header
- `StepTwo.jsx:34` — description: "First completed box wins..." for aspirants, "First completed bingo line wins..." for regular
- `StepTwo.jsx:99` — card label: "Box completion" for aspirants, "Line completion" for regular

### Fake target removed (`planOrchestrator.js:994`)
- `target: null` replaces `{ skin: { name: "Bingo", hero: "" } }` for bingo plans
- `exporter.js:228` — guarded with `hasTarget && !isBingo` to prevent "Target: Bingo ()"

### Step display fix (`WizardShell.jsx`)
- Added `displayStep` and `totalSteps` variables — bingo shows "Step X of 3" (steps 1,2,3), non-bingo shows "Step X of 4"
- `effectiveStep` still maps to correct component index (4 for StepFour)

### Surprise tasks now count as free draws (`idealSchedule.themedCrest.js`)
- Sim claims surprise-window tokens as real draws: cumulative recharge (packs + pass purchase recharge value, `recharge_task_value`) within the first `active_days` days, `claimKeys` adds row.draws/totalDraws — affects milestones + final push cost
- Tiers with 0 tokens (750) are skipped; claims only fire while recharge lands inside the window
- `planOrchestrator.js` — removed the informational-only day-1 surprise note block (previously said "→ X free draw" without drawing)

### Bug report feature — IMPLEMENTED
- `lib/reportBug.js` — `buildReport(context)` returns `{ description, technical }`; technical includes event info, all wizard inputs, plan summary (draws/recharge/packs) + full day schedule; builds the plan itself (bingo works without target, errors captured instead of thrown)
- `components/ui/ReportModal.jsx` — user textarea + auto technical block, POSTs to Web3Forms (`NEXT_PUBLIC_WEB3FORMS_KEY`), idle/sending/success/error states, works without wizard context (home/help pages)
- `components/layout/Navbar.jsx` — now client component: hamburger menu on mobile (Home/Help/Report Bug), Report Bug button on desktop (sm+), modal rendered outside `<header>` to avoid backdrop-filter containing-block issues
- `lib/wizardContext.js` — added `useWizardOptional()` (returns null instead of throwing) so Navbar works on non-wizard pages
- `app/plan/[eventId]/page.js` — `<Navbar />` moved inside `<WizardProvider>` so the report can include plan context
- `.env.local` — created with empty `NEXT_PUBLIC_WEB3FORMS_KEY` placeholder (git-ignored); submit disabled until key added
- `buildReport` also returns `fields` (6 quick-scan summary cells: Event, Plan Start Day, Target, Draws Needed, Recharge BDT, Plan Error) — `ReportModal` spreads them into the Web3Forms POST body; the full readable detail (all inputs, packs, day schedule) stays in the message's technical block
- Report's `Plan Start Day` respects the StepFour "Start Today vs Day 1" toggle: `startFromToday` state lives in the wizard context (lifted from StepFour local state); `buildReport` defaults it to `true` outside the wizard; true current day still recorded as "Event day at report" inside the technical block

### Mobile nav dividers (`Navbar.jsx`)
- Hamburger menu items (Home/Help/Report a Bug) each get a full-width divider: `-mx-4 px-4 border-b border-white/10` (edge-to-edge line under each item, including the last)
- Container padding changed `py-2` → `pt-2 pb-0` so the last divider sits flush with the dropdown bottom

### Release hardening
- `xlsx` removed from dependencies (unused; known critical CVEs)
- `next.config.mjs` — production-gated security headers + CSP (Next 15 / Google Fonts / Web3Forms compatible)
- `ReportModal.jsx` — `botcheck: ""` honeypot field in the Web3Forms POST (bots rejected server-side)
- `test_planner.mjs` removed from repo root
- `docs/` folder created — features/architecture/events/development (see index `docs/README.md`)

### 2PM BDT day-reset alignment (`eventHelpers.js`, `planOrchestrator.js`)
- MLBB resets at 2PM BDT (08:00 UTC). Event cards (`daysLeft`/`deriveStatus`) already used it; `todayEventDay` was midnight-UTC based → schedule ran 1 day ahead between 06:00–14:00 BDT
- `eventHelpers.js` — added `eventDayNow(event)` (canonical current in-game day, 08:00 UTC boundary)
- `planOrchestrator.js` — `todayEventDay` delegates to `eventDayNow` (StepFour, passFirstBuyDay, reportBug all inherit)
- `ScheduleTable.jsx` + `exporter.js` — `dayToDate` now UTC-anchored (Date.UTC + getUTC*) so date labels match in-game days in any timezone

## Next Steps (planned)
- Final QA before launch: one test bug report with the new 6-field format, verify deploy env var on Vercel (`NEXT_PUBLIC_WEB3FORMS_KEY` — the "Import .env" flow), confirm SupportButton donation numbers in production

## Relevant Files
- `lib/planOrchestrator.js` — collector/bingo/themed crest planners
- `lib/idealSchedule.collector.js` — collector simulator
- `lib/exporter.js` — PDF generation
- `components/wizard/StepFour.jsx` — results page
- `components/wizard/StepTwo.jsx` — target selection
- `components/wizard/WizardShell.jsx` — step layout + header
- `components/layout/Navbar.jsx` — hamburger + report bug
- `lib/reportBug.js` — report builder (description/technical/6 summary fields)
- `components/ui/ReportModal.jsx` — report modal (Web3Forms POST, botcheck honeypot)
- `app/api/plan/route.js` — server-side POST /api/plan (buildPlan, confidence whitelist)
- `components/ui/SupportButton.js` — buy-me-a-coffee (donation numbers)
- `data/events.json` — event data (see `docs/events.md` to add a new event)
- `data/packs.json` — pack/pass data
- `next.config.mjs` — security headers (production-gated); CSP now lives in `middleware.js`
- `middleware.js` — per-request CSP nonce (production; fixes inline-script blocking)
- `docs/` — features/architecture/events/development docs
