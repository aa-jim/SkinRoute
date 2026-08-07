function simulateThemedCrestFixedShape(event, packsData, resources = {}, extraDiaByDay = {}, rechargeDiaByDay = {}, targetDraws) {
  const { startingDia = 0, passCount = 0, firstPassBuyDay = 1, passesInBalance, startDay = 1 } = resources;
  const duration = event.duration_days;
  const dailyCost = event.discount_draw_cost?.daily_1x;
  const cost1xFull = event.draw_cost_1x;
  const cost10x = event.draw_cost_10x;
  if (!duration || !dailyCost || !cost1xFull || !cost10x) {
    throw new Error(`simulateThemedCrestFixedShape: event "${event.id}" missing required draw-cost fields`);
  }

  // 10x draws carry a permanent discount (tenx_diamond_only_pct_off, usually
  // 10%) — cheaper per draw than full singles. Used when a premium-supply
  // window closes so the spend-task clear buys discounted draws instead of
  // expensive full singles.
  const tenxCost = cost10x * (1 - (event.discount_draw_cost?.tenx_diamond_only_pct_off ?? 0) / 100);

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
  let dia = 0;
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

  // Surprise tasks (window-based, e.g. JJK / Street Fighter): recharge within the
  // first active_days days of the event unlocks free-draw tokens. Pass purchases
  // count as recharge value on purchase day (recharge_task_value).
  const surprise = event.has_surprise_tasks && event.surprise_tasks ? event.surprise_tasks : null;
  const surpriseWindowEnd = surprise ? Math.min(surprise.active_days ?? 0, duration) : 0;
  const surpriseTasks = surprise
    ? (surprise.tasks ?? [])
        .filter((t) => (t.tokens ?? 0) > 0)
        .map((t) => ({ threshold: t.threshold_dia ?? 0, tokens: t.tokens ?? 0 }))
        .sort((a, b) => a.threshold - b.threshold)
    : [];
  const passRechargeValue = pass.recharge_task_value ?? pass.dia_instant;
  let passRechargeDay = 0;
  let passRechargeDia = 0;
  if (!skipBenefits && firstPassBuyDay >= 1 && firstPassBuyDay <= duration) {
    passRechargeDay = firstPassBuyDay;
    passRechargeDia = passCount * passRechargeValue;
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

  const phaseOpenDays = new Set();
  const phaseByOpenDay = new Map();
  const phaseByCloseDay = new Map();
  for (const phase of supply) {
    const pStartDay = phase.start_day;
    const dur = phase.duration_days ?? 1;
    const endDay = pStartDay + dur - 1;
    phaseOpenDays.add(pStartDay);

    const rechargeTasks = (phase.tasks ?? [])
      .filter((t) => t.type?.startsWith("recharge_"))
      .map((t) => ({ threshold: t.threshold_dia, tokens: t.tokens ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold);
    const spendTasks = (phase.tasks ?? [])
      .filter((t) => t.type?.startsWith("spend_"))
      .map((t) => ({ threshold: t.threshold_dia, tokens: t.tokens ?? 0 }))
      .sort((a, b) => a.threshold - b.threshold);
    const loginTask = (phase.tasks ?? []).find((t) => t.type === "login");
    const data = { phase: phase.phase, pStartDay, endDay, rechargeTasks, spendTasks, loginTokens: loginTask?.tokens ?? 0, rechargeTotalTokens: rechargeTasks.reduce((s, t) => s + t.tokens, 0), highestRechargeThreshold: rechargeTasks.length > 0 ? rechargeTasks[rechargeTasks.length - 1].threshold : 0 };
    phaseByOpenDay.set(pStartDay, data);
    phaseByCloseDay.set(endDay, data);
  }

  let activeWindowCumSpend = 0;
  let currentPhaseRecharge = 0;
  let activePhaseData = null;
  let announcedSpendThresholds = new Set();
  let surpriseCumRecharge = 0;
  const surpriseClaimed = new Set();

  // --- Mid-phase start initialization ---
  let midPhaseInitialized = false;
  for (const phase of supply) {
    const pStartDay = phase.start_day;
    const endDay = pStartDay + (phase.duration_days ?? 1) - 1;
    if (startDay >= pStartDay && startDay <= endDay) {
      activePhaseData = phaseByOpenDay.get(pStartDay) ?? null;
      currentPhaseRecharge = rechargeDiaByDay[startDay] ?? 0;
      activeWindowCumSpend = 0;
      announcedSpendThresholds = new Set();
      midPhaseInitialized = true;
      break;
    }
  }

  function checkSpendThresholds(row) {
    if (!activePhaseData) return;
    for (const t of activePhaseData.spendTasks) {
      if (activeWindowCumSpend >= t.threshold && !announcedSpendThresholds.has(t.threshold)) {
        announcedSpendThresholds.add(t.threshold);
        row.notes.push(`${t.threshold} dias spend task completed (${t.tokens} tokens)`);
      }
    }
  }

  for (let day = startDay; day <= duration; day++) {
    let diaAddToday = passDailyDia[day] ?? 0;
    if (passInstantDays[day]) diaAddToday += passInstantDays[day];
    if (extraDiaByDay[day]) diaAddToday += extraDiaByDay[day];
    if (day === startDay) diaAddToday += startingDia;
    dia += diaAddToday;

    const row = { day, draws: 0, diaSpent: 0, diaRecharged: rechargeDiaByDay[day] ?? 0, diaAdd: diaAddToday, notes: [] };
    rows.push(row);

    // Phase open: new phase begins today
    if (phaseOpenDays.has(day)) {
      activeWindowCumSpend = 0;
      currentPhaseRecharge = rechargeDiaByDay[day] ?? 0;
      activePhaseData = phaseByOpenDay.get(day) ?? null;
      announcedSpendThresholds = new Set();
    }

    // Start-day notes
    if (activePhaseData && (phaseOpenDays.has(day) || (midPhaseInitialized && day === startDay))) {
      if (activePhaseData.rechargeTasks.length > 0 && currentPhaseRecharge >= activePhaseData.highestRechargeThreshold) {
        row.notes.push(`All recharge tasks completed (${activePhaseData.rechargeTotalTokens} tokens)`);
      }
      row.notes.push(`Don't claim any tokens until last day of phase ${activePhaseData.phase}`);
      if (midPhaseInitialized && day === startDay) midPhaseInitialized = false;
    }

    // Surprise window: cumulative recharge during the first active_days days
    // unlocks free draws (claim immediately, don't bank)
    if (surpriseWindowEnd > 0 && day >= 1 && day <= surpriseWindowEnd) {
      const rechargeToday = (rechargeDiaByDay[day] ?? 0) + (day === passRechargeDay ? passRechargeDia : 0);
      surpriseCumRecharge += rechargeToday;
      for (const t of surpriseTasks) {
        if (!surpriseClaimed.has(t.threshold) && surpriseCumRecharge >= t.threshold) {
          surpriseClaimed.add(t.threshold);
          claimKeys(t.tokens, `surprise recharge ${t.threshold} dia`, row);
        }
      }
    }

    dia -= dailyCost;
    activeWindowCumSpend += dailyCost;
    row.diaSpent += dailyCost;
    row.draws += 1;
    totalDraws += 1;
    row.notes.push("1x daily");

    checkSpendThresholds(row);

    const closingPhase = phaseByCloseDay.get(day);
    if (closingPhase) {
      checkSpendThresholds(row);

      const highestSpend = closingPhase.spendTasks[closingPhase.spendTasks.length - 1];
      if (highestSpend && activeWindowCumSpend < highestSpend.threshold) {
        // When the plan still needs bulk draws, clear the spend task with one
        // discounted 10x (45/draw vs 50/draw full singles) on the window's last
        // day instead of buying throwaway full singles here and leaving all
        // bulk 10x for the final day. Fall back to singles when the demand is
        // too small, the day is the event's last (final push handles it), or a
        // single 10x wouldn't clear the threshold.
        const futureDaily = duration - day;
        const remainingDemand = targetDraws - totalDraws - futureDaily;
        const bulkWorthIt =
          typeof targetDraws === "number" &&
          day < duration &&
          remainingDemand >= 10 &&
          activeWindowCumSpend + tenxCost >= highestSpend.threshold;
        if (bulkWorthIt) {
          dia -= tenxCost;
          activeWindowCumSpend += tenxCost;
          row.diaSpent += tenxCost;
          row.draws += 10;
          totalDraws += 10;
          row.notes.push("1x 10x draw (clears spend tasks) \u2192 10 draws");
        } else {
          const gap = highestSpend.threshold - activeWindowCumSpend;
          const singlesNeeded = Math.ceil(gap / cost1xFull);
          const cost = singlesNeeded * cost1xFull;
          dia -= cost;
          activeWindowCumSpend += cost;
          row.diaSpent += cost;
          row.draws += singlesNeeded;
          totalDraws += singlesNeeded;
          row.notes.push(`${singlesNeeded} single(s) to clear spend tasks`);
        }
      }

      checkSpendThresholds(row);

      let windowTokens = closingPhase.loginTokens;
      for (const t of closingPhase.spendTasks) windowTokens += t.tokens;
      for (const t of closingPhase.rechargeTasks) {
        if (currentPhaseRecharge >= t.threshold) {
          windowTokens += t.tokens;
        }
      }
      claimKeys(windowTokens, `All tasks completed`, row);

      activePhaseData = null;
      announcedSpendThresholds = new Set();
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

  return { rows, totalDraws, finalDia: dia, minDiaBalance, milestones, milestonesClaimed, surpriseCumRecharge, surpriseClaimed: [...surpriseClaimed] };
}

function buildThemedCrestPlanWithPacks(event, packsData, targetDraws, resources = {}, extraDiaByDay = {}, rechargeDiaByDay = {}) {
  const sim = simulateThemedCrestFixedShape(event, packsData, resources, extraDiaByDay, rechargeDiaByDay, targetDraws);
  const cost1xFull = event.draw_cost_1x;
  const tenxDiscountPct = event.discount_draw_cost?.tenx_diamond_only_pct_off ?? 0;
  const cost10x = event.draw_cost_10x * (1 - tenxDiscountPct / 100);

  const finalRow = sim.rows[sim.rows.length - 1];
  let dia = sim.finalDia;
  let unaffordableDiaShortfall = 0;
  let totalDraws = sim.totalDraws;

  const highestMilestone = sim.milestones.length > 0 ? sim.milestones[sim.milestones.length - 1] : null;
  let milestoneClaimed = highestMilestone ? sim.milestonesClaimed.has(highestMilestone.draws) : true;

  if (finalRow && highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
    finalRow.notes.push(`Claim ${highestMilestone.amount} tokens (milestone @ ${highestMilestone.draws} draws) \u2192 ${highestMilestone.amount} free draws`);
    finalRow.draws += highestMilestone.amount;
    totalDraws += highestMilestone.amount;
    milestoneClaimed = true;
  }

  const remaining = Math.max(0, targetDraws - totalDraws);

  if (finalRow && remaining > 0) {
    const tenxBatches = Math.floor(remaining / 10);
    const singles = remaining - tenxBatches * 10;
    const cost = tenxBatches * cost10x + singles * cost1xFull;
    dia -= cost;
    if (dia < 0) {
      unaffordableDiaShortfall = -dia;
      dia = 0;
    }
    const parts = ["Final push:"];
    if (tenxBatches > 0) parts.push(`${tenxBatches}x 10x draw(s)`);
    if (singles > 0) parts.push(`${singles} single(s)`);
    const suffix = event.type === "collector" ? " (dia)" : "";
    finalRow.notes.push(`${parts.join(" ")}${suffix} \u2192 ${remaining} draws`);
    finalRow.draws += remaining;
    finalRow.diaSpent += cost;
    totalDraws += remaining;
  }

  if (finalRow && highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
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
    surpriseCumRecharge: sim.surpriseCumRecharge ?? 0,
    surpriseClaimed: sim.surpriseClaimed ?? [],
  };
}

function buildThemedCrestPlan(event, packsData, targetDraws, resources = {}) {
  return buildThemedCrestPlanWithPacks(event, packsData, targetDraws, resources, {}, {});
}

module.exports = { simulateThemedCrestFixedShape, buildThemedCrestPlan, buildThemedCrestPlanWithPacks };
