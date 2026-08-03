# Global regions plan — multi-currency pack pricing + Step 0 region picker

**Status: planned — NOT implemented.** Code changes are on hold; real per-region price data will be provided by the site owner (do not invent prices). This doc records the agreed design so implementation can proceed once data lands.

## Goal

Make SkinRoute usable by players outside Bangladesh. The planning engine is already server-neutral — only **pack prices** (`data/packs.json`, all BDT) and **currency labels** ("Total BDT", ৳) are Bangladesh-only. The day-reset logic (`eventHelpers.js`, 08:00 UTC) is shared by every MLBB server and needs **no functional change** — only cosmetic comment cleanup ("2PM BDT" → "08:00 UTC").

### Key finding

Regions differ not just in price but in **pack ladder** (PH: 10+1, 20+2, 51+5… tiers vs BD: 5, 11, 22, 55…). So each region needs its own full pack list, not converted prices. `optimizeRecharge` already accepts any pack list — no algorithm change.

## Design

### Step 0: region picker (new wizard step)

- New `components/wizard/StepZero.jsx` — card grid of regions from `data/packs.json` `meta` (region name + currency code + symbol, e.g. "Bangladesh — BDT ৳"). Tap a card → saves region to wizard context + localStorage → advances to Step 1. Pre-selects last-used region (guarded `localStorage` read, SSR-safe).
- Shows for **all** event types (prices matter for bingo too).
- StepFour shows a read-only region badge (e.g. "Region: PHP ₱") instead of a dropdown; changing region = back to step 0 (wizard inputs live in context, nothing is lost).

### Wizard plumbing

| File | Change |
|---|---|
| `lib/wizardContext.js` | `currentStep` starts at **0**; `goNext`: 0→1, bingo 2→4, else +1; `goBack` floor 0. Add `region` state (localStorage-init, SSR guard) + `setRegion` |
| `components/wizard/WizardShell.jsx` | `STEP_COMPONENTS` adds `0: StepZero`. Replace `displayStep` formula: `displayStep = currentStep + 1` (bingo `currentStep > 3` → 4); `totalSteps = bingo ? 4 : 5` ("Step 1 of 5" / "Step 1 of 4") |
| `components/layout/ProgressBar.jsx` | `STEPS` gets `{ n: 0, label: "Region" }` at front; both branches use index-based `displayN = i + 1` (non-bingo currently uses `s.n` and would render "0") |
| `components/wizard/StepFour.jsx` | Region badge in header; planCache key + effect deps gain `region` (cross-region refetch); labels "Total BDT" → dynamic |

### Data: `data/packs.json` restructure

- Per-region blocks, each keeping the **exact shape the engine already consumes** (`weekly_pass` / `first_purchase` / `regular`):

```json
{
  "meta": { "regions": ["bdt", "usd", "php", "idr", "myr", "inr"], "collected_on": "YYYY-MM-DD", "note": "..." },
  "bdt": { "weekly_pass": { ... }, "first_purchase": [...], "regular": [...] },
  "usd": { ... }, "php": { ... }, ...
}
```

- Rename pack field `bdt` → `price`, plan fields `totalBdt` → `totalCost` (touches optimizer, planOrchestrator ×4 note strings, StepFour, PackRecommendation, exporter, reportBug — all grep-able).
- **Price data**: owner provides official in-game ladders per region (cross-check ≥2 sources each, stamp `collected_on`). FP tiers are identical across regions (50/150/250/500 base) so `fpClaimed` resources UI is unaffected.
- Reference points found during research (June–July 2026, verify before use): weekly pass US $1.99 / PH ₱95 / IDN ~Rp 27.550; PH 500D ≈ ₱950; PH in-game ladder: 10+1 ₱9.50, 20+2 ₱19, 51+5 ₱47.50, 102+10 ₱95, 203+20 ₱190, 303+33 ₱285, 504+66 ₱475, 1007+156 ₱950, 2015+383 ₱1,900, 5035+1007 ₱4,750.

### Engine: region plumbing

- `lib/planOrchestrator.js:33` — import becomes region-keyed map; `buildPlan(event, resources, target, ownedItems, confidence, overrideStartDay, region = "bdt")` selects `packsData[region]`; simulators already thread `packsData` as a param — no simulator changes.
- `app/api/plan/route.js` — accept `region` in body, whitelist against `meta.regions` (400 otherwise), pass to `buildPlan`.
- `lib/reportBug.js` — accept region (from wizard context, default `bdt` outside wizard), include in technical block.
- `planOrchestrator.js` pack notes ("Buy … (210 BDT)") → dynamic currency.

### UI: dynamic labels

- `StepFour.jsx` — "Total BDT" → "Total {region label}" with region symbol.
- `PackRecommendation.jsx` — BDT column header + ৳ symbol → dynamic.
- `lib/exporter.js` — PDF "Total BDT"/"BDT" column → PDF-safe text codes (BDT/USD/PHP/IDR/MYR/INR); ₱ and ₹ likely need the same mangling workaround ৳ already gets (`exporter.js:37`).
- `ReportModal.jsx` placeholder + `app/help/page.js` copy → neutral wording.

### Docs & comments

- AGENTS.md, README, `docs/features.md`/`architecture.md`/`events.md`/`development.md` — currency/region mentions; sweep "2PM BDT" comments in `eventHelpers.js`/`ScheduleTable.jsx` → "08:00 UTC" (cosmetic).
- `docs/events.md` — note: monthly pack-price maintenance per region.

## QA / regression gate

- **BDT regression**: plan output must be byte-identical pre/post refactor (same knapsack, same prices).
- Sanity-check USD/PHP/IDR plans against known references (PH 500D ≈ ₱950, pass $1.99/₱95/Rp27.550).
- Step 0 flow for both bingo and normal events ("Step 1 of 4" / "Step 1 of 5", progress bar 5/4 segments), back-nav, region persist on reload, `/api/plan` 400 on bad region, PDF + bug report in USD/PHP.

## Out of scope (future)

- Per-region event date overrides in `events.json` (regional schedules) — most events are global-simultaneous; can be added later as optional data.
- SupportButton stays bKash/Nagad (owner decision).
- Currency set is trivially extensible (one JSON block per region, no code).

## Blocked on

- Real per-region pack price data from the site owner (USD, PHP, IDR, MYR, INR; TRY/VND/SGD if wanted).
