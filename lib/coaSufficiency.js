// coaSufficiencyCheck() — Part A of the "Ideal Collector-event draw environment" rule
// (SCHEDULING_APPROACHES.md, confirmed 2026-07-19). Collector/Exquisite Collection ONLY.
//
// Tests whether CoA alone (no Starlight bonus, no diamond-spend-task keys) can realistically
// reach target crests across the full event. If yes, the caller (coaPrioritySpendPlan, Part B)
// skips the diamond-spend window AND Starlight entirely.
//
// "CoA alone" free-draw sources counted here:
//   - duration_days daily-1x draws, paid via CoA
//   - milestone TOKEN rewards reachable under a CoA-only draw pace (recomputed against the
//     draws this branch would actually produce, not the diamond-window draws_needed() figure)
//   - milestone CREST rewards (direct, e.g. Exquisite's draw-110 bonus) if reachable
// NOT counted (by definition of this branch):
//   - Starlight's +300 CoA / +2 keys (the thing we're deciding whether we need)
//   - spend-task keys (require diamonds — the thing we're deciding whether to skip)
//   - first-time 10x discount (a diamond-paid draw, out of scope for a CoA-only branch)

import { expectedCrestsPerDraw } from "./calculator.js";

const REALISTIC_MULTIPLIER = 0.9;

/**
 * @param {object} event - must be type "collector"
 * @param {number} targetCrests
 * @param {number} currentCrests
 * @param {number} startingCoa
 * @param {object} ownedGroups
 * @param {string[]} ownedSkinIds
 * @returns {{
 *   sufficient: boolean,
 *   coaOnlyDraws: number,
 *   coaCrestsProjected: number,
 *   shortfall: number,
 *   milestonesCountedTokens: object[],
 *   milestonesCountedCrests: object[]
 * }}
 */
export function coaSufficiencyCheck(event, targetCrests, currentCrests, startingCoa, ownedGroups = {}, ownedSkinIds = []) {
  if (event.type !== "collector") {
    throw new Error(`coaSufficiencyCheck: event "${event.id}" is not type "collector"`);
  }
  const duration = event.duration_days;
  if (!duration || duration <= 0) {
    throw new Error(`coaSufficiencyCheck: event "${event.id}" missing valid duration_days`);
  }

  const rawE = expectedCrestsPerDraw(event, ownedGroups, ownedSkinIds);
  const effectiveE = rawE * REALISTIC_MULTIPLIER;

  // How many draws can CoA alone fund across the whole event? Daily 1x costs the SAME whether
  // paid in diamonds or CoA (1:1 offset per EXQUISITE_COLLECTION_EVENT.md), so CoA-funded draw
  // count is simply startingCoa / discounted_daily_cost, capped at duration (can't draw more
  // than once per day at the discounted rate — full-price CoA singles beyond that are a
  // final-push concern, not part of this baseline sufficiency check).
  const dailyCost = event.discount_draw_cost?.daily_1x;
  if (!dailyCost) {
    throw new Error(`coaSufficiencyCheck: event "${event.id}" missing discount_draw_cost.daily_1x`);
  }

  const coaFundedDailyDraws = Math.min(duration, Math.floor(startingCoa / dailyCost));
  const coaSpentOnDaily = coaFundedDailyDraws * dailyCost;
  let coaRemaining = startingCoa - coaSpentOnDaily;

  // Surplus CoA (beyond the 1/day discounted slot) can still fund full-price singles —
  // the discounted daily rate is a per-day cap, not a spending cap. Without this, a player
  // sitting on far more CoA than the event needs would never register as "sufficient."
  const fullPriceCost = event.draw_cost_1x;
  if (!fullPriceCost) {
    throw new Error(`coaSufficiencyCheck: event "${event.id}" missing draw_cost_1x`);
  }
  const coaFundedExtraSingles = Math.floor(coaRemaining / fullPriceCost);
  coaRemaining -= coaFundedExtraSingles * fullPriceCost;

  // Recompute reachable milestones under THIS branch's own draw count (not diamond-window's
  // draws_needed) — a milestone-token-funded draw still counts as a "free" CoA-less draw, so we
  // iterate: start with coaFundedDailyDraws, add reachable token milestones, recheck, repeat
  // until stable (milestones can unlock more milestones once token draws push the count up).
  const milestones = Array.isArray(event.milestones) ? event.milestones : [];
  let totalDraws = coaFundedDailyDraws + coaFundedExtraSingles;
  const milestonesCountedTokens = [];
  const milestonesCountedCrests = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of milestones) {
      if (m.reward_type === "token" && !milestonesCountedTokens.includes(m) && totalDraws >= m.draws) {
        milestonesCountedTokens.push(m);
        totalDraws += m.tokens ?? 0;
        changed = true;
      }
    }
  }
  let directMilestoneCrests = 0;
  for (const m of milestones) {
    if (m.reward_type === "crests" && totalDraws >= m.draws) {
      milestonesCountedCrests.push(m);
      directMilestoneCrests += m.crests ?? 0;
    }
  }

  const coaCrestsProjected = totalDraws * effectiveE + directMilestoneCrests + currentCrests;
  const shortfall = Math.max(0, targetCrests - coaCrestsProjected);

  return {
    sufficient: shortfall === 0,
    coaOnlyDraws: totalDraws,
    coaCrestsProjected,
    shortfall,
    coaRemaining,
    milestonesCountedTokens,
    milestonesCountedCrests,
  };
}
