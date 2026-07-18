// lib/optimizer.js
// Part 5D — Recharge pack optimizer.
//
// EXACT LINE-FOR-LINE PORT (2026-07-18) of the user's verified Modified_0-1_Knapsack.cpp.
// Two previous JS versions (a 2D sweep+knapsack, then a restructured "3D-shaped" port)
// both had subtle DP bugs found via direct hand-verification against this C++ reference —
// the sweep version silently dropped day-tracking entirely, and the restructured version's
// separate "exact transition" + "overshoot-clamp transition" loops introduced a real
// suboptimality (confirmed: true DP minimum 22,694 vs the C++'s correct 22,559 for the
// same inputs). The C++ reference has NO separate overshoot loop — it fills a single
// container-sized table exactly as sized (w only ever 0..container), clamping the SOURCE
// index (`prev_w = max(0, w - weight)`) rather than the destination — which is a different
// (and, per hand-verification, CORRECT) mechanic from what the earlier JS ports built.
// This port follows the C++'s exact loop structure and indexing to avoid reintroducing that
// class of bug a third time.
//
// Weekly pass is folded into the SAME item list as everything else, exactly as the C++
// does (item_time=7 when weight===220 && !once), rather than handled by an outer sweep.
// This means the day dimension only ever fires for the pass item — matches the reference,
// and correctly generalizes to events with different durations (max_days is the DP's own
// day-axis size, sized to event.duration_days).
//
// FP packs are 0-1 (single use, gated by resources.fpClaimed), regular packs are unbounded.
//
// CONTAINER RULE (confirmed, TECH_SPEC.md): container = raw diamond need from
// calculator/scheduler output. Do NOT pre-subtract FP diamonds — the DP decides whether
// FP is worth using, based on whether resources.fpClaimed already marks it used.

const INF = 1e9; // matches the C++ reference's INF sentinel value exactly

/**
 * Build the combined item list exactly as the C++ reference does: all regular
 * packs first (unbounded, item_time=0), then the weekly pass (unbounded,
 * item_time=7 — the ONLY item with a nonzero time cost), then any available
 * FP packs (0-1, item_time=0).
 *
 * @param {object} packsData - full packs.json object
 * @param {object} fpClaimed - { fp_50, fp_150, fp_250, fp_500 } already-claimed map
 * @returns {Array<{id:string, weight:number, cost:number, once:boolean, itemTime:number, type:string}>}
 */
function buildItemList(packsData, fpClaimed = {}) {
  const items = [];

  for (const pack of packsData.regular ?? []) {
    items.push({ id: pack.id, weight: pack.total, cost: pack.bdt, once: false, itemTime: 0, type: "regular" });
  }

  const pass = packsData.weekly_pass;
  if (pass) {
    // Matches the C++'s def_weight=220 special-case exactly: weekly pass yields
    // 80 (instant) + 20*7 (drip) = 220 total dia, costs 200 BDT... but packs.json
    // prices the pass at 200 BDT flat (packsData.weekly_pass.bdt), and its total
    // diamond yield per purchase is dia_instant + dia_daily*days = 80+140=220,
    // matching the C++'s hardcoded weight=220/cost=200 exactly.
    const passWeight = pass.dia_instant + pass.dia_daily * pass.days;
    items.push({ id: "weekly_pass", weight: passWeight, cost: pass.bdt, once: false, itemTime: pass.days, type: "pass" });
  }

  for (const fp of packsData.first_purchase ?? []) {
    if (fpClaimed[fp.id]) continue; // already used — not buyable again
    items.push({ id: fp.id, weight: fp.total, cost: fp.bdt, once: true, itemTime: 0, type: "fp" });
  }

  return items;
}

/**
 * Core 3D DP, exact port of the C++ reference's main DP loop + backtracking.
 * t[i][w][d] = min BDT using items[0..i-1], reaching EXACTLY w diamonds
 * (capped: prev_w clamps to 0 on the SOURCE side, matching the reference —
 * this is not a ">=" knapsack with a destination clamp, it mirrors the
 * reference's own w-indexing exactly), within d days.
 *
 * @param {number} container - diamonds needed (table sized exactly to this, like the C++)
 * @param {number} maxDays - event.duration_days (table's day axis size)
 * @param {Array} items - from buildItemList()
 * @returns {{ minCost:number, bestDay:number, packsUsed:Array<{id,type,count,bdt,dia}> }}
 */
function knapsack3D(container, maxDays, items) {
  const n = items.length;

  if (container <= 0) {
    return { minCost: 0, bestDay: 0, packsUsed: [] };
  }

  // t[i][w][d] — flattened as nested arrays, exactly mirroring the C++'s
  // vector<vector<vector<int>>> t(n+1, vector<vector<int>>(container+1, vector<int>(max_days+1, INF)))
  const t = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    t[i] = new Array(container + 1);
    for (let w = 0; w <= container; w++) {
      t[i][w] = new Array(maxDays + 1).fill(INF);
    }
  }
  // t[i][0][d] = 0 for all i, d (base case: zero diamonds needed costs nothing, any day)
  for (let i = 0; i <= n; i++) {
    for (let d = 0; d <= maxDays; d++) {
      t[i][0][d] = 0;
    }
  }

  for (let i = 1; i <= n; i++) {
    const item = items[i - 1];
    const currentWeight = item.weight;
    const currentCost = item.cost;
    const once = item.once;
    const itemTime = item.itemTime;

    for (let w = 1; w <= container; w++) {
      for (let d = 0; d <= maxDays; d++) {
        // Default: do not pick the item.
        t[i][w][d] = t[i - 1][w][d];

        if (itemTime <= d) {
          const prevW = Math.max(0, w - currentWeight);

          if (once) {
            // 0-1: reads from row i-1 only (cannot pick itself again).
            if (t[i - 1][prevW][d - itemTime] !== INF) {
              const candidate = t[i - 1][prevW][d - itemTime] + currentCost;
              if (candidate < t[i][w][d]) t[i][w][d] = candidate;
            }
          } else {
            // Unbounded: reads from row i (can pick infinitely within this row).
            if (t[i][prevW][d - itemTime] !== INF) {
              const candidate = t[i][prevW][d - itemTime] + currentCost;
              if (candidate < t[i][w][d]) t[i][w][d] = candidate;
            }
          }
        }
      }
    }
  }

  let minCost = INF;
  let bestDayIndex = -1;
  for (let d = 0; d <= maxDays; d++) {
    if (t[n][container][d] < minCost) {
      minCost = t[n][container][d];
      bestDayIndex = d;
    }
  }

  if (minCost === INF) {
    return { minCost: null, bestDay: null, packsUsed: null, impossible: true };
  }

  // Backtracking — exact port of the C++ reference's while loop.
  let w = container;
  let d = bestDayIndex;
  const count = new Array(n).fill(0);
  let i = n;

  while (i > 0 && w > 0) {
    if (t[i][w][d] === t[i - 1][w][d]) {
      i--; // item was not picked
    } else {
      count[i - 1] += 1;
      w = Math.max(0, w - items[i - 1].weight);
      const thisItemTime = items[i - 1].itemTime;
      d -= thisItemTime;
      if (items[i - 1].once) {
        i--; // one-time item: force move to previous index
      }
    }
  }

  const packsUsed = [];
  for (let j = 0; j < n; j++) {
    if (count[j] > 0) {
      packsUsed.push({ id: items[j].id, type: items[j].type, count: count[j], bdt: items[j].cost, dia: items[j].weight });
    }
  }

  return { minCost, bestDay: bestDayIndex, packsUsed };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Main entry point: given a raw diamond container and the player's resources,
 * find the minimum-BDT combination of weekly passes + FP packs + regular packs
 * that reaches the container, and the day the plan completes by.
 *
 * NOTE on scale: the C++ reference's table is sized (items+1) x (container+1) x
 * (maxDays+1). For realistic MLBB numbers (container up to ~20,000 dia, ~45
 * items, ~45 days) this is on the order of 40M cells — fine for a compiled
 * C++ binary, but potentially slow as literal nested JS arrays in a browser.
 * If Part 7 profiling shows this is too slow client-side, the fix is to
 * collapse the day axis to only the values that matter (0, 7, 14, 21, ... —
 * i.e. only multiples of 7 plus 0, since itemTime is only ever 0 or 7) rather
 * than changing the algorithm itself. Flagging as a known follow-up, not
 * solved here since correctness came first.
 *
 * @param {number} containerDia - raw diamond need, NOT pre-subtracting FP
 * @param {object} packsData - full packs.json object
 * @param {number} eventDurationDays - used as the DP's max_days
 * @param {object} resources - { fpClaimed: { fp_50, fp_150, fp_250, fp_500 } }
 * @returns {{
 *   totalBdt:number, totalDia:number, completionDay:number,
 *   packsUsed:Array<{id,type,count,bdt,dia}>, impossible:boolean
 * }}
 */
export function optimizeRecharge(containerDia, packsData, eventDurationDays, resources = {}) {
  if (containerDia <= 0) {
    return { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
  }

  const items = buildItemList(packsData, resources.fpClaimed ?? {});
  const result = knapsack3D(containerDia, eventDurationDays, items);

  if (result.impossible) {
    return { totalBdt: null, totalDia: null, completionDay: null, packsUsed: null, impossible: true };
  }

  const totalDia = result.packsUsed.reduce((sum, p) => sum + p.count * p.dia, 0);

  return {
    totalBdt: result.minCost,
    totalDia,
    completionDay: result.bestDay,
    packsUsed: result.packsUsed,
    impossible: false,
  };
}