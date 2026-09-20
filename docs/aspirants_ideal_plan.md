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

---

## Totals

| Metric | Value |
|--------|-------|
| **Total BDT** | **5,378** |
| **Total Passes** | **4** (3 on day 3, 1 on day 16) |
| **Total Dia Spent** | **3,255** |
| **Total Draws** | **60** |
| **Final Dia Left** | **3** |
| **Recharge Dia (passes + packs)** | **3,258** |

---

## Per-Tier Diamond Costs (for bingo summary cards)

| Tier | Target Draws | Dia Cost | BDT Cost | How Reached |
|------|--------------|----------|----------|-------------|
| **Lucky[0]** | 30 | ~1,260 | ~2,000 | Phase 1 + early Phase 2 (through day 10) |
| **Lucky[1]** | 40 | ~1,995 | ~3,150 | Through 1-Oct daily (before 10x) |
| **Realistic** | 50 | ~3,045 | ~5,030 | Through 1-Oct 10x |
| **Worst** | 60 | 3,255 | 5,378 | Full plan |

*Note: Each tier uses a FRESH optimal plan (independent pass search + pack optimization for that target).*

---

## Per-Tier BDT Costs (for bingo summary cards)

| Tier | Target Draws | BDT Cost | Composition |
|------|--------------|----------|-------------|
| **Lucky[0]** | 30 | ~2,000 | 3× pass (600) + partial r_257? |
| **Lucky[1]** | 40 | ~3,150 | 3× pass (600) + r_257 (470) + 1× pass (200) + partial 10x packs |
| **Realistic** | 50 | ~5,030 | 4× pass (800) + r_257 (470) + 10x packs (1880) + tail packs (2228) - pruned to 50 |
| **Worst** | 60 | 5,378 | Full plan |

---

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

### 4. Checkpoint Pass (Day 16 = firstAccDay)
- **firstAccDay = lastPhaseEnd + 1 = 14 + 1 = 15** (0-indexed → day 16 in 1-indexed)
- Dia at day 16: 22 (from drip) < 105 → needSingle = 83
- **Total-value comparison:**
  - Pass: 220 dia (80 + 7×20) for 200 BDT = **0.91 BDT/dia**
  - Packs for 83 dia: r_86 (86 dia, 165 BDT) = **1.92 BDT/dia**
- **Decision:** BUY PASS on day 16
- Pass gives: 80 instant + 100 recharge + 140 future drip (7 days)

### 5. 10x Funding (Day 16, after daily)
- After pass + daily: dia = 17 + 1050 needed = need 1033 more
- **OptimizeRecharge(1033) → r_55+r_275+r_706 = 1036 dia, 1880 BDT**

### 6. Tail Funding (Day 17 = tailDay)
- Remaining draws: 51→60 (9 draws = 7 dailies + 2 regular singles)
- Dia needed: 7×105 + 2×210 = 1155, but pass drip provides 140/day
- **OptimizeRecharge(tail_need) → r_5+r_257×2+r_706 = 1245 dia, 2228 BDT**

---

## Code Locations to Fix

### lib/planOrchestrator.js

| Area | Lines | Change |
|------|-------|--------|
| **Guard loop structure** | ~1195-1262 | Replace organic checkpoint chase with fixed irstAccDay evaluation; three-step funding (daily→40, 10x→50, tail→60) |
| **Starved check** | ~1209 | .day === firstAccDay && r.draws === 0 && r.diaLeft < aspirantsDailyCost |
| **Checkpoint pass decision** | ~1220-1245 | Total-value BDT/dia comparison (pass vs packs) using future drip; inject on irstAccDay |
| **10x funding** | ~1245-1250 | On irstAccDay AFTER re-sim with pass |
| **Tail funding** | ~1251-1256 | On 	ailDay = firstAccDay + 1 |
| **Bingo diamond costs** | ~1385-1396 | costs = [30, 40, 50, 60].map(costForTarget) with FRESH per-tier sims |

### lib/idealSchedule.aspirants.js

| Area | Lines | Status |
|------|-------|--------|
| **Tail singles cost** | 352 | Already cost1xFull (210) ✓ |
| **10x gate** | 256 | 	otalDraws >= 40 && totalDraws + 10 <= targetDraws ✓ |
| **Fresh per-tier sim** | 382 | uildAspirantsPlanWithPacks called with 	argetDraws ✓ |

---

## Verification Matrix

### Primary Target (0 dia, 0 passes, startDay 1, worst)

| Metric | Expected | Pass Criteria |
|--------|----------|---------------|
| Total BDT | 5,378 | Exact |
| Total Passes | 4 (3+1) | Exact |
| Total Draws | 60 | Exact |
| Final Dia Left | 3 | Exact |
| 40-draw day | Day 16 (1-Oct) | Exact |
| 50-draw day | Day 16 (1-Oct) | Exact |
| 60-draw day | Day 23 (8-Oct) | Exact |
| 1-Oct actions | pass + daily + 10x | Exact sequence |
| 2-Oct actions | tail packs + daily | Exact |

### Per-Tier Costs

| Tier | Dia Cost | BDT Cost | Monotonic |
|------|----------|----------|-----------|
| Lucky[0] (30) | < Lucky[1] | < Lucky[1] | ✓ |
| Lucky[1] (40) | < Realistic | < Realistic | ✓ |
| Realistic (50) | < Worst | < Worst | ✓ |
| Worst (60) | 3,255 | 5,378 | ✓ |

### Regression Grid (from AGENTS.md)

| StartDay | Dia | Passes | Expected BDT | Notes |
|----------|-----|--------|--------------|-------|
| 1 | 0 | 0 | 5,378 | Primary |
| 1 | 1000 | 0 | ~4,200 | |
| 1 | 2000 | 0 | ~2,800 | |
| 1 | 2025 | 0 | 1,070 | Drop logic: 3 passes day 3 |
| 1 | 4000 | 0 | 1,070 | |
| 10 | 0 | 0 | Dynamic | Collapses to final days |
| 17 | 0 | 0 | Dynamic | |
| 21 | 0 | 0 | Dynamic | Short window |

### Non-Regression (other event types)

| Event | Scenario | Should Be Unchanged |
|-------|----------|---------------------|
| JJK | 0 dia, Day 1 | 1540 BDT |
| SF | 0 dia, Day 1 | 1540 BDT |
| Collector | Various | Existing behavior |
| Sanrio (bingo) | 0 dia, Day 1 | Per-tier costs monotonic |

---

## Implementation Order

1. **Fix guard loop** (planOrchestrator.js:1195-1262) — core logic
2. **Fix starved check** (planOrchestrator.js:1209) — single line
3. **Fix bingo diamond costs** (planOrchestrator.js:1385-1396) — ensure fresh per-tier
4. **Build + lint** → verify
5. **Test 0-dia/Day-1** via UI → match sheet exactly
6. **Run regression grid** → confirm no regressions

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| irstAccDay wrong for mid-event starts | Existing formula handles: Math.min(Math.max(startDay, lastPhaseEnd+1), duration) |
| Pass queue math on irstAccDay | Uses existing queueBefore/startDrip sequential logic |
| Fresh per-tier sims may differ from actual plan | Acceptable — tiers are independent optimal plans; actual plan uses fixed pack placement |
| State leakage in guard loop re-sims | Each iteration uses updated extraDiaByDay/echargeDiaByDay maps |

---

## Future Reference

This document defines the **canonical ideal plan** for Aspirants 2026. Any planner changes must preserve:
1. Exact schedule above for 0-dia/Day-1
2. Monotonic per-tier costs (30 ≤ 40 ≤ 50 ≤ 60)
3. Dynamic adaptation for other startDay/dia/pass inputs
4. No regressions in JJK/SF/Collector/Sanrio

When in doubt, compare planner output against the table in Section 2.
