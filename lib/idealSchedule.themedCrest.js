// lib/idealSchedule.themedCrest.js
// Themed Crest / Legend / Special "ideal draw environment" schedule generator.
// Replaces planOrchestrator.js's themedCrestIdealPlan()/coaPrioritySpendPlan()-equivalent
// chain for non-Collector event types. Verified against a hand-worked 0-resource reference
// plan (Themed_crest_approach.txt, 31-day generic shape matching Street Fighter's task
// structure) before being wired in.
//
// CONFIRMED rules (differ from Collector):
//   - No CoA/Starlight layer — diamonds only, entire event.
//   - Passes bought Day 1 only (bridge diamonds to the first premium supply window) —
//     NOT re-bought at each window like Collector's single Day-1 front-load; still just
//     Day 1 here since 4 passes cover the whole 31-day event's drip need in this shape.
//   - RECHARGE tasks (recharge_any/50/100/250) are cleared on the WINDOW-OPEN day via a
//     diamond pack purchase, sized to ALSO cover that window's daily-1x costs for the
//     rest of the window (so the window never runs short mid-way).
//   - SPEND tasks (spend_100/spend_250) accumulate via daily-1x naturally across the
//     window, topped up with extra FULL-PRICE SINGLES only on the WINDOW-CLOSE day —
//     never a 10x bulk (per SCHEDULING_APPROACHES.md's daily+singles-beats-bulk rule).
//   - All of that window's tokens (recharge + spend + login) are claimed together on the
//     WINDOW-CLOSE day, all at once, and drawn immediately.
//   - Milestone tokens claimed the day their draw-threshold is crossed (same as Collector).
//   - The HIGHEST token milestone is additive on the final day (same confirmed rule as
//     Collector) — never substituted in place of a needed paid draw.

/**
 * @param {object} event - themed_crest/legend/special type. Needs draw_cost_1x, draw_cost_10x,
 *   discount_draw_cost.daily_1x, premium_supply[] (2 phases), milestones.
 * @param {object} packsData - packs.json, needs weekly_pass.
 * @param {object} resources - { startingDia, passCount }
 * @returns {{rows, totalDraws, finalDia, cumDiaSpentPerWindow, minDiaBalance}}
 */
function simulateThemedCrestFixedShape(event, packsData, resources = {}) {
  const { startingDia = 0, passCount = 0 } = resources;
  const duration = event.duration_days;
  const dailyCost = event.discount_draw_cost?.daily_1x;
  const cost1xFull = event.draw_cost_1x;
  const cost10x = event.draw_cost_10x;
  if (!duration || !dailyCost || !cost1xFull || !cost10x) {
    throw new Error(`simulateThemedCrestFixedShape: event "${event.id}" missing required draw-cost fields`);
  }

  const supply = event.premium_supply;
  if (!Array.isArray(supply) || supply.length === 0) {
    throw new Error(`simulateThemedCrestFixedShape: event "${event.id}" missing premium_supply`);
  }

  const milestones = (Array.isArray(event.milestones) ? event.milestones : [])
    .filter((m) => m.reward_type === "token")
    .map((m) => ({ draws: m.draws, amount: m.tokens ?? 0 }))
    .sort((a, b) => a.draws - b.draws);
  const highestMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;

  const pass = packsData?.weekly_pass;
  if (!pass) throw new Error("simulateThemedCrestFixedShape: packs.json missing weekly_pass");

  const rows = [];
  let dia = startingDia;
  let totalDraws = 0;
  let minDiaBalance = startingDia;
  const milestonesClaimed = new Set();

  const passDailyDia = {};
  let queueCursor = 1;
  for (let p = 0; p < passCount; p++) {
    const dripStart = Math.max(queueCursor, 1);
    for (let d = 0; d < pass.days; d++) {
      const day = dripStart + d;
      if (day > duration) break;
      passDailyDia[day] = (passDailyDia[day] ?? 0) + pass.dia_daily;
    }
    queueCursor = dripStart + pass.days;
  }
  if (passCount > 0) dia += pass.dia_instant * passCount;

  function claimKeys(n, label, row) {
    if (n <= 0) return;
    row.notes.push(`Claim ${n} token${n > 1 ? "s" : ""} (${label}) \u2192 ${n} free draw${n > 1 ? "s" : ""}`);
    row.draws += n;
    totalDraws += n;
  }

  // Build a lookup: which day is a window-open day, which is window-close day, and each
  // phase's task list (recharge_* + spend_* + login), read dynamically per phase.
  const phaseByOpenDay = new Map();
  const phaseByCloseDay = new Map();
  for (const phase of supply) {
    const startDay = phase.start_day;
    const dur = phase.duration_days ?? 1;
    const endDay = startDay + dur - 1;
    const rechargeTasks = (phase.tasks ?? [])
      .filter((t) => t.type?.startsWith("recharge_"))
      .map((t) => ({ threshold: t.threshold_dia, tokens: t.tokens ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold);
    const spendTasks = (phase.tasks ?? [])
      .filter((t) => t.type?.startsWith("spend_"))
      .map((t) => ({ threshold: t.threshold_dia, tokens: t.tokens ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold);
    const loginTask = (phase.tasks ?? []).find((t) => t.type === "login");
    phaseByOpenDay.set(startDay, { startDay, endDay, rechargeTasks, spendTasks, loginTokens: loginTask?.tokens ?? 0 });
    phaseByCloseDay.set(endDay, { startDay, endDay, rechargeTasks, spendTasks, loginTokens: loginTask?.tokens ?? 0 });
  }

  let activeWindowCumSpend = 0; // resets per window, tracks diamonds spent ON DRAWS within the current window

  for (let day = 1; day <= duration; day++) {
    dia += passDailyDia[day] ?? 0;
    const row = { day, draws: 0, diaSpent: 0, diaRecharged: 0, notes: [] };
    rows.push(row);

    const openingPhase = phaseByOpenDay.get(day);
    const closingPhase = phaseByCloseDay.get(day);

    if (openingPhase) {
      activeWindowCumSpend = 0;
      // Recharge (pack purchase) sized to clear the highest recharge tier AND cover the
      // window's ENTIRE diamond need (all days' daily-1x, including today, plus the exact
      // top-up singles cost on window-close day). Daily-1x draws count toward the spend
      // threshold too, so the top-up is only the REMAINING gap after all window days'
      // daily-1x — not the full threshold as a separate buffer (that would double-book).
      const highestRecharge = openingPhase.rechargeTasks[openingPhase.rechargeTasks.length - 1];
      const highestSpendForWindow = openingPhase.spendTasks[openingPhase.spendTasks.length - 1];
      if (highestRecharge) {
        const windowDays = openingPhase.endDay - openingPhase.startDay + 1;
        const windowDailyTotal = windowDays * dailyCost; // ALL days incl. today
        const gapForSpendTier = highestSpendForWindow ? Math.max(0, highestSpendForWindow.threshold - windowDailyTotal) : 0;
        const singlesNeeded = Math.ceil(gapForSpendTier / cost1xFull);
        const windowTotalNeed = windowDailyTotal + singlesNeeded * cost1xFull;
        const rechargeAmount = Math.max(highestRecharge.threshold, windowTotalNeed);
        dia += rechargeAmount;
        row.diaRecharged = rechargeAmount;
        row.notes.push(`Recharge ${rechargeAmount} dia (clears recharge tasks + funds rest of window)`);
      }
    }

    // Daily 1x — always happens (diamonds assumed funded via recharge if needed, same
    // "always perform the plan" principle as Collector's spend-window).
    dia -= dailyCost;
    activeWindowCumSpend += dailyCost;
    row.diaSpent += dailyCost;
    row.draws += 1;
    totalDraws += 1;
    row.notes.push("1x daily (dia)");
    if (dia < minDiaBalance) minDiaBalance = dia;

    if (closingPhase) {
      // Top up with full-price singles to clear the highest spend tier, if daily-1x alone
      // (accumulated across the whole window) hasn't already cleared it.
      const highestSpend = closingPhase.spendTasks[closingPhase.spendTasks.length - 1];
      if (highestSpend && activeWindowCumSpend < highestSpend.threshold) {
        const gap = highestSpend.threshold - activeWindowCumSpend;
        const singlesNeeded = Math.ceil(gap / cost1xFull);
        const cost = singlesNeeded * cost1xFull;
        dia -= cost;
        activeWindowCumSpend += cost;
        row.diaSpent += cost;
        row.draws += singlesNeeded;
        totalDraws += singlesNeeded;
        row.notes.push(`${singlesNeeded} single(s) (dia) to clear spend tasks`);
        if (dia < minDiaBalance) minDiaBalance = dia;
      }

      // Claim ALL this window's tokens together (recharge + spend + login), drawn immediately.
      let windowTokens = closingPhase.loginTokens;
      for (const t of closingPhase.rechargeTasks) windowTokens += t.tokens; // recharge already guaranteed cleared (funded at window-open)
      for (const t of closingPhase.spendTasks) windowTokens += t.tokens; // spend guaranteed cleared by the top-up above
      claimKeys(windowTokens, `Premium Supply window (day ${closingPhase.startDay}-${closingPhase.endDay})`, row);
    }

    // Milestones (all EXCEPT the highest one, which is handled additively on the final day).
    for (const m of milestones) {
      if (highestMilestone && m.draws === highestMilestone.draws) continue;
      if (!milestonesClaimed.has(m.draws) && totalDraws >= m.draws) {
        milestonesClaimed.add(m.draws);
        claimKeys(m.amount, `milestone @ ${m.draws} draws`, row);
      }
    }
  }

  return { rows, totalDraws, finalDia: dia, minDiaBalance, milestones, milestonesClaimed };
}

/**
 * Full Themed Crest plan: fixed-shape simulation + final-day flex to close the gap to
 * targetDraws. Highest token milestone is additive (claimed on top, never substituted).
 *
 * @param {object} event
 * @param {object} packsData
 * @param {number} targetDraws
 * @param {object} resources - { startingDia, passCount }
 * @returns {{rows, totalDraws, targetDraws, finalDia, unaffordableDiaShortfall, day1RechargeNeeded}}
 */
function buildThemedCrestPlan(event, packsData, targetDraws, resources = {}) {
  const sim = simulateThemedCrestFixedShape(event, packsData, resources);
  const cost1xFull = event.draw_cost_1x;
  const tenxDiscountPct = event.discount_draw_cost?.tenx_diamond_only_pct_off ?? 0;
  const cost10x = event.draw_cost_10x * (1 - tenxDiscountPct / 100);

  const finalRow = sim.rows[sim.rows.length - 1];
  let dia = sim.finalDia;
  let unaffordableDiaShortfall = 0;
  let totalDraws = sim.totalDraws;

  const highestMilestone = sim.milestones.length > 0 ? sim.milestones[sim.milestones.length - 1] : null;
  let milestoneClaimed = highestMilestone ? sim.milestonesClaimed.has(highestMilestone.draws) : true;

  if (highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
    finalRow.notes.push(`Claim ${highestMilestone.amount} tokens (milestone @ ${highestMilestone.draws} draws) \u2192 ${highestMilestone.amount} free draws`);
    finalRow.draws += highestMilestone.amount;
    totalDraws += highestMilestone.amount;
    milestoneClaimed = true;
  }

  // Paid flex only pays for draws that MUST be paid — never pay for draws that free
  // milestone draws would cover (CONFIRMED rule, same as Collector). Only relevant when
  // there's an actual gap to close (targetDraws > totalDraws already) — if the fixed
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
    finalRow.notes.push(`Claim ${highestMilestone.amount} tokens (milestone @ ${highestMilestone.draws} draws, reached during final push) \u2192 ${highestMilestone.amount} free draws`);
    finalRow.draws += highestMilestone.amount;
    totalDraws += highestMilestone.amount;
    milestoneClaimed = true;
  }

  const day1RechargeNeeded = sim.minDiaBalance < 0 ? -sim.minDiaBalance : 0;

  return {
    rows: sim.rows,
    totalDraws,
    targetDraws,
    finalDia: dia,
    unaffordableDiaShortfall,
    day1RechargeNeeded,
  };
}

module.exports = { simulateThemedCrestFixedShape, buildThemedCrestPlan };