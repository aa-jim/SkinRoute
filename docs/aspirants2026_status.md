# Aspirants 2026 — Status for New Session (Sep 2026)

> Branch: `aspirants2026` (off `test` at 1c25112). `test` is live/clean. This doc describes current behavior and open bugs only — no fixes proposed.

## 1. Event config
- `data/events.json:aspirants_2026` — bingo (box, 2 skins), duration 23 (Sep 16–Oct 8 2026), `draw_cost_1x 210`, `discount daily_1x 105`, `first_time_10x 1050`, phases P1 day3-7 / P2 day10-14, thresholds `recharge_250` + `spend_100/250`.
- Packs: `data/packs.json` (r_* regular, fp_* first-purchase). Weekly pass 200 BDT (80 instant +20/day×7 sequential, recharge_task_value 100).
- Ideal reference: `docs/aspirants_ideal_plan.md` — 0 dia / startDay1 / worst / 60 draws → total **BDT 5,378**, 4 passes, 60 draws, 3 dia left. Key staged days: **Oct1 (day16) = 40→50** (`r_55+r_275+r_706 =1036 dia` for 10x), **Oct2 (day17) = 51→60** (`r_5+r_257×2+r_706 =1225 dia` for tail).
- Knapsack: `lib/optimizer.js` is exact port of `Modified_0-1_Knapsack.cpp`. Container = required dia. FP already-claimed or rechargeMode changes weight.

## 2. What the current versions show

### Live `test` (current production, no aspirants2026 fixes)
- **Schedule (0 dia / startDay1 / worst):**
  - 10/1: `Buy 1× weekly pass` + `1x daily` (1 draw → cum 40, spend 105). Then `Buy 4× 275 dias pack (2000 BDT)` + `1x 10-draw` (10 draws → cum 50, spend 1050).
  - 10/2: `Buy 86 + 257 + 565 (165+470+1020 BDT)` + `1x daily` (1 draw → cum 51, spend 105).
- **Recharge summary:** 4× pass (880 dia, 800 BDT) + packs: `257×2=514 dia 940`, `275×4=1100 2000`, `86=86 165`, `565=565 1020` → **Total 3,145 dia / 4,925 BDT**. Plan completes day23.
- **Symptom:** Under-recharging — total 4,925 < ideal 5,378 (-453), tail day only 908 dia vs 1225 ideal. Tail curation is short; final push relies on insufficient balance.

### `aspirants2026` branch (current HEAD 7ccf3f0 + unstaged edit in `lib/planOrchestrator.js`)
- Earlier attempt over-recharged (tail `2×565` + extra `r_11`), then this iteration flipped to under-recharge (tail only 86+257+565). 10x stays `4×275` (same as live) rather than ideal `55+275+706`.
- The `aspirants2026` guard loop (see §3) is attempting staged funding on `firstAccDay`/`tailDay` but container values fed to `optimizeRecharge` are still wrong, so pack combos are wrong despite builds passing (`next build` 16s, `next lint` only 3 img warnings).

## 3. Bugs that need fixing

> **RESOLVED (Sep 21 2026, refined Sep 22 and Sep 24):** All four bugs in §3 are fixed. See the "Aspirants: converge-on-checkpoint pacing + pass-structure guard" and "Aspirants: no-gap ladder into the checkpoint" entries in `AGENTS.md` and the `docs/architecture.md` simulator line. The staged-funding guard loop, simulator accumulation mode, and pack selection now produce the target shape for all day-1 plans:
>- 40 exactly on day 14 (Sep 29, phase 2's closing day) with the 10x same-day → 50 (sub-row); 51 on day 15 (Sep 30); 60 exactly on day 23 (Oct 8, no idle tail). The ladder draws every day from the 30-draw tier on — 39 on Sep 28 → 40 + 10x on Sep 29 — so there is no gap in front of the checkpoint.
>- The 0-dia day-1 plan is byte-hash pinned (`772ce2f03ad12bcf`) and paced by the calendar: ৳3,415, checkpoint on day 14 (Sep 29) with the same-day 10x, no idle days, final push 1 single (was ৳3,700 / d16 / 4 singles; the ৳3,415 release had moved the checkpoint d16 → d15, the token-guard scoping then d15 → d14).
>- Rich day-1 plans (dia ≥ 2000) follow the calendar, not the balance: the token-guarded hold skips surplus accumulation draws only while future phase tokens are pending (plateau at cum 19 through 9/24), so 39 lands on 9/28 → 40 + same-day 10x on 9/29 → 60 on 10/8, with no stockpile draw and no gap after the 30-draw tier.
>- Pass selection matches the ideal pack combos: day-1 0-dia → 4 passes + `r_257 + fp_* + smalls`, BDT 3,415; dia 2,000 → ৳1,236, dia 2,025 → ৳1,175 (3× phase-start passes + r_257 + a small top-up on the 10x day). Mid-phase starts get the same drop-candidate search (startDay-5 2,000-dia: 3 passes, ৳1,304) and a tier-pacing guard rejects any pass structure that slips the checkpoint.
>- `verify:aspirants`: **PASS 144 aspirants plans** (60 draws, 0 warnings, funded, tiers monotonic) + 6 byte-identical non-aspirants. `next lint` (3 pre-existing `<img>` warnings) + `next build` pass.

### 3.1 Pack selection (symptoms)
- **10x day (Oct1):** planner picks `r_275×4 (1100 dia)`; ideal via knapsack for container 1033 is `r_55+r_275+r_706 (1036 dia, 1880 BDT)`. Container mismatch.
- **Tail day (Oct2):** planner picks `r_86+r_257+r_565 (908 dia)`; ideal for container ~1225 is `r_5+r_257×2+r_706 (1225 dia, 2228 BDT)` (or `r_275×2+r_5+r_706=1261` depending on exact container). Under by ~300 dia.
- **Total BDT low:** 4,925 vs 5,378.

### 3.2 Staged-funding guard loop (`lib/planOrchestrator.js:1180-1249`)
- `firstAccDay = Math.min(Math.max(startDay, lastPhaseEnd+2), duration)` — currently 16 for startDay1 (phaseEnd 14). Last version of this branch used `+1` vs `+2`; inconsistency.
- Starved check: `sim.rows.find(r.day===firstAccDay && draws===0 && diaLeft<dailyCost)` — only fires when day is starved; subsequent 10x branch skipped via `didStarved` on same iteration, so timing of daily vs 10x on same day is off by one guard iteration.
- 10x need: `needTenx = aspirantsTenxCost + aspirantsDailyCost - diaAtCheckpoint` (current aspirants2026 edit) — diaAtCheckpoint is `row.diaLeft` (post-draws). Whether to add daily depends on whether that row already spent a daily; current code always adds, double-counting when daily already spent, under-counting when it didn't. Live code uses `aspirantsTenxCost - diaAtCheckpoint`.
- Tail need: `needTail = shortfall - remainingDays*(cost1xFull - dailyCost)` (current: `shortfall - 7*105 = shortfall-735`) — assumes every remaining day converts 210→105, which is false (only up to remaining draws, and drip còn). Live code uses raw `shortfall`.
- Capping: `cappedNeed = Math.min(needTenx, shortfall)` — shortfall is the whole-event deficit after final push (mixes 40→50 and 51→60), so it caps the staged container incorrectly.
- Re-sim frequency: loop up to 8 iters but each iter only funds one stage (starved OR 10x OR tail). When both 10x and tail needed, they land on successive iters, but `finalCheckpointDay/finalTenxDay/finalTailDay` are set each iter, so UI staging vars drift.

### 3.3 Simulator (`lib/idealSchedule.aspirants.js`)
- Accumulation mode fires `1x daily` else `1x 10-draw`; the 10x gate is `totalDraws>=40 && totalDraws+10 <= targetDraws && tenxWindowOpen` — window is `day>lastPhaseEnd || (isLastPhase && phaseSpendTasksDone)`. On day16 when firstAccDay is 16, the day is just after phase, so accumulation true, but the exact ordering of `phaseSpendTasksDone` vs `accumulationMode` matters for whether 10x can fire on the same day as a daily (sim does `useTenx` else `daily` plus opportunistic 10x after daily).
- Final push in `buildAspirantsPlanWithPacks:334-378` does staged push on the **last row** (day23) only: singles→40, 10x→50, singles→60, all at `cost1xFull (210)` except 10x at 1050. The guard loop’s staged injection on days 16/17 conflicts: dia injected early still leaves the last-row push to account for, so `unaffordableDiaShortfall = -dia` after that push is not the correct container for staged days — it’s the total deficit if nothing was injected early.

### 3.4 Pass / pack interaction
- `optimizeRecharge` FP handling: when `fpClaimed` is `{}` the optimizer will happily pick `fp_500` (1065 dia for 1020 BDT) over regular combos, but the aspirants plan expects FP to be already claimed or in rechargeMode (weight = dia_base). The guard loop passes `fpClaimed = t.fp` from `usedFpClaimed`, which may be empty before phase packs are injected, so the container choice flips between FP and regular incorrectly between iterations.
- `remainingPhaseStarts` vs `phaseStarts` confusion in `distributePassPurchases` — aspirants2026 has a `dropFirstPass` path that changes purchase days; that changes `passDailyDia`/`passRechargeByDay` used by the sim, altering `diaLeft` and checkpoint timing.

### 3.5 Data / docs drift
- `aspirants_ideal_plan.md` documents `firstAccDay = lastPhaseEnd+1 =15` but code uses `+2 =16`. Off-by-one needs to be settled against the ideal table (Oct1 is day16, so `+2` matches ideal if lastPhaseEnd=14).
- The ideal table shows P2 packs `r_257 (470 BDT, 277 dia)` on day10, but live plan’s packs are `4×275` on Oct1; the two are not comparable — ideal distributes packs to meet recharge thresholds on phase days, live lumps them on the 10x day.

## 4. How to verify (for new session)
- UI: 0 dia / startDay1 / worst (60 draws) — check Recommended Recharge table and Schedule rows Oct1/Oct2.
- Ideal target: Oct1 `1×pass + daily (40) + 10x (50) with r_55+r_275+r_706`; Oct2 `r_5+r_257×2+r_706 + daily (51)`; total ~5,378.
- Live currently shows Oct1 `4×275`, Oct2 `86+257+565`, total 4,925.
- `npm run build` / `npm run lint` pass even with bug — not a regression signal.
- Branch to continue: `aspirants2026`. Test which should stay clean is `test`.

## 5. Open questions for next fix
- Where to inject staged dia: `firstAccDay` vs organic 40-checkpoint vs fixed 16/17? Ideal says 16 and 17.
- Container for each stage: should be derived from sim state (diaLeft, draws, target) or from final shortfall split? Current shortfall is whole-event, not per-stage.
- FP availability at the moment each stage is planned (affects which packs the knapsack will pick for the same container).
- Whether to keep the `didStarved` gate or let the 10x day fund both daily and 10x in one go (like ideal does on Oct1: 1x daily + 10x).
