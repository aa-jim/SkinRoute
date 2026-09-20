// skipFirstBatch: when true, the pre-phase pass unit (the 1 pass always bought
// at firstPassBuyDay before any supply phase) is NOT created — all passes are
// distributed onto phase-start days only. Precondition: firstPassBuyDay is
// strictly before the first REMAINING phase start (the caller checks this), so
// the `ps === firstPassBuyDay` batch below can never fire in skip mode.
// The note written when the FIRST-TIME discounted 10x draw fires (the 40 -> 50
// hop). Consumers (schedule table, PDF, bug report, verifier) use this exact
// string to split the 10x day into its main row (the daily draw + whatever the
// day itself recharged) and its sub row (the 10x + the packs bought that day to
// fund it) - never re-derive that split from loose "10x" substring matching.
export const FIRST_TENX_NOTE = "1x 10-draw (first-time discount)";
export const isFirstTenxNote = (n) => typeof n === "string" && n.includes("10-draw (first-time discount)");

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

// Real end day of the SEQUENTIAL pass drip queue given an actual purchase
// schedule and the pass duration. Each pass's drip starts at
// `max(queueCursor, purchaseDay)` and advances the cursor by `pass.days`.
// This mirrors buildPassDripSchedule's cursor exactly — NOT
// `firstPassBuyDay + totalPasses * pass.days`, which falsely assumes all passes
// queue from day 1 regardless of when they were actually purchased.
// Returns the last in-window drip day (Infinity when nothing is in-window).
export function passQueueEndDay(purchases, pass, duration) {
  const sorted = [...purchases].sort((a, b) => a.day - b.day);
  if (sorted.length === 0) return Infinity;
  const firstPurchaseDay = sorted[0].day;
  const firstDripStart = Math.max(firstPurchaseDay, 1);
  let cursor = firstDripStart;
  let lastDripEnd = Infinity;
  for (const pp of sorted) {
    for (let i = 0; i < pp.count; i++) {
      const dripStart = Math.max(cursor, pp.day);
      lastDripEnd = dripStart + pass.days - 1;
      cursor = dripStart + pass.days;
    }
  }
  return lastDripEnd;
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

export function simulateAspirantsFixedShape(event, packsData, resources = {}, extraDiaByDay = {}, rechargeDiaByDay = {}, targetDraws = Infinity) {
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
      // dropFirstPass: see the passPhaseStarts note below - past phase days are unbuyable.
      // passPhaseStarts (when the caller provides it) lists the BUYABLE pass
      // purchase days: the remaining phase anchors. The old code only honored
      // it in drop mode - non-drop distributions scattered passes onto the RAW
      // phase start days, including days already in the past, where the 80-dia
      // instant payout silently vanished (the purchase lands before the
      // schedule's first day) and the drip queue mis-timed. An explicitly
      // provided EMPTY list (post-phase starts) must also be honored - the
      // leftover passes then stack on firstPassBuyDay.
      const purchasePhaseStarts = Array.isArray(resources.passPhaseStarts)
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
  let firstTenxDay = 0; // day the first-time 10x actually fired (0 = never)
  let activePhase = null;
  let cumPhaseSpend = 0;
  let phaseSpendTasksDone = false;
  // Recharge-task claim state for the ACTIVE phase. In-game a phase's recharge
  // tasks stay claimable for the whole window: the tokens unlock when the
  // CUMULATIVE in-window recharge crosses the threshold, on whatever day that
  // happens. The old code only checked the exact phase-start day, so a start
  // mid-phase (e.g. startDay 4 inside phase 1, days 3-7) silently lost every
  // token even though recharging on day 4 legitimately earns them.
  let phaseRechargeClaimed = false;
  let cumPhaseRecharge = 0;
  const claimedSpendThresholds = new Set();
  let accumulationMode = false;

  // --- Mid-phase start initialization ---
  for (const p of phaseList) {
    if (startDay >= p.startDay && startDay <= p.endDay) {
      activePhase = p;
      cumPhaseSpend = 0;
      claimedSpendThresholds.clear();
      phaseSpendTasksDone = activePhase.spendTasks.length === 0;
      phaseRechargeClaimed = false;
      cumPhaseRecharge = 0;
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
      phaseRechargeClaimed = false;
      cumPhaseRecharge = 0;
    }
    if (activePhase && day > activePhase.endDay) {
      activePhase = null;
    }

    const isLastPhase = activePhase && phaseList.indexOf(activePhase) === phaseList.length - 1;
    const rechargeValueToday = (passRechargeByDay[day] ?? 0) + (rechargeDiaByDay[day] ?? 0);

    const isPrePhase = day < firstPhaseDay;
    const isInPhase = activePhase !== null;

    // Accumulation mode covers every day that no spend business owns: between two
    // phases, and the tail of a phase once its spend tasks are already cleared.
    // The 50%-off daily draw is takeable on all of them, and skipping those days
    // is what left the calendar without enough draws to reach the target on time
    // (the plan then had to dump full-price singles on the last day). Pre-phase
    // days stay idle - the plan has no reason to spend there (the first funding
    // anchor is the first phase).
    const dailyWindowOpen = day > firstPhaseDay && (activePhase === null || phaseSpendTasksDone);
    if (dailyWindowOpen || day > lastPhaseEnd) {
      accumulationMode = true;
    }

    if (isPrePhase) {
    } else if (isInPhase) {
      if (!phaseSpendTasksDone) {
        if (dia >= dailyCost && totalDraws < targetDraws) {
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

      // Recharge tasks are claimable on ANY day inside the phase window: the
      // tokens unlock when the CUMULATIVE in-window recharge (pass purchases'
      // recharge_task_value + pack recharges booked by the orchestrator)
      // crosses the highest threshold. This replaces the old exact-day check
      // (`phaseStart && rechargeValueToday >= threshold`), which only fired on
      // the phase's own start day and dropped every token when the user
      // started planning mid-phase — the open phase is still fully claimable
      // in-game. Same-day crossings (the day-1 plan's 3-pass day-3 purchase,
      // the phase-2 r_257) behave identically to before.
      if (activePhase && !phaseRechargeClaimed) {
        cumPhaseRecharge += rechargeValueToday;
        if (activePhase.highestRechargeThreshold <= 0 || cumPhaseRecharge >= activePhase.highestRechargeThreshold) {
          const tokenAmt = activePhase.loginTokens + activePhase.rechargeTotalTokens;
          if (tokenAmt > 0) {
            claimKeys(tokenAmt, "recharge tasks", row);
          }
          phaseRechargeClaimed = true;
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
      // The first-time 10x is reserved for the 40→50 hop: it must only fire
      // once the running total has reached the 40-draw bingo checkpoint (the
      // user can stop there if the box is already complete) and only when the
      // target actually needs draws 41+. Firing it earlier wastes its
      // position — e.g. 39 draws + 10x = 49, then a lone daily lands on 50
      // with no checkpoint in between; on late starts it fired at 0 draws and
      // left the whole 40-checkpoint to a single-day singles dump.
      // The 10x may fire once 40 draws are in and the target needs 41+: either
      // after the last phase (the old rule) or on the checkpoint day itself when
      // it falls inside the last phase and that phase's spend tasks are already
      // cleared - the user's rule is "40 reached and no bingo -> buy for 50 and
      // do the 10x the same day", and waiting for the phase to close pushed the
      // tail into the final days.
      const tenxWindowOpen = day > lastPhaseEnd || (isLastPhase && phaseSpendTasksDone);
      const useTenx = !firstTenxUsed && tenxWindowOpen && dia >= firstTenxCost
        && totalDraws >= 40 && totalDraws + 10 <= targetDraws;
      if (useTenx) {
        dia -= firstTenxCost;
        row.diaSpent += firstTenxCost;
        row.draws += 10;
        totalDraws += 10;
        firstTenxUsed = true;
        firstTenxDay = day;
        row.notes.push(FIRST_TENX_NOTE);
      } else if (dia >= dailyCost && row.draws === 0) {
        dia -= dailyCost;
        row.diaSpent += dailyCost;
        row.draws += 1;
        totalDraws += 1;
        row.notes.push('1x daily');
        if (!firstTenxUsed && targetDraws > 40 && totalDraws >= 40 && totalDraws + 10 <= targetDraws && dia >= firstTenxCost) {
          dia -= firstTenxCost;
          row.diaSpent += firstTenxCost;
          row.draws += 10;
          totalDraws += 10;
          firstTenxUsed = true;
          firstTenxDay = day;
          row.notes.push(FIRST_TENX_NOTE);
        }
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

  return { rows, totalDraws, finalDia: dia, phaseList, firstPhaseDay, lastPhaseEnd, milestonesClaimed, highestMilestone, firstTenxUsed, firstTenxDay };
}

export function buildAspirantsPlanWithPacks(event, packsData, targetDraws, resources = {}, extraDiaByDay = {}, rechargeDiaByDay = {}) {
  const sim = simulateAspirantsFixedShape(event, packsData, resources, extraDiaByDay, rechargeDiaByDay, targetDraws);
  const cost1xFull = event.draw_cost_1x;

  const finalRow = sim.rows[sim.rows.length - 1];
  let totalDraws = sim.totalDraws;
  let dia = sim.finalDia;
  let unaffordableDiaShortfall = 0;
  let firstTenxDay = sim.firstTenxDay ?? 0;

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
    const firstTenxCost = event.discount_draw_cost?.first_time_10x ?? event.draw_cost_10x;

    // Staged push, all on the final row. The win condition is checked at
    // 30/40/50 and a follower stops the moment the box completes, so the
    // notes sequence the tiers instead of blowing through them: (A) singles
    // up to exactly the 40-draw bingo checkpoint, (B) the first-time 10x for
    // the hop to exactly 50 (1050 dia = 10 x the discounted single -
    // cost-neutral, purely sequencing; skipped when the sim already spent its
    // gated 10x at the organic checkpoint), (C) singles to the target. The
    // natural 1/day cadence plus the orchestrator's starved-day top-ups do
    // the actual pacing - the push only closes what the calendar left open.
    const checkpoint = Math.min(40, targetDraws);
    if (totalDraws < checkpoint) {
      const n = Math.min(remaining, checkpoint - totalDraws);
      finalRow.notes.push(`Final push: ${n} single(s) \u2192 ${checkpoint} draws (bingo checkpoint \u2014 stop here if the box is complete)`);
      finalRow.draws += n;
      // Same-day singles beyond the day's first draw cost full price (only the
      // first draw of each day takes the 50% discount) - the user's hand plan
      // prices its last-day "1x + 3x singles" at 105 + 3x210 = 735.
      finalRow.diaSpent += n * cost1xFull;
      dia -= n * cost1xFull;
      totalDraws += n;
    }
    if (targetDraws > 40 && totalDraws === 40 && !sim.firstTenxUsed) {
      finalRow.notes.push(`Final push: ${FIRST_TENX_NOTE} \u2192 50 draws`);
      finalRow.draws += 10;
      finalRow.diaSpent += firstTenxCost;
      dia -= firstTenxCost;
      totalDraws += 10;
      firstTenxDay = finalRow.day;
    }
    const rest = Math.max(0, targetDraws - totalDraws);
    if (rest > 0) {
      finalRow.notes.push(`Final push: ${rest} single(s) \u2192 ${targetDraws} draws`);
      finalRow.draws += rest;
      finalRow.diaSpent += rest * cost1xFull;
      dia -= rest * cost1xFull;
      totalDraws += rest;
    }
    if (dia < 0) {
      unaffordableDiaShortfall = -dia;
      dia = 0;
    }
    finalRow.diaLeft = dia;
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
    // Day the first-time 10x actually landed on (0 = it never fired). Drives
    // the main-row/sub-row split of that day in the orchestrator.
    firstTenxDay,
  };
}

export function buildAspirantsPlan(event, packsData, targetDraws, resources = {}) {
  return buildAspirantsPlanWithPacks(event, packsData, targetDraws, resources, {}, {});
}
