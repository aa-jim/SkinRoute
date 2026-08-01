# Architecture — how the planning engine works

The whole planner is driven by one entry point: **`buildPlan()`** in `lib/planOrchestrator.js`. Everything in `lib/` feeds it or formats its output.

**Invocation** — `buildPlan` runs **server-side** in the App Router route handler `app/api/plan/route.js` (`POST /api/plan`); the wizard's Step 4 fetches it with `fetch` and renders a loading state while it computes. The bug-report builder (`lib/reportBug.js`) is the exception — it still imports and calls `buildPlan` directly in the browser bundle, so the engine is only *partially* hidden from the client.

## Pipeline overview

```
event, resources, target, ownedItems, confidence, overrideStartDay
        │
        ▼
buildPlan(event, resources, target, ownedItems, "realistic", startDay?)   planOrchestrator.js:38
        │  startDay = overrideStartDay ?? todayEventDay(event)   (2PM BDT boundary)
        │
        ├── event.type === "bingo"      → buildBingoPlan
        ├── event.type === "collector"  → buildCollectorPlan
        └── else (themed_crest/legend/special) → buildThemedCrestPlan
                    │
                    ├── calculator.js      drawsNeeded (EV math, milestones), bingo win condition
                    ├── idealSchedule.*.js day-by-day simulator (free draws, tokens, drip)
                    ├── optimizer.js       3D knapsack: cheapest BDT pack combo
                    └── scheduler.js       4 live helpers (windows, milestones, surprises)
                    │
                    ▼
        normalized plan object (shape below) + startDay
```

### Parameters

- `event` — one entry from `data/events.json` (`events.events[]`)
- `resources` — `{ diamonds, coa, weeklyPasses, passDaysRemaining, fpClaimed: {fp_50, fp_150, fp_250, fp_500} }` (Step 1; `coa` only used by collector)
- `target` — `{ itemId, mode: "specific", outfit1: bool }` (bingo passes `null`/ignored)
- `ownedItems` — `{ skins: [id, ...], groups: {groupId: count} }` (Step 3)
- `confidence` — `"optimistic" | "realistic" | "worst"` (default `"realistic"`)
- `overrideStartDay` — the "Start Today (Day N) vs Day 1" toggle; `startDay` is merged into the returned plan

### Order of operations (per branch)

1. Resolve target crest cost (`resolveTargetCrests`): `shop_items[].crest_cost` (+ `outfit1_variant.crest_cost` when `target.outfit1`).
2. Compute draws: `drawsNeeded(...)` + `drawsNeededAll` (all 3 confidences).
3. Compute `startDay`, `firstPassBuyDay = todayEventDay - (passes×7 - passDaysRemaining)`, `passesInBalance`.
4. Run the plain simulator → find day-1 gap / pre-window balance / final-day shortfall.
5. **Pass search loop**: re-run the simulator with more passes (cap 10) until gaps close (collector) or balance ≥ 0 and no shortfall (themed crest / bingo).
6. Re-run with chosen pass count, then inject pack diamonds via `optimizeRecharge` (per phase + final day; first-purchase packs tracked so each is bought once).
7. Attach `supplyWindows`, `milestones`, totals, warnings, `surpriseLadder`.
8. Return the normalized plan.

## Plan object shape

Fields present on most plans (per-type differences noted):

```js
{
  eventType: "collector" | "themed_crest" | "bingo",
  confidence, startDay,
  target: { skin, targetCrests, outfit1 },   // bingo: null
  drawsNeeded: { draws, gapAfterMilestones, milestonesApplied, effectiveE },
  drawsNeededAll: { optimistic, realistic, worst },
  supplyWindows,                             // from premiumSupplyWindowPlan
  milestones,                                // from milestoneTokenSchedule
  daySchedule: {                             // bingo: absent
    rows: [{ day, draws, diaSpent, coaSpent?, diaAdd, coaAdd?, notes[], diaLeft, coaLeft?, cumDiaSpentOnEvent, cumCoaSpentOnEvent? }],
    totals: { draws, dia, coa? }
  },
  recharge: { totalBdt, totalDia, completionDay, packsUsed: [{id, type, count, bdt, dia}], impossible },
  totalDiamondsForPlan, netDiamondsNeeded?, surpriseLadder?,
  warnings: [{ type: "recharge_needed", message }],
  // bingo extra:
  winCondition: { draws: { lucky: [30,40], realistic: 50, worst: 60 }, pity, diamondCost },
  dailySchedule                                   // informational skeleton
}
```

## Module map

| Module | Role |
|---|---|
| `app/api/plan/route.js` | **Server-side entry point** — `POST /api/plan`: validates body (`eventId`, `confidence` whitelist, numeric `overrideStartDay`), calls `buildPlan`, returns `{data, error}`. Step 4 fetches this |
| `lib/planOrchestrator.js` | Entry point, per-type branches, pass search, pack injection, notes, warnings |
| `lib/calculator.js` | Expected-value math + milestone subtraction; bingo win condition |
| `lib/optimizer.js` | **3D knapsack** (exact port of a verified C++ solution) — min-BDT combo for a diamond container |
| `lib/scheduler.js` | Mostly legacy/superseded. Only 4 functions still called: `premiumSupplyWindowPlan`, `dailyDrawSchedule`, `milestoneTokenSchedule`, `surpriseTaskProgress` |
| `lib/idealSchedule.collector.js` | Collector day-by-day simulator (CommonJS) |
| `lib/idealSchedule.themedCrest.js` | Themed-crest/legend/special simulator (CommonJS) |
| `lib/idealSchedule.aspirants.js` | Aspirants (bingo) simulator (ESM) |
| `lib/coaSufficiency.js` | CoA-only sufficiency check — **NOT called by buildPlan** (dead code; only referenced from superseded scheduler functions) |
| `lib/eventHelpers.js` | `eventDayNow`, `daysLeft`, `deriveStatus`, `eventProgress`, `progressColor`, `urgencyLabel`, type labels/badges. **08:00 UTC (2 PM BDT) is the shared day-reset constant** |
| `lib/exporter.js` | jsPDF export (standard vs bingo PDF) |
| `lib/reportBug.js` | Bug-report builder; calls `buildPlan` itself (still client-side — the only browser bundle that ships the engine) |
| `lib/wizardContext.js` | Wizard state (resources, target, ownedItems, startFromToday) |

## Key mechanics

### Expected value (calculator.js)

- `expectedCrestsPerDraw`: `E = Σ groupRate × crestValue × dupModifier` over `prize_pool`:
  - `type: "crest"` → averaged `crest_values[]`, no dup modifier
  - `type: "skin_group"` → shared `drop_rate` × `dup_value × owned/total`
  - other types → count-weighted `crest_value × owned/count`
  - **`drop_rate` is a decimal fraction** (0.0008 = 0.08%), and all rates in a pool must sum to 1.0
- `crestsPerDrawBreakdown`: optimistic = E, realistic = E × 0.95, worst = E × 0.85
- `drawsNeeded`: `ceil((target − current − reachableCrestMilestones) / (E × multiplier))` — only `reward_type: "crests"` milestones whose draw threshold is already reached are subtracted.

### Simulators (idealSchedule.*)

Each simulates from `startDay` to `duration_days`, one row per day, and **claims tokens/keys as real free draws** (`row.draws += n`) — so tokens reduce milestone progress and final-push cost:

- **Collector**: diamond phase (daily 1x, opportunistic first-time 10x bulk, Starlight bought when `dia ≥ 300` and affordable, spend-task keys, login key) → CoA phase (CoA-priority draws) → milestone claims → final push (CoA 10x → CoA singles → diamond 10x + singles). Tracks `minDiaBalance` → `day1RechargeNeeded`, and `unaffordableDiaShortfall`.
- **Themed crest**: daily 1x; per-phase recharge/spend task tracking with "don't claim until last day" notes; claim all window tokens on phase close; surprise-window recharge accumulation; milestone claims; final push (10x with `tenx_diamond_only_pct_off` discount, then singles).
- **Aspirants**: pre-phase days idle; in-phase daily 1x with spend-task keys per threshold; phase-start recharge claims; phase-close single top-up; after the last phase, accumulation mode (first-time 10x discount then daily 1x); final push priced at the discounted `daily_1x` per remaining draw.

### Surprise tasks → free draws

- Data: `has_surprise_tasks: true` + `surprise_tasks: { active_days, tasks: [{threshold_dia, tokens}] }`.
- The simulator adds cumulative recharge (packs + `weekly_pass.recharge_task_value` on purchase day) within `active_days` and claims each crossed tier's tokens as free draws. Zero-token tiers (e.g. 750) are skipped.
- The orchestrator **never recommends extra recharge purely for the ladder**: it only tops up to the 750-dia point when that tier is already being crossed incidentally (after accounting for pass recharge value and premium-supply minimums).

### Pack optimization (optimizer.js)

- Item list: `regular[]` packs (unbounded), `weekly_pass` (unbounded, the only item with a time cost `days`), unclaimed `first_purchase[]` packs (0-1).
- In recharge mode (supply tasks), first-purchase packs count only their `dia_base`; otherwise full `total`.
- `optimizeRecharge(containerDia, packsData, eventDurationDays, {fpClaimed}, rechargeMode)` → `{totalBdt, totalDia, completionDay, packsUsed, impossible}`.

### Bingo win condition

- Fixed distribution (`BINGO_DRAWS_PER_LINE`, not probability-derived): lucky 30–40 / realistic 50 / worst 60.
- `freeTokens` = milestone tokens + all supply-window task tokens.
- The plan simulates the **worst case** (60 draws), then caps excess draws (refunding average dia) and stops with a "Stopped at N draws" note.
- Aspirants' per-confidence diamond costs are recomputed by re-running the sim at each target.

### Start Today vs Day 1

- `startFromToday` state lives in the wizard context (lifted from StepFour); `buildPlan` receives `activeStartDay` as `overrideStartDay`.
- `startDay` flows everywhere: simulators iterate from it, phases before it are skipped, `passFirstBuyDay` derives from it, the schedule table and PDF filter rows to `day >= startDay`, and the bug report mirrors the toggle.

## Data usage notes

**Read by code** (see `events.md` for the full schema): `type`, `duration_days`, `premium_supply`, `milestones`, `discount_draw_cost`, `draw_cost_1x/10x`, `shop_items` (crest costs, outfit1), `prize_pool` (calculator), `bingo` (pity skin), `has_surprise_tasks` + `surprise_tasks`, `card_label` (UI), `banner_gradient`/`text_panel_color`/`image` (UI).

**Present but unused by code**: `draw_currency`, `has_pity_first_10`, `bingo.pool_size`, `bingo.skins[].guaranteed_pity`, `bingo.shared_pool_event_id`/`sub_event_id`, `shop_items[].limit`/`is_skin`, `prize_pool[].is_skin`, `packs.json.coa_packs`, `weekly_pass` note/stacking doc fields, `first_purchase[].dia_bonus`/`dia_extra`.

## Known quirks & caveats

- **Placeholders**: string `"PLACEHOLDER_NEEDS_CONFIRMATION"` values are used in data for unconfirmed milestones/supply (sanrio, aspirants). `premiumSupplyWindowPlan` and `milestoneTokenSchedule` **throw** on string inputs, but the bingo branch guards with `Array.isArray` and normalizes supply to `[]` first — so those events still plan.
- **CJS/ESM mix**: `idealSchedule.collector.js` and `idealSchedule.themedCrest.js` use `module.exports` while the orchestrator imports them as named ESM — works through Next.js interop, but aspirants is the only consistent ESM one.
- **Bingo plans have no `daySchedule`/`recharge`** — only the summary panel + pity note render.
- **`coaSufficiency.js` and most of `scheduler.js` are dead code** — the live path is `buildPlan` → simulators → optimizer.
- **`exorcists_2026`** is a hidden shell event (no dates) — filtered from the home page by `status: "hidden"`; `buildPlan` would crash on it, but it's unreachable via UI.
- The root layout's `bg-bg-page` class is not defined in Tailwind config (no-op); `ProgressBar`'s `xs:` breakpoint is also undefined.
