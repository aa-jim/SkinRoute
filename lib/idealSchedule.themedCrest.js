// lib/idealSchedule.themedCrest.js
// Themed Crest / Legend / Special "ideal draw environment" schedule generator.
//
// Unlike the Collector simulator (which calculates Starlight/CoA spending inline),
// this simulator does NOT invent recharge amounts — it accepts extraDiaByDay from
// the orchestrator, which handles all pack/pass optimization externally.
//
// Key differences from Collector:
//   - No CoA/Starlight layer — diamonds only, entire event.
//   - Multiple premium supply phases (each with their own recharge + spend tasks).
//   - Recharge tokens claimed only if the actual recharge threshold was met
//     (tracked via currentPhaseRecharge).
//   - extraDiaByDay replaces inline recharge calculation.
//   - Passes provide drip for the pre-window period; window recharges are
//     injected by the orchestrator via extraDiaByDay.

function simulateThemedCrestFixedShape(event, packsData, resources = {}, extraDiaByDay = {}) {
  const { startingDia = 0, passCount = 0, firstPassBuyDay = 1, passesInBalance } = resources;
  const duration = event.duration_days;
  const dailyCost = event.discount_draw_cost?.daily_1x;
  const cost1xFull = event.draw_cost_1x;
  const cost10x = event.draw_cost_10x;
  if (!duration || !dailyCost || !cost1xFull || !cost10x) {
    throw new Error(`simulateThemedCrestFixedShape: event "${event.id}" missing required draw-cost fields`);
  }

  const supply = event.premium_supply;
  if (!Array.isArray(supply)) {
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
  const milestonesClaimed = new Set();

  const passDailyDia = {};
  const passInstantDays = {};
  const skipBenefits = passesInBalance ?? (passCount > 0 && firstPassBuyDay <= 1 && startingDia >= passCount * pass.dia_instant + pass.dia_daily);

  if (!skipBenefits) {
    if (firstPassBuyDay >= 1 && firstPassBuyDay <= duration) {
      passInstantDays[firstPassBuyDay] = passCount * pass.dia_instant;
    }
  }

  let queueCursor = firstPassBuyDay;
  for (let p = 0; p < passCount; p++) {
    for (let d = 0; d < pass.days; d++) {
      const day = queueCursor + d;
      if (day > duration) break;
      if (day < 1) continue;
      if (skipBenefits && day === 1) continue;
      passDailyDia[day] = (passDailyDia[day] ?? 0) + pass.dia_daily;
    }
    queueCursor += pass.days;
  }

  function claimKeys(n, label, row) {
    if (n <= 0) return;
    row.notes.push(`Claim ${n} token${n > 1 ? "s" : ""} (${label}) \u2192 ${n} free draw${n > 1 ? "s" : ""}`);
    row.draws += n;
    totalDraws += n;
  }

  // Build phase lookups: open days set, close day map with task data
  const phaseOpenDays = new Set();
  const phaseByCloseDay = new Map();
  for (const phase of supply) {
    const startDay = phase.start_day;
    const dur = phase.duration_days ?? 1;
    const endDay = startDay + dur - 1;
    phaseOpenDays.add(startDay);

    const rechargeTasks = (phase.tasks ?? [])
      .filter((t) => t.type?.startsWith("recharge_"))
      .map((t) => ({ threshold: t.threshold_dia, tokens: t.tokens ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold);
    const spendTasks = (phase.tasks ?? [])
      .filter((t) => t.type?.startsWith("spend_"))
      .map((t) => ({ threshold: t.threshold_dia, tokens: t.tokens ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold);
    const loginTask = (phase.tasks ?? []).find((t) => t.type === "login");
    phaseByCloseDay.set(endDay, { startDay, endDay, rechargeTasks, spendTasks, loginTokens: loginTask?.tokens ?? 0 });
  }

  let activeWindowCumSpend = 0;
  let currentPhaseRecharge = 0;

  for (let day = 1; day <= duration; day++) {
    let diaAddToday = passDailyDia[day] ?? 0;
    if (passInstantDays[day]) diaAddToday += passInstantDays[day];
    if (extraDiaByDay[day]) diaAddToday += extraDiaByDay[day];
    dia += diaAddToday;

    const row = { day, draws: 0, diaSpent: 0, diaRecharged: extraDiaByDay[day] || 0, diaAdd: diaAddToday, notes: [] };
    rows.push(row);

    if (phaseOpenDays.has(day)) {
      activeWindowCumSpend = 0;
      currentPhaseRecharge = extraDiaByDay[day] || 0;
    }

    // Daily 1x draw
    dia -= dailyCost;
    activeWindowCumSpend += dailyCost;
    row.diaSpent += dailyCost;
    row.draws += 1;
    totalDraws += 1;
    row.notes.push("1x daily");

    const closingPhase = phaseByCloseDay.get(day);
    if (closingPhase) {
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
      }

      let windowTokens = closingPhase.loginTokens;
      for (const t of closingPhase.spendTasks) windowTokens += t.tokens;
      for (const t of closingPhase.rechargeTasks) {
        if (currentPhaseRecharge >= t.threshold) {
          windowTokens += t.tokens;
        }
      }
      claimKeys(windowTokens, `Premium Supply window (day ${closingPhase.startDay}-${closingPhase.endDay})`, row);
    }

    for (const m of milestones) {
      if (highestMilestone && m.draws === highestMilestone.draws) continue;
      if (!milestonesClaimed.has(m.draws) && totalDraws >= m.draws) {
        milestonesClaimed.add(m.draws);
        claimKeys(m.amount, `milestone @ ${m.draws} draws`, row);
      }
    }

    row.diaLeft = dia;
  }

  const minDiaBalance = rows.reduce((min, r) => Math.min(min, r.diaLeft ?? 0), Infinity);

  return { rows, totalDraws, finalDia: dia, minDiaBalance, milestones, milestonesClaimed };
}

/**
 * Full Themed Crest plan: fixed-shape simulation + final-day flex to close the gap to
 * targetDraws. Highest token milestone is additive (claimed on top, never substituted).
 *
 * extraDiaByDay: { [dayNumber]: diaAmount } — external diamond injections from packs/passes
 * that the orchestrator has already optimized. The simulator does NOT calculate its own
 * recharge amounts.
 */
function buildThemedCrestPlanWithPacks(event, packsData, targetDraws, resources = {}, extraDiaByDay = {}) {
  const sim = simulateThemedCrestFixedShape(event, packsData, resources, extraDiaByDay);
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

  const remaining = Math.max(0, targetDraws - totalDraws);

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

  return {
    rows: sim.rows,
    totalDraws,
    targetDraws,
    finalDia: dia,
    unaffordableDiaShortfall,
  };
}

function buildThemedCrestPlan(event, packsData, targetDraws, resources = {}) {
  return buildThemedCrestPlanWithPacks(event, packsData, targetDraws, resources, {});
}

module.exports = { simulateThemedCrestFixedShape, buildThemedCrestPlan, buildThemedCrestPlanWithPacks };
