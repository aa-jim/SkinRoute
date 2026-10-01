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
 * Recharge-credit value of a purchased item: the diamonds the GAME counts
 * toward recharge *tasks* (premium-supply windows, surprise tasks).
 *
 * This is deliberately NOT the wallet yield. MLBB sells packs as "234+23
 * Diamonds": the first number is what counts toward the recharge progress bar,
 * the "+n" is a bonus that lands in the wallet but is not credited to the task.
 * A 257-dias pack is therefore worth 234 recharge, not 257. The weekly pass has
 * the same split — 220 dia in the wallet, but only its `recharge_task_value`
 * (100) counts toward tasks. First-purchase packs likewise count `dia_base`.
 *
 * Every caller that builds a recharge-task container must size it with this, and
 * the balance the player ends up with must use `total`/realDia instead.
 */
function rechargeValueOf(item) {
  if (item.rechargeDia != null) return item.rechargeDia;
  if (item.type === "pass") {
    const pass = item.passDef;
    return pass?.recharge_task_value ?? pass?.dia_instant ?? item.realDia;
  }
  if (item.type === "fp") return item.packDef?.dia_base ?? item.realDia;
  return item.packDef?.dia_base ?? item.realDia;
}

/**
 * Build the combined item list exactly as the C++ reference does: all regular
 * packs first (unbounded, item_time=0), then the weekly pass (unbounded,
 * item_time=7 — the ONLY item with a nonzero time cost), then any available
 * FP packs (0-1, item_time=0).
 *
 * @param {object} packsData - full packs.json object
 * @param {object} fpClaimed - { fp_50, fp_150, fp_250, fp_500 } already-claimed map
 * @param {boolean} rechargeMode - when true, each item's DP weight is its
 *   recharge-credit value (base only, bonus/extra excluded — see rechargeValueOf),
 *   because the container is a recharge-TASK threshold. When false the weight is
 *   the full wallet yield, because the container is a diamond balance gap.
 * @param {number} [passDiaValue] - real in-window wallet yield of ONE weekly pass
 *   for the caller's purchase pipeline. Passes drip sequentially, so late passes
 *   often yield only their 80 instant; passing the true value stops the DP from
 *   valuing them at a flat 220. Omitted => flat 220 (legacy behaviour).
 * @returns {Array<{id:string, weight:number, realDia:number, rechargeDia:number, cost:number, once:boolean, itemTime:number, type:string}>}
 */
function buildItemList(packsData, fpClaimed = {}, rechargeMode = false, passDiaValue = undefined) {
  const items = [];

  for (const pack of packsData.regular ?? []) {
    const item = { id: pack.id, weight: pack.total, realDia: pack.total, cost: pack.bdt, once: false, itemTime: 0, type: "regular", packDef: pack };
    item.rechargeDia = rechargeValueOf(item);
    if (rechargeMode) item.weight = item.rechargeDia;
    items.push(item);
  }

  const pass = packsData.weekly_pass;
  if (pass) {
    // The C++ reference hardcodes weight=220/cost=200 for the weekly pass: 80
    // instant + 20*7 drip. That is the yield of a pass bought EARLY with an empty
    // drip queue.
    //
    // Passes are SEQUENTIAL — each waits for the previous to finish its 7-day drip
    // — and any drip that would fall past the event's final day is never received.
    // So on a long event the tail passes are worth only their 80 instant: 6 passes
    // on a 31-day event really yield 1,100 dia, not 6x220 = 1,320. Valuing every
    // pass at 220 makes the marginal pass look like 1.1 dia/BDT when it is really
    // 80/200 = 0.4 — worse than any regular pack (~0.55) — so the knapsack
    // over-buys passes and over-fills its containers.
    //
    // `passDiaValue` is the caller's real in-window yield per pass for the
    // purchase schedule that will actually be used (passPurchasesTotalDia).
    // Undefined keeps the historical flat 220 (callers that model no pipeline).
    //
    // Recharge mode is unaffected: its weight is `recharge_task_value` (100),
    // credited on the purchase day regardless of whether the drip lands
    // in-window.
    const passYield = pass.dia_instant + pass.dia_daily * pass.days;
    const passWallet = typeof passDiaValue === "number" && passDiaValue > 0 ? passDiaValue : passYield;
    const item = { id: "weekly_pass", weight: passWallet, realDia: passWallet, cost: pass.bdt, once: false, itemTime: pass.days, type: "pass", passDef: pass };
    item.rechargeDia = rechargeValueOf(item);
    if (rechargeMode) item.weight = item.rechargeDia;
    items.push(item);
  }

  for (const fp of packsData.first_purchase ?? []) {
    if (fpClaimed[fp.id]) continue; // already used — not buyable again
    const item = { id: fp.id, weight: fp.total, realDia: fp.total, cost: fp.bdt, once: true, itemTime: 0, type: "fp", packDef: fp };
    item.rechargeDia = rechargeValueOf(item);
    if (rechargeMode) item.weight = item.rechargeDia;
    items.push(item);
  }

  // packDef/passDef are data lookups only — never used by the DP or by
  // packsUsed, so drop them before the item list escapes this function.
  for (const item of items) {
    delete item.packDef;
    delete item.passDef;
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
      // `dia` is the WALLET yield (what the player actually receives and what
      // the totals/UI show). `rechargeDia` is the smaller RECHASE-TASK credit —
      // base only, bonus excluded. They differ for every pack with a bonus and
      // for the pass; callers building a recharge container must use the latter.
      packsUsed.push({ id: items[j].id, type: items[j].type, count: count[j], bdt: items[j].cost, dia: items[j].realDia, rechargeDia: items[j].rechargeDia });
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
export function optimizeRecharge(containerDia, packsData, eventDurationDays, resources = {}, rechargeMode = false, passDiaValue = undefined) {
  if (containerDia <= 0) {
    return { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
  }

  const items = buildItemList(packsData, resources.fpClaimed ?? {}, rechargeMode, passDiaValue);
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