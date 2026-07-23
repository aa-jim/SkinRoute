// lib/idealSchedule.collector.js
// Collector event-type "ideal draw environment" schedule generator.
// Replaces planOrchestrator.js's buildCollectorDaySchedule(). Rewritten from scratch
// (2026-07-21) after the previous simulation-based approach accumulated unfixable bugs —
// this version is verified line-by-line against a hand-worked 0-resource reference plan
// (collector approach.txt) before being wired in. See BUILD_PLAN.md for the verification log.
//
// Bulk-trigger rule (CONFIRMED by user): the highest spend-task tier's bulk draw (first-time
// 10x, or full 10x if first-10x already used) fires on the LATEST day where daily-1x alone
// could still theoretically close the remaining gap by window close, i.e.:
//   trigger_day = ceil((tier_threshold - bulk_cost) / daily_1x_cost), clamped to [1, window_end]
// Only evaluated against the HIGHEST unclaimed spend tier — lower tiers are swept up
// automatically as cumulative diamond spend crosses them naturally via daily 1x.
//
// All numeric event rules (draw costs, spend tiers, milestones, pass/CoA values) are read
// from `event` and `packsData` — nothing is hardcoded to Exquisite Collection specifically,
// so this generalizes to any future Collector-type event with the same rule shape. If a
// future event's rules genuinely differ in structure (not just numbers), this will need
// re-verification against that event's own reference plan.

/**
 * @param {object} event - must be type "collector", needs draw_cost_1x, discount_draw_cost
 *   {daily_1x, first_time_10x}, draw_cost_10x, premium_supply[0] (single window), milestones
 * @param {object} packsData - packs.json, needs weekly_pass {dia_instant, dia_daily, days, coa_box_daily}
 * @param {object} resources - { startingDia, startingCoa, passCount }
 * @returns {{rows, totalDraws, finalDia, finalCoa, cumDiaSpentOnEvent}}
 */
function simulateCollectorFixedShape(event, packsData, resources = {}) {
  const { startingDia = 0, startingCoa = 0, passCount = 0 } = resources;
  const duration = event.duration_days;
  const dailyCost = event.discount_draw_cost?.daily_1x;
  const firstTenxCost = event.discount_draw_cost?.first_time_10x;
  const cost10x = event.draw_cost_10x;
  const cost1xFull = event.draw_cost_1x;
  if (!duration || !dailyCost || !firstTenxCost || !cost10x || !cost1xFull) {
    throw new Error(`simulateCollectorFixedShape: event "${event.id}" missing required draw-cost fields`);
  }

  const supply = event.premium_supply;
  if (!Array.isArray(supply) || supply.length === 0) {
    throw new Error(`simulateCollectorFixedShape: event "${event.id}" missing premium_supply`);
  }
  const phase = supply[0]; // Collector confirmed single-window structure (Exquisite: Day1-7)
  const windowEnd = (phase.start_day ?? 1) + (phase.duration_days ?? 7) - 1;

  const tasks = phase.tasks ?? [];
  const spendTasks = tasks
    .filter((t) => t.type?.startsWith("spend_"))
    .map((t) => ({ threshold: t.threshold_dia, keys: t.tokens ?? 0 }))
    .sort((a, b) => a.threshold - b.threshold);
  const loginTask = tasks.find((t) => t.type === "login");
  const loginKeys = loginTask?.tokens ?? 0;
  const starlightTask = tasks.find((t) => t.type === "starlight_activate");
  const starlightKeys = starlightTask?.tokens ?? 0;
  if (spendTasks.length === 0) {
    throw new Error(`simulateCollectorFixedShape: event "${event.id}" premium_supply has no spend_* tasks`);
  }
  const highestTier = spendTasks[spendTasks.length - 1];

  const milestones = (Array.isArray(event.milestones) ? event.milestones : [])
    .filter((m) => m.reward_type === "token")
    .map((m) => ({ draws: m.draws, amount: m.tokens ?? 0 }))
    .sort((a, b) => a.draws - b.draws);

  const pass = packsData?.weekly_pass;
  if (!pass) throw new Error("simulateCollectorFixedShape: packs.json missing weekly_pass");
  const STARLIGHT_THRESHOLD = 300; // fixed game rule, not event-configurable

  const rows = [];
  let dia = startingDia;
  let coa = startingCoa;
  let totalDraws = 0;
  let cumDiaSpentOnEvent = 0;
  let starlightBought = false;
  let firstTenxUsed = false;
  let loginKeyClaimed = false;
  const spendTasksClaimed = new Set();
  const milestonesClaimed = new Set();
  let diamondPhaseActive = true;
  let minDiaBalance = startingDia; // tracks lowest point diamonds ever reach — Day-1 recharge signal

  const passDailyDia = {};
  const passDailyCoa = {};
  let queueCursor = 1;
  for (let p = 0; p < passCount; p++) {
    const dripStart = Math.max(queueCursor, 1);
    for (let d = 0; d < pass.days; d++) {
      const day = dripStart + d;
      if (day > duration) break;
      passDailyDia[day] = (passDailyDia[day] ?? 0) + pass.dia_daily;
      passDailyCoa[day] = (passDailyCoa[day] ?? 0) + (pass.coa_box_daily ?? 0);
    }
    queueCursor = dripStart + pass.days;
  }
  if (passCount > 0) dia += pass.dia_instant * passCount;

  function claimKeys(n, label, row) {
    if (n <= 0) return;
    row.notes.push(`Claim ${n} key${n > 1 ? "s" : ""} (${label}) \u2192 ${n} free draw${n > 1 ? "s" : ""}`);
    row.draws += n;
    totalDraws += n;
  }

  function bulkTriggerDay(targetTier, bulkCost) {
    const day = Math.ceil((targetTier - bulkCost) / dailyCost);
    return Math.max(1, Math.min(windowEnd, day));
  }

  for (let day = 1; day <= duration; day++) {
    dia += passDailyDia[day] ?? 0;
    coa += passDailyCoa[day] ?? 0;
    const row = { day, draws: 0, diaSpent: 0, coaSpent: 0, notes: [] };
    rows.push(row);
    let transitionedToday = false;

    if (diamondPhaseActive && day <= windowEnd) {
      let dayDiaSpend = 0;
      let dayDraws = 0;

      // Daily 1x ALWAYS happens in the diamond window (the plan always assumes this is
      // funded via recharge if needed — never silently skipped). Balance may go negative;
      // the most-negative point reached is reported as the required Day-1 recharge.
      dayDiaSpend += dailyCost;
      dayDraws += 1;
      row.notes.push("1x daily (dia)");

      if (!spendTasksClaimed.has(highestTier.threshold)) {
        const projectedCum = cumDiaSpentOnEvent + dayDiaSpend;
        if (projectedCum < highestTier.threshold) {
          const bulkCost = firstTenxUsed ? cost10x : firstTenxCost;
          if (bulkCost < highestTier.threshold) {
            const triggerDay = bulkTriggerDay(highestTier.threshold, bulkCost);
            if (day >= triggerDay) {
              dayDiaSpend += bulkCost;
              dayDraws += 10;
              row.notes.push(firstTenxUsed ? "10x draw (dia)" : "10x draw (dia, first-time discount)");
              if (!firstTenxUsed) firstTenxUsed = true;
            }
          }
        }
      }

      dia -= dayDiaSpend;
      cumDiaSpentOnEvent += dayDiaSpend;
      row.diaSpent += dayDiaSpend;
      row.draws += dayDraws;
      totalDraws += dayDraws;
      if (dia < minDiaBalance) minDiaBalance = dia;

      if (!starlightBought && dia >= STARLIGHT_THRESHOLD) {
        starlightBought = true;
        coa += 300;
        row.notes.push("Buy Starlight (+300 CoA, +2 keys)");
        claimKeys(starlightKeys, "Starlight", row);
      }
      if (!loginKeyClaimed) {
        loginKeyClaimed = true;
        claimKeys(loginKeys, "login task", row);
      }
      for (const t of spendTasks) {
        if (!spendTasksClaimed.has(t.threshold) && cumDiaSpentOnEvent >= t.threshold) {
          spendTasksClaimed.add(t.threshold);
          claimKeys(t.keys, `spend_${t.threshold} task`, row);
        }
      }
      if (spendTasksClaimed.size === spendTasks.length) {
        diamondPhaseActive = false;
        transitionedToday = true;
        row.notes.push("Diamond spend window closes \u2192 switch to CoA-only from tomorrow");
      }
    } else if (diamondPhaseActive && day > windowEnd) {
      diamondPhaseActive = false;
      transitionedToday = true;
    }

    if (!diamondPhaseActive && !transitionedToday) {
      if (coa >= dailyCost) {
        coa -= dailyCost;
        row.coaSpent += dailyCost;
        row.draws += 1;
        row.notes.push("1x daily (CoA)");
        totalDraws += 1;
      } else if (dia >= dailyCost) {
        dia -= dailyCost;
        row.diaSpent += dailyCost;
        row.draws += 1;
        row.notes.push("1x daily (dia, CoA insufficient)");
        totalDraws += 1;
      } else {
        row.notes.push("No draw (insufficient balance)");
      }
    }

    for (const m of milestones) {
      if (m.draws === highestMilestoneDraws(milestones)) continue; // handled separately (additive, final-day)
      if (!milestonesClaimed.has(m.draws) && totalDraws >= m.draws) {
        milestonesClaimed.add(m.draws);
        claimKeys(m.amount, `milestone @ ${m.draws} draws`, row);
      }
    }
    if (row.notes.length === 0) row.notes.push("No draw (insufficient balance)");
  }

  return { rows, totalDraws, finalDia: dia, finalCoa: coa, cumDiaSpentOnEvent, milestones, milestonesClaimed, minDiaBalance };

  function highestMilestoneDraws(ms) {
    // Only the HIGHEST token milestone is treated as "final-day additive" (per confirmed
    // rule: milestone draws never substitute paid draws). Lower milestones (20/40 in
    // Exquisite) fire naturally mid-schedule as before, since they're always reached well
    // before the final push and behave identically either way.
    return ms.length > 0 ? ms[ms.length - 1].draws : null;
  }
}

/**
 * Full Collector plan: fixed-shape simulation + final-day flex to close the gap to
 * targetDraws (from calculator.js's drawsNeeded()). The highest token milestone (e.g.
 * Exquisite's draw-90 -> 5 keys) is treated as ADDITIVE — claimed on top of whatever
 * paid draws were needed to reach targetDraws, never substituted in to reduce the paid
 * count (confirmed rule).
 *
 * @param {object} event
 * @param {object} packsData
 * @param {number} targetDraws - from calculator.js drawsNeeded().draws
 * @param {object} resources - { startingDia, startingCoa, passCount }
 * @returns {{rows, totalDraws, targetDraws, finalDia, finalCoa, unaffordableDiaShortfall}}
 */
function buildCollectorPlan(event, packsData, targetDraws, resources = {}) {
  const sim = simulateCollectorFixedShape(event, packsData, resources);
  const cost1xFull = event.draw_cost_1x;
  const cost10x = event.draw_cost_10x;

  const finalRow = sim.rows[sim.rows.length - 1];
  let dia = sim.finalDia;
  let unaffordableDiaShortfall = 0;
  let totalDraws = sim.totalDraws;

  const highestMilestone = sim.milestones.length > 0 ? sim.milestones[sim.milestones.length - 1] : null;
  let milestoneClaimed = highestMilestone ? sim.milestonesClaimed.has(highestMilestone.draws) : true;

  if (highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
    finalRow.notes.push(`Claim ${highestMilestone.amount} keys (milestone @ ${highestMilestone.draws} draws) \u2192 ${highestMilestone.amount} free draws`);
    finalRow.draws += highestMilestone.amount;
    totalDraws += highestMilestone.amount;
    milestoneClaimed = true;
  }

  // Paid flex only pays for draws that MUST be paid — if reaching the (still-unclaimed)
  // milestone threshold would already close the gap to targetDraws once its free draws are
  // added, size the paid flex to stop at the milestone threshold instead of the full target
  // (never pay for draws that free milestone draws would cover). CONFIRMED rule. Only
  // relevant when there's an actual gap (targetDraws > totalDraws already) — if the fixed
  // shape's natural total already meets/exceeds target, no paid flex is needed at all.
  let payTarget = targetDraws;
  if (targetDraws > totalDraws && highestMilestone && !milestoneClaimed && highestMilestone.draws > totalDraws) {
    const wouldCoverTarget = highestMilestone.draws + highestMilestone.amount >= targetDraws;
    if (wouldCoverTarget) payTarget = highestMilestone.draws;
  }

  const remaining = Math.max(0, payTarget - totalDraws);

  if (remaining > 0) {
    const tenxBatches = Math.floor(remaining / 10);
    const singles = remaining - tenxBatches * 10;
    const cost = tenxBatches * cost10x + singles * cost1xFull;
    dia -= cost;
    if (dia < 0) {
      unaffordableDiaShortfall = -dia;
      dia = 0;
    }
    finalRow.notes.push(
      `Final push: ${tenxBatches > 0 ? `${tenxBatches}x 10x draw(s) + ` : ""}${singles} single(s) (dia) \u2192 ${remaining} draws`
    );
    finalRow.draws += remaining;
    finalRow.diaSpent += cost;
    totalDraws += remaining;
  }

  if (highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
    finalRow.notes.push(`Claim ${highestMilestone.amount} keys (milestone @ ${highestMilestone.draws} draws, reached during final push) \u2192 ${highestMilestone.amount} free draws`);
    finalRow.draws += highestMilestone.amount;
    totalDraws += highestMilestone.amount;
    milestoneClaimed = true;
  }

  // Day-1 recharge requirement: if the diamond window ever went negative, that's the
  // amount of extra diamonds needed UP FRONT (Day 1) to fund the spend-window/Starlight
  // plan as-is — same principle as the final-day shortfall, just earlier in the schedule.
  const day1RechargeNeeded = sim.minDiaBalance < 0 ? -sim.minDiaBalance : 0;

  return {
    rows: sim.rows,
    totalDraws,
    targetDraws,
    finalDia: dia,
    finalCoa: sim.finalCoa,
    unaffordableDiaShortfall,
    day1RechargeNeeded,
  };
}

module.exports = { simulateCollectorFixedShape, buildCollectorPlan };