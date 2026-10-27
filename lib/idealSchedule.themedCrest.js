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

  // -------------------------------------------------------------------------
  // Opt-in special mechanics (`event.special_mechanics`).
  //
  // Only events that declare the block get these; every other event (Street
  // Fighter, JJK, Collector, Aspirants) parses `special === null` and runs the
  // exact code path it always has. The block models the draw-side extras that a
  // plain crest pool does not: the one-time mega-draw tokens, the promo-draw
  // day (promo diamonds + a small real-diamond top-up per draw), the recharge
  // rebate token and the consecutive-recharge streak, plus the early phase-token
  // claim (the hand schedule claims a phase the moment its tasks are satisfied
  // instead of waiting for the window to close).
  // -------------------------------------------------------------------------
  const special = event.special_mechanics ?? null;
  const megaDraw = special?.mega_draw ?? null;
  const promoDraw = special?.promo_draw ?? null;
  const rebate = special?.recharge_rebate ?? null;
  const streak = special?.streak_recharge ?? null;
  const claimEarly = special?.claim_tokens_early === true;
  const ft10xCost = special?.first_time_10x
    ? (event.discount_draw_cost?.first_time_10x ?? null)
    : null;
  let firstTenxUsed = false;
  let rebateHits = 0;
  let streakRun = 0;
  const streakTiersClaimed = new Set();

  const rows = [];
  let dia = 0;
  let totalDraws = 0;
  const milestonesClaimed = new Set();

  const passDailyDia = {};
  const passInstantDays = {};
  const passRechargeDays = {};
  const passRechargeValue = pass.recharge_task_value ?? pass.dia_instant;
  const skipBenefits = passesInBalance ?? (passCount > 0 && firstPassBuyDay <= 1 && startingDia >= passCount * pass.dia_instant + pass.dia_daily);

  // Purchase days, one entry per pass. Default: every pass is bought on
  // firstPassBuyDay (historical behaviour — byte-identical for every event that
  // doesn't opt in). Events may spread the purchases with resources.passBuyDays;
  // the orchestrator derives that from special_mechanics.pass_buy_days. A spread
  // is how the 11.11 plan covers the consecutive-recharge streak days with pass
  // purchases (100 recharge credit each on their own purchase day) instead of
  // buying throwaway packs on those days.
  //
  // The drip is still SEQUENTIAL (one pass runs its 7 days, then the next) — a
  // spread only moves each pass's instant payout and recharge credit. On a long
  // event whose drip queue already overruns the final day, moving a purchase a
  // few days later costs no drip at all (the queue was going to be full anyway).
  const passBuyDays = (passCount > 0 && Array.isArray(resources.passBuyDays) && resources.passBuyDays.length === passCount)
    ? resources.passBuyDays.map((d) => Math.min(Math.max(1, Math.round(Number(d) || 1)), duration))
    : null;

  if (!skipBenefits) {
    const buyDays = passBuyDays ?? (passCount > 0 ? new Array(passCount).fill(firstPassBuyDay) : []);
    for (const buyDay of buyDays) {
      if (buyDay < 1 || buyDay > duration) continue;
      passInstantDays[buyDay] = (passInstantDays[buyDay] ?? 0) + pass.dia_instant;
      passRechargeDays[buyDay] = (passRechargeDays[buyDay] ?? 0) + passRechargeValue;
    }
    let queueCursor = 0;
    for (const buyDay of buyDays) {
      if (buyDay > duration) continue;
      queueCursor = Math.max(queueCursor, buyDay);
      for (let d = 0; d < pass.days; d++) {
        const day = queueCursor + d;
        if (day > duration) break;
        if (day < 1) continue;
        passDailyDia[day] = (passDailyDia[day] ?? 0) + pass.dia_daily;
      }
      queueCursor += pass.days;
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

  function claimKeys(n, label, row) {
    if (n <= 0) return;
    // Free draws are still DRAWS: a plan that has already reached its crest
    // target must never book more of them, or the schedule total silently
    // exceeds `drawsNeeded` ("119 draws needed" vs a schedule summing 127 on
    // Street Fighter; 56 vs 99 on the 800-crest 11.11 skins). Claim only what
    // the target still needs and say so when the claim had to be trimmed.
    let take = n;
    let trimmed = false;
    if (typeof targetDraws === "number") {
      const remaining = Math.max(0, targetDraws - totalDraws);
      if (remaining <= 0) return;
      if (n > remaining) {
        take = remaining;
        trimmed = true;
      }
    }
    const plural = take > 1 ? "s" : "";
    const trimNote = trimmed ? ` — only ${take} of ${n} needed` : "";
    row.notes.push(`Claim ${take} token${plural} (${label}${trimNote}) → ${take} free draw${plural}`);
    row.draws += take;
    totalDraws += take;
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
    const data = { phase: phase.phase, pStartDay, endDay, rechargeTasks, spendTasks, loginTokens: loginTask?.tokens ?? 0, rechargeTotalTokens: rechargeTasks.reduce((s, t) => s + t.tokens, 0), highestRechargeThreshold: rechargeTasks.length > 0 ? rechargeTasks[rechargeTasks.length - 1].threshold : 0, claimed: false };
    phaseByOpenDay.set(pStartDay, data);
    phaseByCloseDay.set(endDay, data);
  }

  let activeWindowCumSpend = 0;
  let currentPhaseRecharge = 0;
  let activePhaseData = null;
  // Day the currently-active phase opened. Used to ACCUMULATE recharge over the
  // phase's own window (a pack bought on day 4 counts toward a phase that opened
  // on day 3) instead of reading only the start-day injection.
  let activePhaseStartDay = 0;
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
      activePhaseStartDay = startDay;
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
    // A finished plan stops drawing. Once the crest target is met there is
    // nothing left to fund, so the remaining days are not simulated at all —
    // the old behaviour kept booking a daily draw on every remaining day,
    // which is how a 56-draw target ended with a 99-draw schedule (and Street
    // Fighter's 120-draw target with 127). The summary card, the table footer
    // and the PDF now report one and the same number.
    if (typeof targetDraws === "number" && totalDraws >= targetDraws) break;

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
      activePhaseStartDay = day;
      announcedSpendThresholds = new Set();
    } else if (activePhaseData && day > activePhaseStartDay && day <= activePhaseData.endDay) {
      // Recharge landed INSIDE the phase's open window counts toward its tasks.
      // The orchestrator injects on the phase's start day, so this is a no-op for
      // every event that only buys there; it matters for events whose funding is
      // spread across the window (the 11.11 streak days).
      currentPhaseRecharge += rechargeDiaByDay[day] ?? 0;
    }

    // Start-day notes
    if (activePhaseData && (phaseOpenDays.has(day) || (midPhaseInitialized && day === startDay))) {
      if (activePhaseData.rechargeTasks.length > 0 && currentPhaseRecharge >= activePhaseData.highestRechargeThreshold) {
        row.notes.push(`All recharge tasks completed (${activePhaseData.rechargeTotalTokens} tokens)`);
      }
      if (!claimEarly) row.notes.push(`Don't claim any tokens until last day of phase ${activePhaseData.phase}`);
      if (midPhaseInitialized && day === startDay) midPhaseInitialized = false;
    }

    // Surprise window: cumulative recharge during the first active_days days
    // unlocks free draws (claim immediately, don't bank)
    if (surpriseWindowEnd > 0 && day >= 1 && day <= surpriseWindowEnd) {
      const rechargeToday = (rechargeDiaByDay[day] ?? 0) + (passRechargeDays[day] ?? 0);
      surpriseCumRecharge += rechargeToday;
      for (const t of surpriseTasks) {
        if (!surpriseClaimed.has(t.threshold) && surpriseCumRecharge >= t.threshold) {
          surpriseClaimed.add(t.threshold);
          claimKeys(t.tokens, `surprise recharge ${t.threshold} dia`, row);
        }
      }
    }

    // --- Special mechanics: recharge-day rebate + consecutive-recharge streak ---
    // A day counts when it carries at least `min_credit` of recharge — pack base
    // dia plus a pass's recharge_task_value on its purchase day, exactly what the
    // game credits toward the recharge progress bar.
    if (special && (rebate || streak)) {
      const minCredit = streak?.min_credit ?? rebate?.threshold_dia ?? 100;
      const rechargeToday = (rechargeDiaByDay[day] ?? 0) + (passRechargeDays[day] ?? 0);
      if (rechargeToday >= minCredit) {
        streakRun += 1;
        if (rebate && rebateHits < (rebate.max_hits ?? 3)) {
          rebateHits += 1;
          claimKeys(rebate.tokens ?? 1, "daily recharge rebate", row);
        }
        for (const tier of (streak?.tiers ?? [])) {
          if (!streakTiersClaimed.has(tier.days) && streakRun >= tier.days) {
            streakTiersClaimed.add(tier.days);
            claimKeys(tier.tokens ?? 0, `${tier.days}-day consecutive recharge`, row);
          }
        }
      } else {
        streakRun = 0;
      }
    }

    // --- Special mechanics: one-time mega-draw tokens ---
    if (megaDraw && day === megaDraw.day) {
      const costs = Array.isArray(megaDraw.costs) ? megaDraw.costs : [];
      const demand = typeof targetDraws === "number" ? Math.max(0, targetDraws - totalDraws) : costs.length;
      const n = Math.min(costs.length, megaDraw.tokens ?? costs.length, demand);
      if (n > 0) {
        const cost = costs.slice(0, n).reduce((s, c) => s + c, 0);
        dia -= cost;
        row.diaSpent += cost;
        row.draws += n;
        totalDraws += n;
        row.notes.push(`Buy ${n}x mega draw token${n > 1 ? "s" : ""} (${cost} dia) \u2192 ${n} draw${n > 1 ? "s" : ""}`);
      }
    }

    dia -= dailyCost;
    activeWindowCumSpend += dailyCost;
    row.diaSpent += dailyCost;
    row.draws += 1;
    totalDraws += 1;
    row.notes.push("1x daily");

    checkSpendThresholds(row);

    // --- Special mechanics: first-time 10x (once, at the daily-draw price) ---
    // Bulk draws at 50/draw instead of the 100/draw left over after the dailies.
    // Fires on the first day the balance covers it so a dia-poor plan claims it as
    // soon as the phase recharge lands, which is what the hand schedule does.
    if (ft10xCost != null && !firstTenxUsed && dia >= ft10xCost
        && (typeof targetDraws !== "number" || totalDraws + 10 <= targetDraws)) {
      dia -= ft10xCost;
      activeWindowCumSpend += ft10xCost;
      row.diaSpent += ft10xCost;
      row.draws += 10;
      totalDraws += 10;
      firstTenxUsed = true;
      row.notes.push(`1st-time 10x draw (${ft10xCost} dia, 50% off) \u2192 10 draws`);
      checkSpendThresholds(row);
    }

    // --- Special mechanics: promo draws (promo diamonds + a small real top-up) ---
    if (promoDraw && day === promoDraw.day) {
      const per = promoDraw.real_cost_per_draw ?? 0;
      const demand = typeof targetDraws === "number"
        ? Math.max(0, targetDraws - totalDraws)
        : (promoDraw.max_draws ?? 0);
      const n = Math.max(0, Math.min(promoDraw.max_draws ?? 0, demand));
      if (n > 0) {
        const cost = n * per;
        dia -= cost;
        activeWindowCumSpend += cost;
        row.diaSpent += cost;
        row.draws += n;
        totalDraws += n;
        row.notes.push(`Promo draws: ${n}x using ${promoDraw.promo_dia ?? 0} promo dia (+${cost} dia)`);
        checkSpendThresholds(row);
      }
    }

    // --- Special mechanics: claim a phase the moment every task is satisfied ---
    if (claimEarly && activePhaseData && !activePhaseData.claimed) {
      const rechargeDone = activePhaseData.rechargeTasks.every((t) => currentPhaseRecharge >= t.threshold);
      const spendDone = activePhaseData.spendTasks.every((t) => activeWindowCumSpend >= t.threshold);
      if (rechargeDone && spendDone) {
        const tokens = activePhaseData.loginTokens
          + activePhaseData.rechargeTasks.reduce((s, t) => s + t.tokens, 0)
          + activePhaseData.spendTasks.reduce((s, t) => s + t.tokens, 0);
        activePhaseData.claimed = true;
        claimKeys(tokens, `all tasks completed (phase ${activePhaseData.phase})`, row);
      }
    }

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
          // Never overshoot the target: buy only the singles the plan can still
          // use (a spend-task clear is still a real, full-price draw).
          const singlesOpened = typeof targetDraws === "number"
            ? Math.min(singlesNeeded, Math.max(0, targetDraws - totalDraws))
            : singlesNeeded;
          const cost = singlesOpened * cost1xFull;
          if (singlesOpened > 0) {
            dia -= cost;
            activeWindowCumSpend += cost;
            row.diaSpent += cost;
            row.draws += singlesOpened;
            totalDraws += singlesOpened;
            row.notes.push(`${singlesOpened} single(s) to clear spend tasks`);
          }
        }
      }

      checkSpendThresholds(row);

      if (!closingPhase.claimed) {
        let windowTokens = closingPhase.loginTokens;
        for (const t of closingPhase.spendTasks) windowTokens += t.tokens;
        for (const t of closingPhase.rechargeTasks) {
          if (currentPhaseRecharge >= t.threshold) {
            windowTokens += t.tokens;
          }
        }
        claimKeys(windowTokens, `All tasks completed`, row);
        closingPhase.claimed = true;
      }

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

  return {
    rows, totalDraws, finalDia: dia, minDiaBalance, milestones, milestonesClaimed,
    surpriseCumRecharge, surpriseClaimed: [...surpriseClaimed],
    // Diagnostics for the opt-in special mechanics (0 / false for every other event).
    firstTenxUsed, rebateHits, streakDays: streakRun, streakTiers: [...streakTiersClaimed],
    // Per-day pass bookkeeping (wallet drip / instant payout / recharge credit), so
    // the orchestrator's notes and the verifier can reconcile against the schedule.
    passBuyDays: passBuyDays ?? (passCount > 0 ? new Array(passCount).fill(firstPassBuyDay) : []),
    passDripByDay: { ...passDailyDia },
    passInstantByDay: { ...passInstantDays },
    passRechargeByDay: { ...passRechargeDays },
  };
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

  // Free-draw tokens never push a plan past its target — a claim is capped to
  // whatever `targetDraws` still needs. Without the cap the bonus tokens a final
  // push unlocked were ADDED on top of the finished plan, so the schedule total
  // exceeded the summary card's "Total Draws" (Street Fighter: 127 vs 120).
  const claimMilestone = (suffix = "") => {
    if (!finalRow || !highestMilestone || milestoneClaimed) return 0;
    // Only a milestone the plan actually REACHED pays out.
    if (totalDraws < highestMilestone.draws) return 0;
    const remaining = Math.max(0, targetDraws - totalDraws);
    const take = Math.min(highestMilestone.amount, remaining);
    if (take <= 0) return 0;
    finalRow.notes.push(`Claim ${take} tokens (milestone @ ${highestMilestone.draws} draws${suffix}) \u2192 ${take} free draws`);
    finalRow.draws += take;
    totalDraws += take;
    milestoneClaimed = true;
    return take;
  };

  // A milestone the plan already reached pays out first, so its tokens shrink
  // the push instead of being stacked on top of it.
  claimMilestone();

  let remaining = Math.max(0, targetDraws - totalDraws);

  // If the push itself will unlock the milestone, reserve its tokens for the
  // push — buying 10 paid draws when 10 free ones are one milestone away is
  // pure waste.
  let reservedBonus = 0;
  if (highestMilestone && !milestoneClaimed && remaining > 0 && totalDraws + remaining >= highestMilestone.draws) {
    reservedBonus = Math.min(highestMilestone.amount, remaining);
    remaining -= reservedBonus;
  }

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

  if (reservedBonus > 0) claimMilestone(", reached during final push");

  // Anything still unclaimed cannot be added any more: the plan is exactly at
  // its target, so an extra free draw would only make the schedule disagree
  // with the summary card. Mark it claimed so callers don't re-add it.
  if (highestMilestone && totalDraws >= highestMilestone.draws) milestoneClaimed = true;

  // The final push spends diamonds AFTER the simulator wrote its last row's
  // diaLeft, so without this the last row keeps the pre-push balance and every
  // themed-crest schedule overstates its closing balance by the push cost
  // (JJK 0 dia read "165 left" while the plan really ends with 15). The balance
  // identity the aspirants verifier enforces (prevLeft + add − spent = left)
  // fails on the last row without it.
  if (finalRow) finalRow.diaLeft = dia;

  return {
    rows: sim.rows,
    totalDraws,
    targetDraws,
    finalDia: dia,
    unaffordableDiaShortfall,
    surpriseCumRecharge: sim.surpriseCumRecharge ?? 0,
    surpriseClaimed: sim.surpriseClaimed ?? [],
    // Pass bookkeeping the orchestrator needs for per-day notes (and the special
    // verifier for reconciliation) — empty for events without passes.
    passBuyDays: sim.passBuyDays ?? [],
    passDripByDay: sim.passDripByDay ?? {},
    passInstantByDay: sim.passInstantByDay ?? {},
    passRechargeByDay: sim.passRechargeByDay ?? {},
    // Opt-in special-mechanic diagnostics.
    firstTenxUsed: sim.firstTenxUsed ?? false,
    rebateHits: sim.rebateHits ?? 0,
    streakDays: sim.streakDays ?? 0,
    streakTiers: sim.streakTiers ?? [],
  };
}

function buildThemedCrestPlan(event, packsData, targetDraws, resources = {}) {
  return buildThemedCrestPlanWithPacks(event, packsData, targetDraws, resources, {}, {});
}

module.exports = { simulateThemedCrestFixedShape, buildThemedCrestPlan, buildThemedCrestPlanWithPacks };
