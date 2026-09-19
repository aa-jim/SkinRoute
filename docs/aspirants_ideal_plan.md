# Aspirants 2026 — Ideal Plan Reference Document

**Event:** The Aspirants (Sep 16 – Oct 8, 2026)  
**Type:** Bingo (box completion)  
**Duration:** 23 days  
**Target:** 60 draws (worst case)  
**Draw Costs:** daily_1x = 105 dia, draw_cost_1x = 210 dia, first_time_10x = 1050 dia  
**Pass:** 200 BDT, 80 instant + 20/day × 7 days (sequential queue), 100 recharge credit on purchase day  
**Phase 1:** Day 3–7 (5 days), recharge threshold 250, spend tasks at 100/250  
**Phase 2:** Day 10–14 (5 days), same thresholds  
**Accumulation starts:** Day 15 (firstAccDay = lastPhaseEnd + 1)

---
## Read this first (updated Sep 19 2026)

This document is the **hand-worked, first-purchase-excluded** reference: it assumes no `fp_50/150/250/500` bonuses are
available on the account. With FPs available the knapsack strictly prefers `fp_500` (1,065 dia for 1,020 BDT) over this
document's own "ideal for a 1,033-dia container" bouquet (`r_55+r_275+r_706` = 1,036 dia for 1,880 BDT), so the engine
reports a much lower number for the same schedule structure:

| scenario (worst = 60 draws, 0 dia, 0 passes, day-1 start) | BDT | recharge dia | passes | source |
|---|---|---|---|---|
| FPs available — what the planner shows | **3,415** | 3,257 | 4 (3 on day 3, 1 on day 15) | `npm run verify:aspirants` |
| FPs pre-claimed (≈ this document's assumption) | **5,141** | 3,250 | 4 (3 on day 3, 1 on day 15) | same harness |
| This document's hand arithmetic | 5,378 | 3,258 | 4 (3 on day 3, 1 on day 16) | hand-worked |

Two arithmetic corrections to the tables below, both verified against the engine:
- A 4th pass bought on day 16 drips days 22–23 only (the first three occupy days 3–21), so it contributes
  **80 + 2×20 = 120 dia** in-window — not 220. The engine therefore anchors the accumulation funding on **day 15**
  (`firstAccDay = lastPhaseEnd + 1`), and for a day-1 start the 40-draw checkpoint lands on day 15.
- The last row is `1x daily` + **2** full-price singles (525 dia), not 1 daily + 3 regular (735): the daily cadence plus
  the day-15/16 injections already produce 58 of the 60 draws for a day-1 start.

## Ideal Schedule (0 dia, 0 passes, startDay 1, worst/60 draws)

| Day | Date | Phase | Recharge Action | BDT | Dia Added | Draws | Cum Draws | Dia Spend | Dia Left | Notes |
|-----|------|-------|-----------------|-----|-----------|-------|-----------|-----------|----------|-------|
| 1 | 16-Sep | Pre | — | 0 | 0 | 0 | 0 | 0 | 0 | Event start |
| 2 | 17-Sep | Pre | — | 0 | 0 | 0 | 0 | 0 | 0 | |
| **3** | **18-Sep** | **P1** | **3× weekly pass** | **600** | **260** | **15** | **15** | **105** | **155** | 1 daily + 2 spend_100 + 12 recharge tokens |
| 4 | 19-Sep | P1 | — | 0 | 20 | 1 | 16 | 105 | 70 | daily |
| 5 | 20-Sep | P1 | — | 0 | 20 | 0 | 16 | 0 | 90 | save |
| 6 | 21-Sep | P1 | — | 0 | 20 | 3 | 19 | 105 | 5 | daily + 2 spend_250 |
| 7 | 22-Sep | P1 | — | 0 | 20 | 0 | 19 | 0 | 25 | |
| 8 | 23-Sep | P1 | — | 0 | 20 | 0 | 19 | 0 | 45 | |
| 9 | 24-Sep | P1 | — | 0 | 20 | 0 | 19 | 0 | 65 | P1 ends |
| **10** | **25-Sep** | **P2** | **r_257** | **470** | **277** | **15** | **34** | **105** | **237** | 1 daily + 2 spend_100 + 12 recharge |
| 11 | 26-Sep | P2 | — | 0 | 20 | 1 | 35 | 105 | 152 | daily |
| 12 | 27-Sep | P2 | — | 0 | 20 | 3 | 38 | 105 | 67 | daily + 2 spend_250 |
| 13 | 28-Sep | P2 | — | 0 | 20 | 0 | 38 | 0 | 87 | |
| 14 | 29-Sep | P2 | — | 0 | 20 | 1 | 39 | 105 | 2 | daily |
| 15 | 30-Sep | Acc | — | 0 | 20 | 0 | 39 | 0 | 22 | |
| **16** | **1-Oct** | **Acc** | **1× weekly pass** | **200** | **100** | **1** | **40** | **105** | **17** | daily → 40 |
| **16** | **1-Oct** | **Acc** | **r_55+r_275+r_706** | **1880** | **1036** | **10** | **50** | **1050** | **3** | 1st-time 10x → 50 |
| **17** | **2-Oct** | **Acc** | **r_5+r_257×2+r_706** | **2228** | **1245** | **1** | **51** | **105** | **1143** | daily |
| 18 | 3-Oct | Acc | — | 0 | 20 | 1 | 52 | 105 | 1058 | daily |
| 19 | 4-Oct | Acc | — | 0 | 20 | 1 | 53 | 105 | 973 | daily |
| 20 | 5-Oct | Acc | — | 0 | 20 | 1 | 54 | 105 | 888 | daily |
| 21 | 6-Oct | Acc | — | 0 | 20 | 1 | 55 | 105 | 803 | daily |
| 22 | 7-Oct | Acc | — | 0 | 20 | 1 | 56 | 105 | 718 | daily |
| **23** | **8-Oct** | **Acc** | **—** | **0** | **20** | **4** | **60** | **735** | **3** | 1 daily (105) + 3× regular (630) |

### Engine schedule for the same scenario (FPs available)

Straight from `npm run verify:aspirants` — worst, 0 dia, 0 passes, start day 1 → **৳3,415**, 60 draws, 3,150 dia spent,
3,257 recharge dia, 7 dia left. BDT is money (packs + passes only); the daily draws are diamond spends:

| Day | Actions | Draws | Cum | BDT |
|-----|---------|-------|-----|-----|
| 3 | 3× weekly pass + daily (+2 spend_100, +12 recharge tokens) | 15 | 15 | 600 |
| 4 | daily | 1 | 16 | — |
| 6 | daily (+2 spend_250 tokens) | 3 | 19 | — |
| 10 | r_257 + daily (+2 spend_100, +12 recharge tokens) | 15 | 34 | 470 |
| 11 | daily | 1 | 35 | — |
| 12 | daily (+2 spend_250 tokens) | 3 | 38 | — |
| 14 | daily | 1 | 39 | — |
| 15 | fp_500 + r_55 + 1× weekly pass + daily + 1× 10-draw (first-time discount) | 11 | 50 | 1,325 |
| 16 | fp_150 + fp_250 + fp_50 + r_55 + daily | 1 | 51 | 1,020 |
| 17–22 | daily | 6 | 57 | — |
| 23 | daily + 2 singles → 60 (bingo target reached) | 3 | 60 | — |
| **Total** | | **60** | | **৳3,415** |

With the first-purchase bonuses pre-claimed (this document's assumption) days 15–16 instead buy
`r_5 + 2×r_275 + r_565` (2,033) and `2×r_11 + r_55 + r_706 + r_5 + 3×r_11 + r_172` (~1,838) → **৳5,141** for the same
60 draws and the same 3,150 dia spend.

---

## Totals

| Metric | Hand-worked reference (FPs excluded) | Engine, FPs pre-claimed | Engine, FPs available |
|--------|-------|-------|-------|
| **Total BDT** | **5,378** | **5,141** | **3,415** |
| **Total Passes** | **4** (3 on day 3, 1 on day 16) | 4 (3 on day 3, 1 on day 15) | 4 (3 on day 3, 1 on day 15) |
| **Total Dia Spent** | **3,255** | 3,150 | 3,150 |
| **Total Draws** | **60** | 60 | 60 |
| **Final Dia Left** | **3** | 0 | 7 |
| **Recharge Dia (passes + packs)** | **3,258** | 3,250 | 3,257 |
| **40-draw checkpoint / 10x day / tail day** | day 16 / 16 / 17 | day 15 / 15 / 16 | day 15 / 15 / 16 |

Engine columns are produced by `scripts/verify-aspirants.mjs` (`npm run verify:aspirants`). Its totals are BDT
cost, not a value judgment: the 3,415 figure buys *less* diamond than the 5,378 one for the same 60 draws.

---

## Per-tier costs (engine, worst = 60 draws, 0 dia, day-1 start)

The bingo summary cards are each priced by planning **that tier separately** (`buildBingoPlan` probes 30/40/50; the worst
tier is the full plan), so these are real plans — not prefixes of the 60-draw schedule. Measured with the harness:

| Tier | Target draws | Dia cost | BDT (FPs available) | How reached |
|------|--------------|----------|---------------------|-------------|
| Lucky[0] | 30 | 392 | 1,070 | phases 1–2 dailies + phase tokens |
| Lucky[1] | 40 | 840 | 1,070 | same structure covers 40 — nothing extra to buy |
| Realistic | 50 | 1,890 | 2,395 | adds the first-time 10x |
| Worst | 60 | 3,150 | 3,415 | full plan (5,141 if all FPs are pre-claimed) |

Older revisions of this table (~2,000 / ~3,150 / ~5,030 / 5,378) mixed two different assumptions: they charged each tier a
prefix of the 60-draw schedule — including end-game top-ups that only fund draws 51–60 — and they ignored the
first-purchase bonuses. Both pushed the cards far above what the plan actually costs.

## Key Decision Points (Planner Logic)

### 1. Pass Search
- **Goal:** Find minimum passes such that pre-window balance ≥ 0 AND final shortfall = 0
- **0-dia startDay-1:** 3 passes on day 3 (phase 1 start)
- **Mechanism:** Trial sim with increasing passes; stop at first valid
- **Pass floor:** surprise window not reachable (no surprise_tasks in aspirants)

### 2. Phase 1 Recharge (Day 3)
- 3 passes provide 300 recharge credit → meets 250 threshold exactly
- **minForTasks = 0** → no packs needed for recharge

### 3. Phase 2 Recharge (Day 10)
- No passes purchased on day 10 → existing recharge = 0
- **minForTasks = 250** → would need packs, BUT balanceNeed = 0 (drip covers daily)
- **Pass substitution check:** minForTasks (250) > 200 (2×100) → NO substitution
- **Result:** r_257 for balance only (277 dia)

### 4. Accumulation anchor (day 15 = firstAccDay)
- **firstAccDay = lastPhaseEnd + 1 = 14 + 1 = 15** — the first day the plan can draw a discounted single and the first
  day funding is actually needed. Implemented as `ASPIRANTS_ACC_OFFSET = 1` in one shared helper (`firstAccDayOf(sim)`),
  read by both the funding loop and the staging fallback (they had drifted to `+2` vs `+1`).
- Traced on the old offset-2 code: the day-16 row sat at **42 dia** (`< 105`) → starved → the loop's top-up bought a
  4th pass. With offset 1 the anchor row is day 15.
- **Pass vs packs on that day:** three passes bought on day 3 occupy the drip queue for days 3–21, so a 4th pass drips
  only days 22–23 → **80 + 2×20 = 120 dia** in-window for 200 BDT = **1.67 BDT/dia**; the equivalent pack (`r_110`,
  110 dia) costs 210 BDT = **1.91 BDT/dia**. The pass wins — which is why the engine buys it, and why a flat
  "220 dia per pass" assumption (this document's original day-16 line) overstates it by 100 dia.

### 5. 10x funding (day 15)
- What remains to fund on the anchor day is the first-time 10x (1,050 dia) plus that day's daily (105):
  `needTenx = 1,050 + 105 − diaLeft(anchor day)`, capped by the whole-plan shortfall.
- **FPs available (engine):** day 15 = `fp_500` (1,020 BDT) + `r_55` (105) + the 4th pass (200) = **1,325 BDT**.
- **FPs excluded (this document's assumption):** day 15 = `r_5 + 2×r_275 + r_565` (2,033 BDT) + the pass.
  The old hand bouquet `r_55+r_275+r_706` (1,880 BDT) is *worse than both* — the DP finds a cheaper combination for
  the same container every time.

### 6. Tail funding (day 16 = tailDay)
- Remaining draws after day 15: 51 → 60 (dailies on days 16–23 plus the last-row push of 2 full-price singles).
- The branch sizes its container as `shortfall − remainingDays × (210 − 105)` **but always falls back to the raw
  shortfall when that estimate swallows the residual** (`max(0, …) || shortfall`) — that fallback is the under-recharge
  fix; see `docs/aspirants2026_status.md` §2 for the full trace. A no-progress escape funds the recomputed residual if
  no other stage had anything to fund, so the `guard < 8` cap can never ship an unfunded plan.
- **FPs excluded (engine):** day 16 = `2×r_11 + r_55 + r_706 + r_5 + 3×r_11 + r_172` ≈ **1,838 BDT**.
- **FPs available (engine):** day 16 = `fp_150 + fp_250 + fp_50 + r_55` = **1,020 BDT**.

---

## Implementation status (fixed Sep 19 2026)

The aspirants funding loop in `lib/planOrchestrator.js` now reads:

| Area | Behaviour |
|------|-----------|
| `firstAccDay` | one shared helper `firstAccDayOf(sim)` (`ASPIRANTS_ACC_OFFSET = 1`) used by the funding loop and the staging fallback |
| Starved anchor day | small top-up on the anchor day if it cannot fund its daily (a pass when the day value favours it, otherwise the cheapest pack) |
| 10x funding | anchor day: `1,050 + 105 − diaLeft(anchor)`, capped by the plan shortfall |
| Tail funding | `max(0, shortfall − remainingDays × 105) || shortfall` — **the under-recharge fix** |
| No-progress escape | funds the recomputed residual when no stage injected anything, so the `guard < 8` cap can never ship an unfunded plan |
| Per-tier cards | fresh probe plans per tier (30/40/50/60), capped monotonic |
| Simulator (`lib/idealSchedule.aspirants.js`) | 10x gated `totalDraws >= 40 && totalDraws + 10 <= targetDraws`; final push written in tier order (singles → 40, 10x → 50, singles → target) |

## Verification (`npm run verify:aspirants`)

`scripts/verify-aspirants.mjs` (+ `scripts/next-alias-hook.mjs`) runs the real `buildPlan` on plain Node and asserts, for
every grid cell: 60 draws, **0 warnings**, `starting dia + recharge ≥ total spend`, no negative `diaLeft`, the 10x never
crossing the 40-draw checkpoint, non-zero staging anchors, ≤ 10 passes, monotonic dia/BDT tiers, and
`bdtCost.worst === recharge.totalBdt`. It also pins 6 non-aspirants plans by sha256 over the whole plan object, so the
shared bingo branch cannot quietly move Street Fighter / JJK / Collector.

Primary target — 0 dia, 0 passes, start day 1, worst (60 draws):

| Metric | Reference (FPs excluded) | Engine, FPs pre-claimed | Engine, FPs available |
|--------|--------------------------|--------------------------|------------------------|
| Total BDT | 5,378 | 5,141 | **3,415** |
| Passes | 4 (3 + 1) | 4 (3 + 1) | 4 (3 + 1) |
| Draws | 60 | 60 | 60 |
| Final dia left | 3 | 0 | 7 |
| 40-draw checkpoint | day 16 | day 15 | day 15 |
| 10x / tail day | 16 / 17 | 15 / 16 | 15 / 16 |

Grid — 108 cells (dia × start day × FPs claimed/unclaimed), all passing, FPs available, worst:

| dia \ start | 1 | 4 | 10 | 17 | 21 | 23 |
|---|---|---|---|---|---|---|
| 0 | 3,415 | 9,390 | 10,542 | 17,271 | 18,107 | 18,340 |
| 500 | 2,956 | 6,883 | 9,220 | 16,300 | 17,225 | 17,655 |
| 1,000 | 2,692 | 5,746 | 8,330 | 15,514 | 16,314 | 16,752 |
| 1,500 | 2,080 | 4,856 | 7,512 | 14,603 | 15,395 | 15,854 |
| 2,000 | 1,236 | 3,674 | 6,621 | 13,701 | 14,619 | 15,068 |
| 2,025 | 1,070 | 3,627 | 6,573 | 13,653 | 14,578 | 15,020 |
| 4,000 | 1,070 | 1,215 | 3,015 | 10,203 | 11,117 | 11,565 |

Non-aspirants non-regression (baselines captured on the pre-fix commit `7ba2cdb`, first 16 hex of the plan sha256):

| Event | Scenario | Plan hash |
|-------|----------|-----------|
| street_fighter_2026 | 0 dia, day 1 | `0e9312c939f0d56b` |
| street_fighter_2026 | 1,000 dia, day 1 | `53e0920361c9370d` |
| jujutsu_kaisen_2026 | 0 dia, day 1 | `259d00e29cbd6c6c` |
| jujutsu_kaisen_2026 | 2,000 dia, day 1 | `98b29641030d51eb` |
| exquisite_collection | 0 dia, day 1 | `67bc0d2ac3b262d2` |
| exquisite_collection | 500 dia, day 5 | `64a8cf5fae0f79a2` |

## Remaining open items

- Mid-event starts (day 17/21/23) still collapse the 50→60 push onto the final day — funded and honest for a 3–7 day
  window, but poor pacing. Fixing it is a scheduling change, not a funding change.
- The 40-draw checkpoint for a day-1 start now lands on day 15 (anchor offset 1). Offsets 1 and 2 each win on some inputs
  (dia 1,000 / day 1 prefers 2 by ৳164), so probing both anchors and keeping the cheaper plan is a future refinement.
- The starved-day check only inspects the anchor day — harmless on the current calendar (0 warnings across the grid).

## Future reference

Any planner change must preserve:

1. Exactly 60 draws for the worst tier, tiers reached in order (40 → 50 → 60) with the 10x never crossing 40.
2. Monotonic per-tier dia/BDT (30 ≤ 40 ≤ 50 ≤ 60) and `bdtCost.worst === recharge.totalBdt`.
3. **Every** plan fully funded — `npm run verify:aspirants` exits 0, with no `recharge_needed` warning anywhere in the grid.
4. No regressions in JJK / Street Fighter / Collector / Sanrio (hash pins above).
