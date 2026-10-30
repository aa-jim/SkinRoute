# Mobile Legends: Bang Bang 11.11 Event Strategy & Execution Specification

## 1. Event Overview & Core Objectives

* **Target Prize:** Legend Tier Skin / Custom Event Tier Skin (e.g., Kagura / Layla Legend Skin).
* **Target Currency Threshold:** **1,600 Stardust Core Crests** (or equivalent event exchange tokens).
* **Event Window:** **November 6 to December 6** (31 Days total).
* **Baseline Assumptions:**
  * Initial Diamonds = `0`
  * Initial Owned Skins/Cosmetics = `0`
  * FP available = `0`
  * Goal = **Minimize real-money expenditure** while guaranteeing the target crest threshold through strict timing and stacked side-event conditions.

---

## 2. Core Operational Rules & Constraints

### Rule A: Draw Protocols

1. **Daily Discount 1X Draw (50% Off):**
   * Costs **50 Diamonds** (Standard single draw is 100 Diamonds).
   * **Mandatory Action:** Must be executed **once every day** for 31 days without fail.
2. **First 10X Draw Discount (50% Off):**
   * Costs **500 Diamonds** (Standard 10X draw is 1,000 Diamonds).
   * **Mandatory Action:** Must be executed on **November 13** (Phase 1 Premium Supply day) to satisfy the event spending milestone.
3. **Standard 10X Draw (1,000 Diamonds):**
   * Executed on **November 24** (Phase 2 Premium Supply day) to fulfill the 250-Diamond spending task while sweeping 10 draws.
4. **Promo Diamond Draws (Nov 14):**
   * Maximum Promo Diamond discount per draw = **80 Promo Diamonds**.
   * Cost per Promo Draw = **20 Blue Diamonds** + **80 Promo Diamonds**.
   * **Mandatory Action:** Execute **21 Promo Draws** on Nov 14 (spending 420 Blue Diamonds total).
5. **Full-Price Single Draws (100 Diamonds):**
   * **Strictly Prohibited** until the final day (**December 6**). Used exclusively as a precision tool to bridge remaining minor Crest gaps.

### Rule B: Recharge & Pass Protocols

1. **Weekly Diamond Pass (WDP) Priority:**
   * Purchasing 1 WDP counts as a **100-Diamond Recharge Task** towards side events.
   * Yields **80 Instant Diamonds** + **20 Daily Mail Diamonds** per active pass for 7 days.
   * On days with active WDP stack, `Diamond Add` incorporates the +20 daily mail collection.
2. **Side-Event Alignments:**
   * **Daily Recharge Rebate (Nov 6 – Nov 12):** Requires qualifying daily top-ups (min 100 Diamonds) to trigger milestone draw tokens on Days 1–3, Day 5, and Day 8.
   * **Mega Draw Micro-Tokens (Nov 6):** Purchase cheap 1X tokens for **10 Diamonds** and **49 Diamonds** on Day 1.
   * **Premium Supply Phases (Nov 13 & Nov 24):** Top up a minimum of **250–500 Diamonds** per phase to unlock **18 Draw Tokens** per phase (36 Tokens total).

---

## 3. Mathematical Yield & Crest Projections

* **Total Draws Planned:** **119 Draws**
* **Base Crest Yield Expectation:** Average of **~12.5 Crests per draw** (including raw drops and draw milestone bonuses at 15, 20, 30, 40, and 50 draws).
* **Expected Base Crests from 119 Draws:** $\approx 1,487.5\text{ Crests}$
* **Milestone Bonus Crests:** $+105\text{ Crests}$ (from cumulative draw milestone chests).
* **Total Base Expectation:** $\approx 1,592.5\text{ Crests}$.
* **Duplicate Conversion Factor:** Any duplicate skin pulled converts into bonus crests (Basic = 10, Elite = 20, Special = 50, Epic = 80). With owned items > 0, total crest yield cleanly exceeds the 1,600 target.

---

## 4. Day-by-Day Execution Matrix

| Date | Day | Recharge Action | Real Cost ($ / Local) | Dias Added | Description & Operations | Draws | Total Draws | Dias Spent | Dias Remaining |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **06-Nov** | 1 | 2x Weekly Pass | 400 | +180 | 1x Daily (50) + 1x Rebate Token + 2x Mega Draw Tokens (10+49) | 4 | 4 | 109 | 71 |
| **07-Nov** | 2 | 1x Weekly Pass | 200 | +100 | 1x Daily (50) + 1x Rebate Token + WDP Mail (+20) | 2 | 6 | 50 | 121 |
| **08-Nov** | 3 | 1x Weekly Pass | 200 | +100 | 1x Daily (50) + 1x Rebate Token + WDP Mail (+20) | 2 | 8 | 50 | 171 |
| **09-Nov** | 4 | 1x Weekly Pass | 200 | +100 | 1x Daily (50) + WDP Mail (+20) | 1 | 9 | 50 | 221 |
| **10-Nov** | 5 | 110 Diamond Pack | 210 | +130 | 1x Daily (50) + 1x Recharge Milestone Token + WDP Mail (+20) | 2 | 11 | 50 | 301 |
| **11-Nov** | 6 | 110 Diamond Pack | 210 | +130 | 1x Daily (50) + WDP Mail (+20) | 1 | 12 | 50 | 381 |
| **12-Nov** | 7 | 110 Diamond Pack | 210 | +130 | 1x Daily (50) + WDP Mail (+20) | 1 | 13 | 50 | 461 |
| **13-Nov** | 8 | 4x 275 Diamond Pack | 2000 | +1120 | **Premium Supply Phase 1:** 1x Daily (50) + 10x Draw (500) + 18x Supply Tokens + 2x Rebate Milestone Tokens | 31 | 44 | 550 | 1031 |
| **14-Nov** | 9 | 0 | 0 | +20 | **Promo Diamond Day:** 1x Daily (50) + 21x Promo Draws (420) + WDP Mail (+20) | 22 | 66 | 470 | 581 |
| **15-Nov** | 10 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 67 | 50 | 551 |
| **16-Nov** | 11 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 68 | 50 | 521 |
| **17-Nov** | 12 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 69 | 50 | 491 |
| **18-Nov** | 13 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 70 | 50 | 461 |
| **19-Nov** | 14 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 71 | 50 | 431 |
| **20-Nov** | 15 | 2x 275 Diamond Pack | 1000 | +570 | 1x Daily (50) + WDP Mail (+20) | 1 | 72 | 50 | 951 |
| **21-Nov** | 16 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 73 | 50 | 921 |
| **22-Nov** | 17 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 74 | 50 | 891 |
| **23-Nov** | 18 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 75 | 50 | 861 |
| **24-Nov** | 19 | 2x 275 Diamond Pack | 1000 | +570 | **Premium Supply Phase 2:** 1x Daily (50) + 10x Draw (1000) + 18x Supply Tokens | 29 | 104 | 1050 | 381 |
| **25-Nov** | 20 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 105 | 50 | 351 |
| **26-Nov** | 21 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 106 | 50 | 321 |
| **27-Nov** | 22 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 107 | 50 | 291 |
| **28-Nov** | 23 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 108 | 50 | 261 |
| **29-Nov** | 24 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 109 | 50 | 231 |
| **30-Nov** | 25 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 110 | 50 | 201 |
| **01-Dec** | 26 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 111 | 50 | 171 |
| **02-Dec** | 27 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 112 | 50 | 141 |
| **03-Dec** | 28 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 113 | 50 | 111 |
| **04-Dec** | 29 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 81 | 50 | 81 |
| **05-Dec** | 30 | 0 | 0 | +20 | 1x Daily (50) + WDP Mail (+20) | 1 | 115 | 50 | 51 |
| **06-Dec** | 31 | 275 + 2x 55 Pack | 514 | +300 | **Final Day Audit:** 1x Daily (50) + 3x Single Draws (300) to reach target | 4 | 119 | 350 | 1 |
| **TOTALS** | | | **6,144** | **+3,830** | | **119** | | **3,829** | |

---

## 5. Decision Trees for AI Programmatic Execution

When feeding variable inputs into this execution engine, evaluate the state at each key boundary date:

### Boundary 1: November 13 (Premium Supply Phase 1)

```
IF (Current_Crests >= 1600) THEN
    HALT_ALL_EXTRA_DRAWS()
    MAINTAIN_DAILY_50_PERCENT_ONLY()
ELSE
    EXECUTE_50_PERCENT_10X_DRAW(500_DIAMONDS)
    CLAIM_AND_FLUSH_TOKENS(18_TOKENS)
ENDIF
```

### Boundary 2: November 24 (Premium Supply Phase 2)

```
IF (Current_Crests >= 1600) THEN
    HALT_RECHARGES()
    MAINTAIN_DAILY_50_PERCENT_ONLY()
ELSE
    EXECUTE_10X_DRAW(1000_DIAMONDS)
    CLAIM_AND_FLUSH_TOKENS(18_TOKENS)
ENDIF
```

### Boundary 3: December 6 (Final Day Audit)

```
CALCULATE Gap = 1600 - Current_Crests

IF (Gap <= 0) THEN
    EXECUTE_1X_DAILY_DISCOUNT(50_DIAMONDS) // Finish
ELSE IF (Gap <= 30) THEN
    EXECUTE_SINGLE_DRAWS(Count = CEIL(Gap / 10))
ELSE
    EXECUTE_10X_DRAW(1000_DIAMONDS)
ENDIF
