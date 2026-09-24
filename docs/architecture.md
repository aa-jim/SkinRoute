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

**Themed-crest pass search is informed by the supply-task packs** (2026-08-13): step 5 for themed crest runs **Step B1 first** — each phase's recharge-task minimum is bought with the cheapest pack (`optimizeRecharge` recharge-mode) before any balance decision, because those tasks' ~20 free tokens per phase are always worth completing. The pass-search trials then include those packs' diamonds + recharge (`buildThemedCrestPlanWithPacks` with `extraDiaByDay`/`rechargeDiaByDay`), so the shortfall reflects the free draws the tasks unlock — previously the blind trials missed them, the search never broke early, and `optimalPassCount` ran to the cap (5–6 passes) even when the user's balance covered everything. A **surprise-window pass floor** also forces at least `ceil(highestClaimableTier / recharge_task_value)` day-1 passes (3 on JJK/SF) whenever the window is reachable from the plan's start day — the surprise free-draw tiers are claimed even in surplus-balance cases (passes stay the cheapest dia-per-BDT).

**Aspirants: the day-1 pass is dropped when diamonds suffice** (2026-09-13, same-day extension): the pass search's first batch (1 pass at `firstPassBuyDay`, before any phase) only funds draws with dia — but the blind trials missed the phase-recharge tokens, so it was suggested even when the user's balance covered the whole 2,940-dia worst case (4,000 dia in still bought 4 passes). After the search, an aspirants-only **candidate search** evaluates structures WITHOUT that unit by running the parameterized `injectPhasePacks(sink, passCountOverride, dropOverride)` — scratch sink, real state never touched mid-trial — for: same pass count redistributed across the **remaining** phase starts (past phase days are unbuyable), or one fewer pass. Each candidate is priced as passes + phase packs + a shortfall top-up (`optimizeRecharge`, the same knapsack the funding loop uses); the top-up is often genuinely needed because N passes bought the same day drip SEQUENTIALLY (3 phase-start passes contribute 560 in-window dia, not 660). The cheapest candidate is adopted when it costs at most 30 BDT (~15% of a pass) more than the keep-plan — e.g. dia 2,025: 3×d3 passes + r_257 = **1,070 BDT** instead of 4 passes + r_257 = 1,270; the redistribution lands every pass on the first phase start, whose sequential drip (d3–23) stays fully in-window, so no top-up is needed (2,025 + 917 = 2,942 ≥ 2,940). The re-planned candidate often undercuts the keep-plan outright, so the day-1 pass disappears at every dia level for a day-1 start (dia 0 → 3,042); any residual shortfall (e.g. dia 2,000–2,020 → 1,570 with an fp_250 timing top-up) is closed by the checkpoint-staged funding loop described next. Phase-start (recharge-task) passes are never dropped, and `distributePassPurchases(..., skipFirstBatch)` plus the `passPurchasesTotalDia` helper keep the notes, `passReceipts`/`bdtCost`, and the recharge entry's per-pass dia exact (instant dia counts even when the drip falls outside the event).

**Aspirants: 40/50 bingo-checkpoint staging + checkpoint-dated recharge** (2026-09-16): three coupled changes make the schedule land on each win tier instead of blowing through it. (1) The simulator's accumulation-mode first-time 10x is gated on `totalDraws >= 40 && totalDraws + 10 <= targetDraws` (`simulateAspirantsFixedShape` now takes `targetDraws`; it also returns `firstTenxUsed`) — previously it fired on the first affordable post-phase day at any running total (39 draws + 10x = 49, then a lone daily reached 50; late starts fired it at 0 draws). The 10x is reserved for the 40→50 hop, which is cost-neutral (1,050 dia = 10 × the 105 discounted single). (2) `buildAspirantsPlanWithPacks` writes the final push on the last row in tier order — singles → exactly 40 (bingo checkpoint), the reserved 10x → exactly 50, singles → the target — replacing the old single "Final push: N singles" block with identical cost/shortfall economics. (3) The fixed day-20/21/31 shortfall injections are replaced by a bounded loop (≤30 iterations, re-sim each time): an accumulation day that starved (dia < daily cost) gets a small cadence top-up **on that day** (keeps the 1/day cadence alive so 40 lands as early as the calendar allows — e.g. day-1 dia-0 plans reach 40 on day 16, Oct 1, with one top-up pass), and the 50-gap money (the 10x + the remaining tail) is injected on `tenxDay` = the organic 40-checkpoint day **itself** — the simulator's in-loop gate fires the 10x right after the daily draw that reaches 40, which is the user's rule "40 reached and no bingo → buy for 50 and do the 10x the same day"; the tail money lands on `tenxDay + 1`. Late starts with no organic checkpoint fund from `firstAccDay`. Every day's purchase suggestions therefore fund that day's draws. Non-aspirants plans are untouched, and late-start aspirants plans (17/21) collapse the staged push onto their final day, now fully funded instead of carrying a shortfall warning.

**Aspirants: the 10x day is split into a main row and a sub row** (2026-09-20): a day that fires the first-time 10x carries two accounting units — the **main row** (the daily draw that reaches the 40-checkpoint, funded by that day's own recharge: pass instant + pass drip) and the **"if no bingo at 40" sub row** (the 10x hop to 50 plus the packs bought that day to fund it). The simulator keeps one row per day (one running balance), so `attachAspirantsSubrowSplit` publishes the split on that row: `row.subrow = { day, checkpointDraws, draws, diaSpent, dia, diaAdd, diaRecharged, notes }` and `row.main = { draws, diaSpent, diaAdd, diaRecharged, diaLeft, notes }`, with `main + subrow === row` on every summed field and `main.diaLeft === previous row's diaLeft + main.diaAdd - main.diaSpent ≥ 0`. Attribution: packs bought that day **are** the 10x funding (sub row), every other recharge of the day is the main row's; when the day's own recharge cannot cover its own draw (a mid-event start can have the 10x pack funding the daily too), just enough pack money is re-attributed to the main row to keep it non-negative. `simulateAspirantsFixedShape` / `buildAspirantsPlanWithPacks` return `firstTenxDay` (the row the 10x actually landed on) and `checkpointDay` / `tenxDay` / `tailDay` are read off the **final** sim rows, so the anchors can never drift from the schedule. Example (day-1, 0 dia): main row = 1 draw / 105 dia spent / 100 dia added / 17 left, sub row = 10 draws / 1,050 spent / 1,170 added — the hand plan's Oct 1. `ScheduleTable.jsx`, `exporter.js` and `reportBug.js` read the published split and fall back to note-matching only for plans cached before the field existed (the verifier asserts all of it).

**Aspirants: lazy-cadence pacing — rich starts follow the calendar** (2026-09-21): the accumulation mode used to take the discounted 1x on EVERY affordable gap/post-spend day, so a rich balance (≥ ~1,000 dia) stockpiled draws: 39 by day 11, the 40-checkpoint landed mid-phase-2 at cum 42 and the 10x pushed it to 52, the tail compressed to day 20 and the final days sat idle. The 0-dia plan only paced "right" because those days starve. Fix, in `simulateAspirantsFixedShape`: an accumulation day (between-phase gap, or the calm tail of a phase whose spend tasks are cleared) **skips** its discounted daily when (a) **checkpoint anchor** — drawing would cross 40 before the first accumulation day (`lastPhaseEnd + 1`), or (b) **spare capacity** — the remaining calendar (one discounted daily per day + the free tokens of future phase windows + the reserved 10x) already covers the target; both holds are funding-gated (skip only if tomorrow can still afford its own daily), so balance-poor plans keep their exact shape — the day-1/0-dia plan is byte-hash pinned in `scripts/verify-aspirants.mjs` (`7fe7408383add391`). The 10x window itself is now `day >= lastPhaseEnd + 1` (the old `isLastPhase && phaseSpendTasksDone` early-fire path is gone). Result: every surplus day-1 plan reads 40 exactly on day 15 (Sep 30) with the 10x same day → 50, then 1/day to day 23 (Oct 8, push 2) — no idle tail, tiers monotonic; BDT shifts by the honest price of pacing (~+150–300 on some rich cells, e.g. dia 2,000–2,025 → 1,380).

**Aspirants: token-guarded holds — the ladder runs unbroken into the checkpoint** (2026-09-24, supersedes the day-15 half of the entry above): the converge-on-checkpoint hold still rested a day it did not need — with cum 38 on 9/28 (phase 2's calm tail, all 16 phase-2 tokens already claimed) the arrival model said "the calendar reaches 40 by 9/30 anyway", so the plan skipped the 9/28 daily, read 39 on 9/29 and only took 40 + the same-day 10x on 9/30. That left a gap at cum ≥ 30 right in front of the checkpoint; the target pacing is 39 on 9/28 → 40 + same-day 10x on 9/29. Fix in `simulateAspirantsFixedShape`: the pre-checkpoint hold is scoped to `futureTokens > 0` — its job is to stop PENDING phase tokens from overshooting the checkpoint (the 9/21–24 holds keep the plateau at cum 19 while phase 2's 16 tokens are still bankable), so once every phase token is claimed it always draws and the ladder runs 34 (9/25) → 35 → 38 → 39 (9/28) → 40 + same-day 10x (9/29) → 51 (9/30) → 60 on 10/8. An intermediate variant that held only true between-phase gap days was tried first and rejected: it broke the 9/21–24 plateau, crossed 40 on 9/27 and left a double 9/28+9/29 gap while the 10x waited for `firstAccDay`. Net effect (78-cell A/B against HEAD): start-1/4/5 cells move checkpoint + 10x to 9/29, spend 105 dia less (one discounted daily replaces two full-price push singles) and mostly get cheaper (day-1 2,000 fp-none 1,380 → 1,236, 2,025 → 1,175; start-5 2,000 → 1,304; fp-all day-1 1,294; 0-dia fp-all 4,940), the 0-dia fp-none reference keeps its ৳3,415 with the checkpoint + 10x one day earlier (d15 → d14), and day-500 cells pay +296..+359 for funding the 9/28 daily earlier (the surviving tier-pacing guard rejects the cheaper-but-slower candidate). Starts 7/10/17/21/23 are byte-identical; the 0-dia pin is re-pinned to `772ce2f03ad12bcf`.


**Step D — global pack reconciliation** (2026-08-14): the per-chunk knapsack calls (B1/Step B/Step C) are each DP-optimal for their exact container, but the partition as a whole isn't — after the B1 restructure, SF's old exact-fit 706-dia chunk became 250+191 (small-pack overhead, +25tk) while JJK's over-buy shrank. After the surprise-750 sizing, Step D re-optimizes the TOTAL regular-pack dia in one `optimizeRecharge` call with **all FP packs marked claimed** (FP purchases were already decided; otherwise the candidate re-introduces unclaimed fp packs), enumerates re-assignments of the candidate packs onto the existing purchase days (phase-start days keep ≥ their current recharge credit so recharge-task and surprise-window claims survive), and adopts only when **strictly cheaper** and an oracle re-sim passes: `unaffordableDiaShortfall === 0`, every `row.diaLeft ≥ 0`, `surpriseCumRecharge` not reduced. Passes and FP packs never move; accepted trade-off is a 1–3 dia tick up in the reported recharge (knapsack overshoot).



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
  winCondition: { draws: { lucky: [30,40], realistic: 50, worst: 60 }, pity, diamondCost, bdtCost },
  dailySchedule                                   // informational skeleton
}
```

Aspirants-only: the day the first-time 10x fires carries a published `main` / `subrow` pair (see the staging note above) — `main + subrow` equals the day row on every summed field, so consumers can show the 40th-draw row with only its own recharge and spend.

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
| `lib/eventHelpers.js` | `eventDayNow`, `daysLeft`, `deriveStatus`, `eventProgress`, `progressColor`, `urgencyLabel`, early-plan helpers (`EARLY_PLAN_DAYS`, `eventStartDate`, `daysUntilStart`, `isEarlyPlanable`), live countdown (`timeLeft`, `timeLeftLabel`), type labels/badges. **08:00 UTC (2 PM BDT) is the shared day-reset constant** |
| `components/ui/FirstVisitNotice.jsx` | One-time "not a skin store / phishing warning" modal (localStorage `skinroute.notice.v1`), mounted in `app/layout.js` |
| `components/ui/EventCard.jsx` | Home-page card: early-plan unlock (7-day pre-start window), live `Nd Mh left` countdown for active events |
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
- **Themed crest**: daily 1x; per-phase recharge/spend task tracking with "don't claim until last day" notes; **spend-task clears on a window's last day buy a discounted 10x (tenx_diamond_only_pct_off ≈ 10%)** instead of full singles when the plan still needs bulk draws (falls back to singles for small demand; never on the event's final day); claim all window tokens on phase close; surprise-window recharge accumulation (including `recharge_task_value` from passes the plan buys); milestone claims; final push (10x with `tenx_diamond_only_pct_off` discount, then singles).
- **Aspirants**: pre-phase days idle; in-phase daily 1x with spend-task keys per threshold; phase-start recharge claims; phase-close single top-up; after the last phase, accumulation mode with **token-guarded converge-on-checkpoint holds** — before the first accumulation day, an accumulation day skips its discounted daily only while future phase tokens are still pending and the remaining pre-checkpoint calendar + those tokens already arrive at 40 without it (no rest in front of the checkpoint: 39 on 9/28 → 40 on 9/29 with the same-day 10x → 50); from the checkpoint day on, a capacity check holds surplus dailies so the target lands exactly on the final day. Holds are funding-gated (payable-balance projection + "tomorrow can still draw"), so balance-poor plans stay need-driven; first-time 10x only on/after the first accumulation day; final push priced at the discounted `daily_1x` per remaining draw.

### Surprise tasks → free draws

- Data: `has_surprise_tasks: true` + `surprise_tasks: { active_days, tasks: [{threshold_dia, tokens}] }`.
- The simulator adds cumulative recharge (packs + `weekly_pass.recharge_task_value` on purchase day) within `active_days` and claims each crossed tier's tokens as free draws. Zero-token tiers (e.g. 750) are skipped.
- The orchestrator credits **extra pass purchases** (the pass search's `extraPasses`) with `recharge_task_value` on `firstPassBuyDay`, so a day-1 pass unlocks the surprise tiers it legitimately earns (and counts toward a supply window's recharge tasks when bought on its start day).
- `surpriseLadder` is computed from the sim's **window** cumulative recharge (`sim.surpriseCumRecharge`), not whole-event recharge — `tiersCrossed` only reports tiers the schedule actually claims.
- The orchestrator **never recommends extra recharge purely for the ladder**: it only tops up to the 750-dia point when that tier is already being crossed incidentally (after accounting for pass recharge value and premium-supply minimums).

### Pack optimization (optimizer.js)

- Item list: `regular[]` packs (unbounded), `weekly_pass` (unbounded, the only item with a time cost `days`), unclaimed `first_purchase[]` packs (0-1).
- In recharge mode (supply tasks), first-purchase packs count only their `dia_base`; otherwise full `total`.
- `optimizeRecharge(containerDia, packsData, eventDurationDays, {fpClaimed}, rechargeMode)` → `{totalBdt, totalDia, completionDay, packsUsed, impossible}`.

### Bingo win condition

- Fixed distribution (`BINGO_DRAWS_PER_LINE`, not probability-derived): lucky 30–40 / realistic 50 / worst 60.
- `freeTokens` = milestone tokens + all supply-window task tokens.
- The plan simulates the **worst case** (60 draws), then caps excess draws (refunding average dia) and stops with a "Stopped at N draws" note.
- `winCondition.bdtCost` (bingo) = per-tier **BDT** read off the final day-by-day schedule: a prefix sum of the actual pack + pass purchases (`packsByDay` + pass purchase dates) over the days up to the day each draw tier is reached. It is a strict prefix of the single full-event recharge plan — `worst` always equals `recharge.totalBdt`, and a tier covered by owned diamonds alone is 0. Shown as a second line in the Step 4 diamond cards and a "Plan Cost (BDT)" column in the PDF. BDT per tier is now computed by `buildBingoPlanForTarget` probes (targetDraws 30/40/50, `isProbe` skips the bdtCost recursion; worst = the plan itself = `recharge.totalBdt`); the first-time 10x is only bought for targets > 40 (the sim reserves it for the 40→50 hop) and tiers are capped monotonic.
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
