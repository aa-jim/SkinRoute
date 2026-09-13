// skipFirstBatch: when true, the pre-phase pass unit (the 1 pass always bought
// at firstPassBuyDay before any supply phase) is NOT created — all passes are
// distributed onto phase-start days only. Precondition: firstPassBuyDay is
// strictly before the first REMAINING phase start (the caller checks this), so
// the `ps === firstPassBuyDay` batch below can never fire in skip mode.
export function distributePassPurchases(passCount, firstPassBuyDay, phaseStarts, skipFirstBatch = false) {
  const purchases = [];
  let left = passCount;
  if (left > 0 && !skipFirstBatch) {
    purchases.push({ day: firstPassBuyDay, count: 1 });
    left -= 1;
  }
  for (const ps of phaseStarts) {
    if (left <= 0) break;
    const batch = ps === firstPassBuyDay ? left : (ps === phaseStarts[0] ? Math.min(3, left) : 1);
    purchases.push({ day: ps, count: Math.min(batch, left) });
    left -= batch;
  }
  if (left > 0 && purchases.length > 0) {
    purchases[purchases.length - 1].count += left;
  } else if (left > 0) {
    purchases.push({ day: firstPassBuyDay, count: left });
  }
  return purchases;
}

function buildPassDripSchedule(purchases, pass, duration) {
  const dailyDia = {};
  const rechargeByDay = {};
  let queueCursor = Infinity;
  for (const pp of purchases) {
    if (pp.day < queueCursor) queueCursor = pp.day;
  }
  if (!isFinite(queueCursor)) return { dailyDia, rechargeByDay };

  for (const pp of purchases) {
    for (let i = 0; i < pp.count; i++) {
      dailyDia[pp.day] = (dailyDia[pp.day] ?? 0) + pass.dia_instant;
      rechargeByDay[pp.day] = (rechargeByDay[pp.day] ?? 0) + (pass.recharge_task_value ?? pass.dia_instant);
      const dripStart = Math.max(queueCursor, pp.day);
      for (let d = 0; d < pass.days; d++) {
        const day = dripStart + d;
        if (day > duration) break;
        dailyDia[day] = (dailyDia[day] ?? 0) + pass.dia_daily;
      }
      queueCursor = dripStart + pass.days;
    }
  }
  return { dailyDia, rechargeByDay };
}

// Total dia a pass purchase schedule contributes inside the event window
// (sequential queue, same math as buildPassDripSchedule): instant dia lands on
// each purchase day, drip runs one pass at a time. Used for exact recharge
// summary accounting.
export function passPurchasesTotalDia(purchases, pass, duration) {
  const { dailyDia } = buildPassDripSchedule(purchases, pass, duration);
  return Object.values(dailyDia).reduce((s, v) => s + v, 0);
}

function parsePhases(supply) {
  return supply.map(p => ({
    phase: p.phase,
    startDay: p.start_day,
    endDay: p.start_day + (p.duration_days ?? 1) - 1,
    rechargeTasks: (p.tasks ?? []).filter(t => t.type?.startsWith('recharge_')).sort((a, b) => (a.threshold_dia ?? 0) - (b.threshold_dia ?? 0)),
    spendTasks: (p.tasks ?? []).filter(t => t.type?.startsWith('spend_')).sort((a, b) => (a.threshold_dia ?? 0) - (b.threshold_dia ?? 0)),
    loginTokens: (p.tasks ?? []).find(t => t.type === 'login')?.tokens ?? 0,
    rechargeTotalTokens: (p.tasks ?? []).filter(t => t.type?.startsWith('recharge_')).reduce((s, t) => s + (t.tokens ?? 0), 0),
    highestRechargeThreshold: (p.tasks ?? []).filter(t => t.type?.startsWith('recharge_')).reduce((m, t) => Math.max(m, t.threshold_dia ?? 0), 0),
  }));
}

export function simulateAspirantsFixedShape(event, packsData, resources = {}, extraDiaByDay = {}, rechargeDiaByDay = {}) {
  const { startingDia = 0, passCount = 0, firstPassBuyDay = 1, passesInBalance, startDay = 1, dropFirstPass = false } = resources;
  const duration = event.duration_days;
  const dailyCost = event.discount_draw_cost?.daily_1x;
  const cost1xFull = event.draw_cost_1x;
  const firstTenxCost = event.discount_draw_cost?.first_time_10x ?? event.draw_cost_10x;

  const pass = packsData?.weekly_pass;
  if (!dailyCost) throw new Error(`simulateAspirantsFixedShape: event "${event.id}" missing daily_1x discount`);
  if (!pass) throw new Error('simulateAspirantsFixedShape: packs.json missing weekly_pass');

  const supply = Array.isArray(event.premium_supply) ? event.premium_supply : [];
  const phaseStarts = supply.map(p => p.start_day).sort((a, b) => a - b);

  const milestones = (Array.isArray(event.milestones) ? event.milestones : [])
    .filter((m) => m.reward_type === "token")
    .map((m) => ({ draws: m.draws, amount: m.tokens ?? 0 }))
    .sort((a, b) => a.draws - b.draws);
  const highestMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;

  const passDailyDia = {};
  const passRechargeByDay = {};

  if (passCount > 0) {
    let purchases;
    if (passesInBalance) {
      purchases = [{ day: firstPassBuyDay, count: passCount }];
    } else {
      // dropFirstPass: purchases go on the caller-provided remaining phase
      // starts only (passPhaseStarts) — past phase days are unbuyable.
      const purchasePhaseStarts = dropFirstPass && Array.isArray(resources.passPhaseStarts) && resources.passPhaseStarts.length > 0
        ? resources.passPhaseStarts
        : phaseStarts;
      purchases = distributePassPurchases(passCount, firstPassBuyDay, purchasePhaseStarts, dropFirstPass);
    }

    const sched = buildPassDripSchedule(purchases, pass, duration);
    for (const [k, v] of Object.entries(sched.dailyDia)) passDailyDia[k] = v;
    for (const [k, v] of Object.entries(sched.rechargeByDay)) passRechargeByDay[k] = v;

    if (passesInBalance) {
      const day = firstPassBuyDay;
      const subDia = passCount * pass.dia_instant + (day <= duration ? pass.dia_daily : 0);
      const subRecharge = passCount * (pass.recharge_task_value ?? pass.dia_instant);
      passDailyDia[day] = Math.max(0, (passDailyDia[day] ?? 0) - subDia);
      passRechargeByDay[day] = Math.max(0, (passRechargeByDay[day] ?? 0) - subRecharge);
    }
  }

  const phaseList = parsePhases(supply);
  const firstPhaseDay = phaseList.length > 0 ? phaseList[0].startDay : duration + 1;
  const lastPhaseEnd = phaseList.length > 0 ? phaseList[phaseList.length - 1].endDay : 0;

  let dia = 0;
  let totalDraws = 0;
  const milestonesClaimed = new Set();
  function claimKeys(n, label, row) {
    if (n <= 0) return;
    row.notes.push(`Claim ${n} token${n > 1 ? "s" : ""} (${label}) \u2192 ${n} free draw${n > 1 ? "s" : ""}`);
    row.draws += n;
    totalDraws += n;
  }
  let firstTenxUsed = false;
  let activePhase = null;
  let cumPhaseSpend = 0;
  let phaseSpendTasksDone = false;
  const claimedSpendThresholds = new Set();
  let accumulationMode = false;

  // --- Mid-phase start initialization ---
  for (const p of phaseList) {
    if (startDay >= p.startDay && startDay <= p.endDay) {
      activePhase = p;
      cumPhaseSpend = 0;
      claimedSpendThresholds.clear();
      phaseSpendTasksDone = activePhase.spendTasks.length === 0;
      break;
    }
  }
  // If after the last phase, enter accumulation mode
  if (startDay > lastPhaseEnd) {
    accumulationMode = true;
  }
  // If startDay >= firstPhaseDay and no phase was set (between phases), keep activePhase=null

  const rows = [];

  for (let day = startDay; day <= duration; day++) {
    const drip = passDailyDia[day] ?? 0;
    const packDia = extraDiaByDay[day] ?? 0;
    const addToday = drip + packDia + (day === startDay ? startingDia : 0);
    dia += addToday;

    const row = { day, draws: 0, diaSpent: 0, diaRecharged: packDia, diaAdd: addToday, notes: [] };

    const phaseStart = phaseList.find(p => p.startDay === day);
    if (phaseStart) {
      activePhase = phaseStart;
      cumPhaseSpend = 0;
      claimedSpendThresholds.clear();
      phaseSpendTasksDone = activePhase.spendTasks.length === 0;
    }
    if (activePhase && day > activePhase.endDay) {
      activePhase = null;
    }

    const isLastPhase = activePhase && phaseList.indexOf(activePhase) === phaseList.length - 1;
    const rechargeValueToday = (passRechargeByDay[day] ?? 0) + (rechargeDiaByDay[day] ?? 0);

    const isPrePhase = day < firstPhaseDay;
    const isInPhase = activePhase !== null;

    if ((isLastPhase && phaseSpendTasksDone) || day > lastPhaseEnd) {
      accumulationMode = true;
    }

    if (isPrePhase) {
    } else if (isInPhase) {
      if (!phaseSpendTasksDone) {
        if (dia >= dailyCost) {
          dia -= dailyCost;
          row.diaSpent += dailyCost;
          row.draws += 1;
          totalDraws += 1;
          cumPhaseSpend += dailyCost;
          row.notes.push('1x daily');

          for (const st of activePhase.spendTasks) {
            if (cumPhaseSpend >= (st.threshold_dia ?? 0) && !claimedSpendThresholds.has(st.threshold_dia)) {
              claimedSpendThresholds.add(st.threshold_dia);
              const amt = st.tokens ?? 0;
              if (amt > 0) {
                claimKeys(amt, `spend_${st.threshold_dia} task`, row);
              }
            }
          }

          const highestSpendThreshold = activePhase.spendTasks.length > 0
            ? activePhase.spendTasks[activePhase.spendTasks.length - 1].threshold_dia
            : 0;
          phaseSpendTasksDone = highestSpendThreshold > 0
            ? claimedSpendThresholds.has(highestSpendThreshold)
            : true;
        }
      }

      if (phaseStart && rechargeValueToday >= activePhase.highestRechargeThreshold) {
        const tokenAmt = activePhase.loginTokens + activePhase.rechargeTotalTokens;
        if (tokenAmt > 0) {
          claimKeys(tokenAmt, "recharge tasks", row);
        }
      }
    }

    if (activePhase && day === activePhase.endDay && !phaseSpendTasksDone) {
      const highestSpend = activePhase.spendTasks.length > 0
        ? activePhase.spendTasks[activePhase.spendTasks.length - 1]
        : null;
      if (highestSpend && cumPhaseSpend < highestSpend.threshold_dia) {
        const gap = highestSpend.threshold_dia - cumPhaseSpend;
        const singlesNeeded = Math.ceil(gap / cost1xFull);
        const cost = singlesNeeded * cost1xFull;
        if (dia >= cost) {
          dia -= cost;
          cumPhaseSpend += cost;
          row.diaSpent += cost;
          row.draws += singlesNeeded;
          totalDraws += singlesNeeded;
          row.notes.push(`${singlesNeeded} single(s) to clear spend tasks`);
        }
      }
      phaseSpendTasksDone = true;
    }

    if (accumulationMode) {
      const useTenx = !firstTenxUsed && day > lastPhaseEnd && dia >= firstTenxCost;
      if (useTenx) {
        dia -= firstTenxCost;
        row.diaSpent += firstTenxCost;
        row.draws += 10;
        totalDraws += 10;
        firstTenxUsed = true;
        row.notes.push('1x 10-draw (first-time discount)');
      } else if (dia >= dailyCost && row.draws === 0) {
        dia -= dailyCost;
        row.diaSpent += dailyCost;
        row.draws += 1;
        totalDraws += 1;
        row.notes.push('1x daily');
      }
    }

    for (const m of milestones) {
      if (highestMilestone && m.draws === highestMilestone.draws) continue;
      if (!milestonesClaimed.has(m.draws) && totalDraws >= m.draws) {
        milestonesClaimed.add(m.draws);
        claimKeys(m.amount, `milestone @ ${m.draws} draws`, row);
      }
    }

    row.diaLeft = dia;
    rows.push(row);
  }

  return { rows, totalDraws, finalDia: dia, phaseList, firstPhaseDay, lastPhaseEnd, milestonesClaimed, highestMilestone };
}

export function buildAspirantsPlanWithPacks(event, packsData, targetDraws, resources = {}, extraDiaByDay = {}, rechargeDiaByDay = {}) {
  const sim = simulateAspirantsFixedShape(event, packsData, resources, extraDiaByDay, rechargeDiaByDay);
  const cost1xFull = event.draw_cost_1x;

  const finalRow = sim.rows[sim.rows.length - 1];
  let totalDraws = sim.totalDraws;
  let dia = sim.finalDia;
  let unaffordableDiaShortfall = 0;

  const highestMilestone = sim.highestMilestone;
  let milestoneClaimed = highestMilestone ? sim.milestonesClaimed?.has(highestMilestone.draws) : true;

  if (finalRow && highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
    const amt = highestMilestone.amount;
    finalRow.notes.push(`Claim ${amt} token${amt > 1 ? "s" : ""} (milestone @ ${highestMilestone.draws} draws) \u2192 ${amt} free draw${amt > 1 ? "s" : ""}`);
    finalRow.draws += amt;
    totalDraws += amt;
    milestoneClaimed = true;
  }

  const remaining = Math.max(0, targetDraws - totalDraws);

  if (finalRow && remaining > 0) {
    const dailyCost = event.discount_draw_cost?.daily_1x ?? cost1xFull;
    const cost = remaining * dailyCost;
    dia -= cost;
    if (dia < 0) {
      unaffordableDiaShortfall = -dia;
      dia = 0;
    }
    finalRow.notes.push(`Final push: ${remaining} single(s) \u2192 ${remaining} draws`);
    finalRow.draws += remaining;
    finalRow.diaSpent += cost;
    totalDraws += remaining;
  }

  if (finalRow && highestMilestone && !milestoneClaimed && totalDraws >= highestMilestone.draws) {
    const amt = highestMilestone.amount;
    finalRow.notes.push(`Claim ${amt} token${amt > 1 ? "s" : ""} (milestone @ ${highestMilestone.draws} draws, reached during final push) \u2192 ${amt} free draw${amt > 1 ? "s" : ""}`);
    finalRow.draws += amt;
    totalDraws += amt;
  }

  return {
    rows: sim.rows,
    totalDraws,
    targetDraws,
    finalDia: dia,
    unaffordableDiaShortfall,
    phaseList: sim.phaseList,
    firstPhaseDay: sim.firstPhaseDay,
    lastPhaseEnd: sim.lastPhaseEnd,
  };
}

export function buildAspirantsPlan(event, packsData, targetDraws, resources = {}) {
  return buildAspirantsPlanWithPacks(event, packsData, targetDraws, resources, {}, {});
}
