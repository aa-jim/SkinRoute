# Aspirants 2026 — Status (updated Sep 19 2026)

> Branch: `aspirants2026` (off `test` at 1c25112). `test` is the live/clean branch. This doc covers the event config, the under-recharge bug and its fix, the verified numbers, and what is still open.

## 1. Event config
- `data/events.json:aspirants_2026` — bingo (box, 2 skins: Angela *Cyber Cherubin*, Ruby *Mecha Maiden*), duration 23 (Sep 16 – Oct 8 2026), `draw_cost_1x 210`, `draw_cost_10x 2100`, `discount daily_1x 105`, `first_time_10x 1050`, phases P1 day 3–7 / P2 day 10–14 (16 free tokens each: login 1 + recharge 12 + spend 4), thresholds `recharge_250` + `spend_100/250`.
- `status` is now **`"active"`** (was `"early"` — a leftover manual override; the event went live Sep 16 and `deriveStatus` already reported it active, so the field was inert).
- `milestones` is now **`[]`** (was the string `"PLACEHOLDER_NEEDS_CONFIRMATION"`). The bingo path normalizes non-arrays to `[]` anyway, but `lib/scheduler.js`'s `milestoneTokenSchedule` **throws** on the string form. If Aspirants does award milestone tokens, adding real rows here will **lower** every plan cost (the sim claims them as free draws).
- Packs: `data/packs.json` (`r_*` regular, `fp_*` first purchase). Weekly pass 200 BDT = 80 instant + 20/day × 7 **sequential** drip, `recharge_task_value` 100 credited on the purchase day.
- Reference: `docs/aspirants_ideal_plan.md` (hand-worked, FP-excluded) — the engine reproduces that structure; see §3 for the engine's own numbers.
- Knapsack: `lib/optimizer.js` is an exact port of `Modified_0-1_Knapsack.cpp`. Container = required dia; FP already-claimed or `rechargeMode` changes weights.
- As of Sep 19 the event is **live, in-game day 4** (inside phase 1, days 5–7 left of it). Plan cost at 0 dia: day 1 **৳3,415** · day 4 ৳9,390 · day 10 10,542.

## 2. The under-recharge bug — root cause and fix (fixed Sep 19 2026)

### Symptom
Dia-poor plans shipped a funding warning instead of a funded plan: "Free draws don't cover the target. N extra diamonds needed." N was 175 (0 dia / day 1), 363–384 (500–1,000 dia), 629–734 (start days 10–17), 47–206 (late starts); the FP-claimed case warned 210 with the ৳4,925 total that the previous revision of this doc quoted as "live". The plans also *over-bought* at the same time — e.g. an `r_2195` (3,850 BDT) on day 17 left 4,816 dia idle and the plan still ended 734 dia short.

### Root cause (traced)
In the aspirants funding loop (`lib/planOrchestrator.js`) the tail branch sized its injection as
`needTail = max(0, unaffordableDiaShortfall − remainingDays × (210 − 105))` — crediting the plan with a 50%-off daily draw on every remaining day. Whenever the residual fell below that projected saving the branch evaluated to **0 and injected nothing**, so the remaining iterations burned the `guard < 8` budget and the loop exited with the plan still short. Day-1 / 0-dia trace (shortfall after each iteration):

| iter | branch taken | injected | shortfall after |
|---|---|---|---|
| 0 | starved day-16 top-up (1 pass = 120 dia) | 120 | **3,898** (up from 3,073 — the deficit is NOT monotone) |
| 1 | first-time 10x funding (day 16) | 1,098 | 1,645 |
| 2 | tail (day 17): `1,645 − 735 = 910` | 945 | 175 |
| 3–7 | tail: `max(0, 175 − 735) = 0` | **0** | **175 — stuck; guard budget exhausted** |

The projected saving is only real for days that actually draw; a starved day saves nothing, and the days before the first funding anchor were never funded at all.

### Fix
1. **Tail fallback** — `needTail = max(0, shortfall − savings) || shortfall`. The saving still sizes the injection where it applies; the residual is always funded.
2. **No-progress escape** — the loop tracks whether the iteration injected anything; if no stage had something to fund it funds the recomputed residual directly on the tail day, so a guard cap can never exit with an unfunded plan. (Raising `guard` to 30 without this changed nothing — proof the dead end, not the iteration count, was the cause.)
3. **`firstAccDay` unified** — one helper (`ASPIRANTS_ACC_OFFSET = 1`) shared by the loop and the staging fallback (they had drifted to `lastPhaseEnd + 2` vs `+ 1`). Offset 1 = day 15 for a day-1 start: the first accumulation day, i.e. the first day the money is needed. Measured: day-1 0-dia ৳3,615 → **৳3,415**, day-4 ৳9,601 → **৳9,390**, day-10 ৳10,623 → **৳10,542**; elsewhere equal (±1 BDT) except dia 1,000/day-1 (৳2,692 vs ৳2,528 — the day-15 anchor packs slightly more dia there). Both variants are fully funded.

Deliberate consequence: **reported BDT rises** wherever the old plan was unfundable — the old figures priced diamonds the schedule never bought.

## 3. Verified numbers (`npm run verify:aspirants`)

`scripts/verify-aspirants.mjs` (+ `scripts/next-alias-hook.mjs`) runs the real `buildPlan` on plain Node over the aspirants grid and asserts: 60 draws, **0 warnings**, `starting dia + suggested recharge ≥ total spend`, no negative `diaLeft`, the first-time 10x never crossing the 40-draw checkpoint, staging anchors > 0, ≤ 10 passes, and monotonic per-tier dia/BDT ladders with `bdtCost.worst === recharge.totalBdt`. It also pins 6 non-aspirants plans (Street Fighter / JJK / Collector) by sha256 over the whole plan object.

Grid — 108 plans (dia 0…4,000 × start day 1/4/10/17/21/23 × FP unclaimed/claimed), all passing, "worst" = 60 draws, no passes owned, **all four first-purchase bonuses available**:

| dia \ start | 1 | 4 | 10 | 17 | 21 | 23 |
|---|---|---|---|---|---|---|
| 0 | **3,415** | 9,390 | 10,542 | 17,271 | 18,107 | 18,340 |
| 500 | 2,956 | 6,883 | 9,220 | 16,300 | 17,225 | 17,655 |
| 1,000 | 2,692 | 5,746 | 8,330 | 15,514 | 16,314 | 16,752 |
| 1,500 | 2,080 | 4,856 | 7,512 | 14,603 | 15,395 | 15,854 |
| 2,000 | 1,236 | 3,674 | 6,621 | 13,701 | 14,619 | 15,068 |
| 2,025 | 1,070 | 3,627 | 6,573 | 13,653 | 14,578 | 15,020 |
| 4,000 | 1,070 | 1,215 | 3,015 | 10,203 | 11,117 | 11,565 |

With all four first-purchase bonuses **already claimed**: 0 dia / day 1 = **৳5,141**, day 4 = ৳11,074; dia ≥ 2,025 / day 1 unchanged at ৳1,070.

Landmark day-1 / 0-dia plan (worst, nothing owned): 4 × weekly pass + `r_257` + 2 × `r_55` + `fp_500` + `fp_50/150/250` = **৳3,415**, 3,257 recharge dia vs 3,150 spent, 7 dia left, 40-draw checkpoint on day 15, 10x day 15, tail day 16, final-day push sequencing 40 → 50 → 60.

How that compares to the hand-worked reference (`docs/aspirants_ideal_plan.md`, FP-excluded, ৳5,378): the same structure, bought through the first-purchase bonuses — `fp_500` alone is 1,065 dia for 1,020 BDT where the reference spends ৳1,880 for 1,036 dia. The reference's exact per-tier table (2,000 / 3,150 / 5,030 / 5,378) is not what the engine reports either: the cards read the per-tier probe plans — BDT 1,070 / 1,070 / 2,395 / 3,415 and dia 392 / 840 / 1,890 / 3,150 at 0 dia / day 1.

### Other mechanics confirmed while verifying
- First-time 10x fires only once 40 draws are in and 50 is still needed; it never crosses the 40 checkpoint (`tests` in the harness).
- Recharge-task passes are credited on their purchase day, so the phase starts still reach `recharge_250` without extra packs (`3 × pass` on day 3 = 300 recharge).
- `dropFirstPass` (diamonds suffice → no day-1 pass) still works: dia 2,025 / day 1 = ৳1,070 with 3 × phase-start pass + `r_257`, unchanged by this fix.

## 4. How to verify
- `npm run verify:aspirants` — the 108-plan grid + invariants + the 6 non-aspirants hash checks (~30 s, exits non-zero on any violation). `--quick` runs a 2-plan smoke.
- UI: aspirants, 0 dia, both "Start Today" (day 4) and Day 1, worst confidence — no warning banner, gold circle on the first row that crosses 40, `1x daily` + `1x 10-draw` on the same accumulation day, last-day push landing exactly on 60; PDF export renders the same rows.
- `npm run lint` → 3 pre-existing `<img>` warnings only. `npm run build` → passes (**EXIT=0**, all routes). Gotcha: a `next dev` server running against the same `.next` folder makes `next build` die with a bogus `PageNotFoundError: /_document` — stop the dev server first.
- Branch: `aspirants2026` carries the fix; `test`/`main` are untouched and still clean.

## 5. Remaining open items
- **Last-day draw dump on mid-event starts** — a start on day 17/21/23 still collapses the 50→60 push onto the final day (`1x daily` + a block of full-price singles). It is funded and honest for a 3–7 day window, but the pacing is poor; fixing it is a scheduling change, not a funding change.
- **Anchor micro-optimization** — offsets 1 and 2 each win on some inputs (dia 1,000/day-1 prefers 2 by ৳164). Probing both anchors and keeping the cheaper plan is a future refinement; the packs and FP choice are already price-optimal for the chosen anchor.
- **Starved-day gate** — the top-up check only looks at `firstAccDay`, so it can still buy a pass there after the organic 40-checkpoint has already passed. Harmless on the current grid (all 108 plans funded, 0 warnings), worth tightening if a future calendar moves the phases.
- **Data** — `milestones: []` is a placeholder for "Aspirants awards no milestone tokens"; real rows would lower plan cost. Unused assets: `target/change_tech_tensai.png`, `target/lesley_deadeye_spectre.png` (pool size is 2); `banner.jpe` looks truncated but matches the `events.json` reference byte-for-byte, so it loads.
- **Ship** — not merged into `test`/`main` yet; the fix reaches production only after a merge (author email must stay `aa-jim <abdullahaljim2@gmail.com>` for the Vercel deploy gate).
