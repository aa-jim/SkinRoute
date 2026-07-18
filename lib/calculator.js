// lib/calculator.js
// Part 5A — Formula 1 (E[crests/draw]), Formula 2 (draws needed), Formula 3 (net diamonds needed)
// Ported from verified C++ references: soul_vessel.cpp (themed_crest) & collector.cpp (collector).
// Applies to: themed_crest, legend, special event types. Collector/Bingo formulas land in Part 5B.
//
// drop_rate convention: DECIMAL FRACTION (e.g. 0.0008 = 0.08%), matching STREET_FIGHTER_EVENT.md's
// confirmed events.json draft fields — NOT the C++ prototypes' console-input percent convention
// (which used 0.08 meaning 0.08% and divided by 100). No /100 division happens here.

export const REALISTIC_MULTIPLIER = 0.9; // confirmed — Soul Vessel real data
export const WORST_CASE_MULTIPLIER = 0.8; // confirmed — updated from 0.75

// Formula 2 divisor — which E[crests/draw] variant draws_needed() divides target by.
// C++ references disagree (soul_vessel.cpp uses Realistic, collector.cpp uses raw E).
// Locked to "optimistic" (raw E) for now per project decision — change this one constant
// to "realistic" to switch every draws_needed() call at once.
export const DRAWS_NEEDED_DIVISOR = "optimistic"; // "optimistic" | "realistic" | "worst"

/**
 * @typedef {"optimistic"|"realistic"|"worst"} Confidence
 */

function multiplierFor(confidence) {
  if (confidence === "optimistic") return 1.0;
  if (confidence === "worst") return WORST_CASE_MULTIPLIER;
  return REALISTIC_MULTIPLIER; // default "realistic"
}

/**
 * Formula 1 — Expected crests per draw.
 * E[crests/draw] = Σ ( itemProb_i × crest_value_i × dup_modifier_i )
 * itemProb_i weighted by quantity within its group (Option A, confirmed — matches C++ itemProb loop).
 * dup_modifier = owned / total_quantity (0 when unowned — no special case needed).
 * Direct "crest" type entries: full crest value always, no dup modifier (matches C++ `if (item=="crest")` branch).
 * "items" type (crest_value=0): contributes nothing regardless — handled naturally via crest_value*0.
 *
 * @param {object} event - full event object from events.json (must have prize_pool)
 * @param {object} ownedGroups - map of { [groupId]: ownedCount }, from wizardContext ownedItems.groups
 * @param {string[]} ownedSkinIds - array of owned shop_item skin ids, from wizardContext ownedItems.skins.
 *   Used only for prize_pool entries of type "skin_group" (target-tier skins, e.g. the 4 Street
 *   Fighter collab skins or Exquisite's 8 Collector+Luckybox skins) — a dup pull of an ALREADY-OWNED
 *   target skin converts to crests in-game, so ownership here must count toward E[crests/draw].
 * @returns {number} raw E[crests/draw] (optimistic value, mult=1.0)
 */
export function expectedCrestsPerDraw(event, ownedGroups = {}, ownedSkinIds = []) {
  if (!event || typeof event !== "object") {
    throw new Error("expectedCrestsPerDraw: event is required");
  }
  const pool = event.prize_pool;
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error(
      `expectedCrestsPerDraw: event "${event.id ?? "?"}" has no prize_pool array`
    );
  }

  let expectedValue = 0;

  for (const group of pool) {
    if (!group || typeof group !== "object") continue;

    const groupRate = group.drop_rate; // decimal fraction, e.g. 0.0008
    if (typeof groupRate !== "number") {
      throw new Error(
        `expectedCrestsPerDraw: group "${group.id}" missing numeric drop_rate`
      );
    }

    // Direct crest pool: itemProb = groupRate (whole group is one "item" conceptually),
    // crest_val = average of crest_values[] (equivalent to C++'s pre-averaged hardcoded value).
    if (group.type === "crest") {
      const values = Array.isArray(group.crest_values) ? group.crest_values : [];
      if (values.length === 0) {
        throw new Error(
          `expectedCrestsPerDraw: crest group "${group.id}" missing crest_values[]`
        );
      }
      const crestVal = values.reduce((a, b) => a + b, 0) / values.length;
      expectedValue += groupRate * crestVal;
      continue;
    }

    // Target-tier skin group (Street Fighter's 4 collab skins, Exquisite's 8 Collector+Luckybox skins):
    // one shared drop_rate across skin_ids.length items, dup value applies once ownership is confirmed
    // via ownedSkinIds (NOT ownedGroups — these skins are tracked individually, not as a plain counter,
    // since Step 2/3 UI lets the player pick/own specific named skins).
    if (group.type === "skin_group") {
      const skinIds = Array.isArray(group.skin_ids) ? group.skin_ids : [];
      if (skinIds.length === 0) {
        throw new Error(
          `expectedCrestsPerDraw: skin_group "${group.id}" missing skin_ids[]`
        );
      }
      const dupValue = group.dup_value ?? 0;
      const ownedCount = skinIds.filter((id) => ownedSkinIds.includes(id)).length;

      // Each individual skin's itemProb = groupRate × (1 / skinIds.length) — quantity-weighted,
      // same Option A logic as every other group. Dup modifier is shared-group-wide:
      // owned/total across the whole group (matches Exquisite's confirmed "same weighting logic
      // as Formula 1" rule for its shared Collector+Luckybox pool).
      const itemProb = groupRate; // sum across all skinIds.length equal-weighted items = groupRate
      const dupModifier = ownedCount / skinIds.length;

      expectedValue += itemProb * dupValue * dupModifier;
      continue;
    }

    const count = group.count ?? 1;
    if (count <= 0) {
      throw new Error(
        `expectedCrestsPerDraw: group "${group.id}" has invalid count (${count})`
      );
    }

    // itemProb = groupProb × (itemQuantity / total_individual_items_in_group).
    // Single-item-type groups (count is the only item type in that group): itemProb = groupRate.
    const itemProb = groupRate * (count / count); // = groupRate; kept explicit to mirror C++ shape

    const crestValue = group.crest_value ?? 0;
    const owned = ownedGroups[group.id] ?? 0;
    const dupModifier = owned / count;

    expectedValue += itemProb * crestValue * dupModifier;
  }

  return expectedValue;
}

/**
 * Returns { optimistic, realistic, worst } E[crests/draw] values.
 */
export function crestsPerDrawBreakdown(event, ownedGroups = {}, ownedSkinIds = []) {
  const raw = expectedCrestsPerDraw(event, ownedGroups, ownedSkinIds);
  return {
    optimistic: raw * 1.0,
    realistic: raw * REALISTIC_MULTIPLIER,
    worst: raw * WORST_CASE_MULTIPLIER,
  };
}

/**
 * Formula 2 — Draws needed to reach target_crests.
 * Divisor confidence level controlled by DRAWS_NEEDED_DIVISOR (currently "optimistic"/raw E,
 * matching collector.cpp; soul_vessel.cpp used Realistic — change the constant above to switch).
 *
 * Milestone rule (TECH_SPEC, confirmed): only subtract a "crests"-type milestone's reward from the
 * target if draws_needed (computed BEFORE subtraction) >= that milestone's draw threshold — at low
 * draw counts a late milestone genuinely isn't reachable and must not be counted. Token-type
 * milestones are NOT subtracted here; they feed freeTokens into Formula 3 instead.
 *
 * @param {object} event
 * @param {number} targetCrests - crest cost of target skin (+ addons, already summed by caller)
 * @param {number} currentCrests - crests already owned/banked
 * @param {object} ownedGroups
 * @param {string[]} ownedSkinIds
 * @returns {{draws:number, gapAfterMilestones:number, milestonesApplied:object[], effectiveE:number}}
 */
export function drawsNeeded(event, targetCrests, currentCrests = 0, ownedGroups = {}, ownedSkinIds = []) {
  if (typeof targetCrests !== "number" || targetCrests < 0) {
    throw new Error("drawsNeeded: targetCrests must be a non-negative number");
  }
  const rawE = expectedCrestsPerDraw(event, ownedGroups, ownedSkinIds);
  const effectiveE = rawE * multiplierFor(DRAWS_NEEDED_DIVISOR);

  if (effectiveE <= 0) {
    throw new Error(
      `drawsNeeded: E[crests/draw] is 0 for event "${event.id}" — cannot compute draws (all items owned & no crest pool?)`
    );
  }

  const initialGap = Math.max(0, targetCrests - currentCrests);
  const initialDraws = Math.ceil(initialGap / effectiveE);

  const milestones = Array.isArray(event.milestones) ? event.milestones : [];
  let milestoneCrestsToSubtract = 0;
  const milestonesApplied = [];

  for (const m of milestones) {
    if (m.reward_type !== "crests") continue; // token milestones handled in Formula 3
    if (initialDraws >= m.draws) {
      milestoneCrestsToSubtract += m.crests ?? 0;
      milestonesApplied.push(m);
    }
  }

  const gapAfterMilestones = Math.max(
    0,
    targetCrests - currentCrests - milestoneCrestsToSubtract
  );
  const draws = Math.ceil(gapAfterMilestones / effectiveE);

  return { draws, gapAfterMilestones, milestonesApplied, effectiveE };
}

/**
 * Formula 3 — Net diamonds needed after free draws (daily 1x across all event days + free tokens
 * from milestones/premium supply/etc — token estimation is a scheduler-level concern, so freeTokens
 * is supplied by the caller).
 *
 * @param {object} event
 * @param {number} targetCrests
 * @param {number} currentCrests
 * @param {object} ownedGroups
 * @param {string[]} ownedSkinIds
 * @param {number} freeTokens - total free draw tokens realistically received
 * @param {Confidence} confidence - which E multiplier to project free-crest yield with (default realistic)
 * @returns {{freeDrawsTotal:number, freeCrests:number, gapAfterFree:number, extraDrawsNeeded:number, netDiamondsNeeded:number}}
 */
export function netDiamondsNeeded(
  event,
  targetCrests,
  currentCrests = 0,
  ownedGroups = {},
  ownedSkinIds = [],
  freeTokens = 0,
  confidence = "realistic",
  startingCoa = 0
) {
  const duration = event.duration_days;
  if (!duration || duration <= 0) {
    throw new Error(`netDiamondsNeeded: event "${event.id}" missing valid duration_days`);
  }
  const drawCost1x = event.draw_cost_1x;
  if (!drawCost1x) {
    throw new Error(`netDiamondsNeeded: event "${event.id}" missing draw_cost_1x`);
  }

  const rawE = expectedCrestsPerDraw(event, ownedGroups, ownedSkinIds);
  const effectiveE = rawE * multiplierFor(confidence);

  if (effectiveE <= 0) {
    throw new Error(`netDiamondsNeeded: E[crests/draw] is 0 for event "${event.id}"`);
  }

  const freeDrawsTotal = duration + freeTokens;
  const freeCrests = freeDrawsTotal * effectiveE;
  const gapAfterFree = targetCrests - currentCrests - freeCrests;

  if (gapAfterFree <= 0) {
    return {
      freeDrawsTotal, freeCrests, gapAfterFree: 0, extraDrawsNeeded: 0,
      grossDiamondsNeeded: 0, coaOffset: 0, netDiamondsNeeded: 0,
    };
  }

  const extraDrawsNeeded = Math.ceil(gapAfterFree / effectiveE);
  const grossDia = extraDrawsNeeded * drawCost1x; // cost BEFORE CoA offset

  // CoA offset (Collector/Exquisite Collection ONLY — confirmed 1:1, CoA spent first,
  // diamonds cover the rest, per EXQUISITE_COLLECTION_EVENT.md "Currency Model").
  // Non-Collector events pass startingCoa=0 by default (or simply never pass it),
  // so this is a no-op everywhere else — non-breaking for existing callers.
  const coaOffset = event.type === "collector" ? Math.min(startingCoa, grossDia) : 0;
  const netDia = grossDia - coaOffset;

  return {
    freeDrawsTotal, freeCrests, gapAfterFree, extraDrawsNeeded,
    grossDiamondsNeeded: grossDia, coaOffset, netDiamondsNeeded: netDia,
  };
}

// ---------------------------------------------------------------------------
// Bingo — win-condition logic (KoF/KoF'97 line-bingo, Sanrio line-bingo, Aspirants hit-bingo)
// No probability formula: line/box completion uses a fixed real-world-confirmed draw distribution
// (PROJECT_BRIEF.md / TECH_SPEC.md), NOT derived from drop rates. Ownership of pool skins does NOT
// change the estimate — this is a cell/hit-completion mechanic, not a specific-item drop chance.
// v1.0 scope: single "any 1 skin" mode only — stops after first line/box completion. Specific-target-
// skin mode (geometric distribution) is explicitly OUT OF SCOPE, do not build (BUILD_PLAN.md 2026-07-15).
// ---------------------------------------------------------------------------

export const BINGO_DRAW_COSTS = Object.freeze({
  single: 100,
  tenx: 1000, // no bulk discount — exactly 10× single
  daily1x: 50, // 50% off, persists entire event regardless of skins obtained
  firstTenx: 500, // 50% off, ONE-TIME only
});

export const BINGO_DRAWS_PER_LINE = Object.freeze({
  lucky: { min: 30, max: 40 },
  realistic: 50,
  worst: 60,
});

/**
 * Determines whether this bingo event's guaranteed pity skin is still "live" (i.e. should be
 * factored into planning) or should be excluded because the player already owns it.
 *
 * @param {object} event - must have event.bingo per events.json schema
 * @param {string[]} ownedSkinIds - shop_items ids the player has already checked off as owned
 * @returns {{hasPity:boolean, pitySkinId:string|null, pitySkinName:string|null}}
 */
export function bingoPityStatus(event, ownedSkinIds = []) {
  const bingo = event?.bingo;
  if (!bingo) {
    throw new Error(`bingoPityStatus: event "${event?.id}" has no bingo config`);
  }
  const pityId = bingo.guaranteed_pity_skin_id ?? null;
  if (!pityId) {
    return { hasPity: false, pitySkinId: null, pitySkinName: null };
  }
  // Pity is void if the guaranteed skin is already owned — remove from pity, recalculate pool
  // (PROJECT_BRIEF.md "Edge Cases" / TECH_SPEC.md Bingo pity rule).
  if (ownedSkinIds.includes(pityId)) {
    return { hasPity: false, pitySkinId: pityId, pitySkinName: null };
  }
  const skinEntry = (bingo.skins ?? []).find((s) => s.id === pityId);
  return { hasPity: true, pitySkinId: pityId, pitySkinName: skinEntry?.name ?? pityId };
}

/**
 * Bingo win-condition calculation — single "any 1 skin" mode (v1.0 scope).
 * Returns the fixed draw-count distribution + diamond cost for completing 1 line/box, using the
 * standard draw priority order (daily 1x → free tokens → first-time 10x → full price).
 *
 * Diamond cost math mirrors soul_vessel.cpp/collector.cpp's scheduling section: daily 1x covers as
 * many draws as there are event days, remaining draws priced at 10x-batches + singles.
 *
 * @param {object} event
 * @param {number} freeTokens - free draw tokens from milestones/premium supply (Day 8 & 15 windows only)
 * @param {string[]} ownedSkinIds
 * @returns {{draws:{lucky:[number,number], realistic:number, worst:number}, pity:object, diamondCost:{lucky:number[], realistic:number, worst:number}}}
 */
export function bingoWinCondition(event, freeTokens = 0, ownedSkinIds = []) {
  if (event?.type !== "bingo") {
    throw new Error(`bingoWinCondition: event "${event?.id}" is not type "bingo"`);
  }
  const duration = event.duration_days;
  if (!duration || duration <= 0) {
    throw new Error(`bingoWinCondition: event "${event.id}" missing valid duration_days`);
  }

  const pity = bingoPityStatus(event, ownedSkinIds);

  function costFor(totalDraws) {
    const freeDrawsAvailable = Math.min(duration, totalDraws) + freeTokens; // daily 1x per day + tokens
    let remaining = Math.max(0, totalDraws - freeDrawsAvailable);

    // Daily 1x: up to `duration` draws at discounted rate (already counted as "free" above via
    // freeDrawsAvailable — here we price the discounted portion actually consumed).
    const dailyDrawsUsed = Math.min(duration, totalDraws);
    let cost = dailyDrawsUsed * BINGO_DRAW_COSTS.daily1x;

    // Remaining (non-daily, non-token) draws: first-time 10x discount applies once if not yet used,
    // then full-price 10x batches, then full-price singles for the remainder.
    if (remaining > 0) {
      // First-time 10x (one-time, covers 10 draws at 500 dia instead of 1000)
      const useFirstTenx = remaining >= 10;
      if (useFirstTenx) {
        cost += BINGO_DRAW_COSTS.firstTenx;
        remaining -= 10;
      }
      const tenxBatches = Math.floor(remaining / 10);
      cost += tenxBatches * BINGO_DRAW_COSTS.tenx;
      remaining -= tenxBatches * 10;
      cost += remaining * BINGO_DRAW_COSTS.single;
    }
    return cost;
  }

  return {
    draws: {
      lucky: [BINGO_DRAWS_PER_LINE.lucky.min, BINGO_DRAWS_PER_LINE.lucky.max],
      realistic: BINGO_DRAWS_PER_LINE.realistic,
      worst: BINGO_DRAWS_PER_LINE.worst,
    },
    pity,
    diamondCost: {
      lucky: [costFor(BINGO_DRAWS_PER_LINE.lucky.min), costFor(BINGO_DRAWS_PER_LINE.lucky.max)],
      realistic: costFor(BINGO_DRAWS_PER_LINE.realistic),
      worst: costFor(BINGO_DRAWS_PER_LINE.worst),
    },
  };
}