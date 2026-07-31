# SkinRoute — Session Context

## Documentation
- All docs live in `docs/` (`README.md` index, `features.md`, `architecture.md`, `events.md` — adding a new event baseline, `development.md`)
- When making user-facing or planner changes, update the relevant docs + this file

## Recent Changes

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
- Final QA before launch: confirm SupportButton donation numbers (TODO in code), one test bug report with the new 6-field format, verify deploy env var on Vercel

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
- `components/ui/SupportButton.js` — buy-me-a-coffee (donation numbers TODO)
- `data/events.json` — event data (see `docs/events.md` to add a new event)
- `data/packs.json` — pack/pass data
- `next.config.mjs` — security headers (production-gated)
- `docs/` — features/architecture/events/development docs
