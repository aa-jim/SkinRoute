// lib/planOrchestrator.js
// Part 5C-iv / Stage B — single entry point Part 7 calls, regardless of event.type.
// Branches to the correct calculator + scheduler functions per type, returns one
// normalized shape so StepFour.jsx doesn't need to know which event type it's showing.
//
// Does NOT reimplement any calculation — pure composition of calculator.js +
// scheduler.js + coaSufficiency.js exports.

import { drawsNeeded, netDiamondsNeeded, bingoWinCondition, expectedCrestsPerDraw } from "./calculator.js";
import {
    freeCrestsProjection,
    weeklyPassPlan,
    premiumSupplyWindowPlan,
    dailyDrawSchedule,
    milestoneTokenSchedule,
    starlightTiming,
    coaPrioritySpendPlan,
    themedCrestIdealPlan,
    finalPushPlan,
} from "./scheduler.js";
import { optimizeRecharge } from "./optimizer.js";
import packsData from "@/data/packs.json";

/**
 * @param {object} event - full event object from events.json
 * @param {object} resources - wizardContext resources { diamonds, coa, weeklyPasses, firstPassDate, fpClaimed }
 * @param {object} target - wizardContext target { itemId, mode, outfit1 }
 * @param {object} ownedItems - wizardContext ownedItems { skins: [], groups: {} }
 * @param {"optimistic"|"realistic"|"worst"} confidence
 * @returns {object} normalized plan — shape documented per event.type branch below
 */
export function buildPlan(event, resources, target, ownedItems, confidence = "realistic") {
    if (event.type === "bingo") {
        return buildBingoPlan(event, resources, ownedItems, confidence);
    }
    if (event.type === "collector") {
        return buildCollectorPlan(event, resources, target, ownedItems, confidence);
    }
    // themed_crest, legend, special all share the same plan shape.
    return buildThemedCrestPlan(event, resources, target, ownedItems, confidence);
}

// ---------------------------------------------------------------------------
// Target crest cost resolution (shared by collector + themed_crest branches)
// ---------------------------------------------------------------------------

function resolveTargetCrests(event, target) {
    if (!target?.itemId) {
        throw new Error("buildPlan: no target skin selected");
    }
    const skin = (event.shop_items ?? []).find((s) => s.id === target.itemId);
    if (!skin) {
        throw new Error(`buildPlan: target skin "${target.itemId}" not found in event.shop_items`);
    }
    let cost = skin.crest_cost;
    if (target.outfit1 && skin.outfit1_variant) {
        cost += skin.outfit1_variant.crest_cost;
    }
    return { skin, targetCrests: cost };
}

// ---------------------------------------------------------------------------
// Themed Crest / Legend / Special branch
// ---------------------------------------------------------------------------

function buildThemedCrestPlan(event, resources, target, ownedItems, confidence) {
    const { skin, targetCrests } = resolveTargetCrests(event, target);
    const ownedGroups = ownedItems?.groups ?? {};
    const ownedSkinIds = ownedItems?.skins ?? [];
    const currentCrests = 0; // no crest-banking input in Step 1 UI yet — assumed 0, flagged below

    const draws = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds);
    const netDia = netDiamondsNeeded(
        event, targetCrests, currentCrests, ownedGroups, ownedSkinIds,
        estimateFreeTokens(event, draws.draws), confidence
    );

    // Weekly pass plan: naive default purchase schedule (Day 1 + each supply phase
    // start day) sized to how many passes the player already said they have —
    // Part 5D's optimizer decides the OPTIMAL count/timing; this is just the
    // as-entered resource projection for balance-gap and spend-window checks.
    const passCount = Number(resources?.weeklyPasses ?? 0);
    const supplyPhases = Array.isArray(event.premium_supply) ? event.premium_supply : [];
    const purchases = buildNaivePassPurchases(passCount, supplyPhases);
    const passPlan = weeklyPassPlan(packsData, event.duration_days, purchases);

    const idealPlan = themedCrestIdealPlan(event, resources, passPlan.dailyDiamondSchedule);
    const supplyWindows = premiumSupplyWindowPlan(event);
    const milestones = milestoneTokenSchedule(event, draws);
    const dailySchedule = dailyDrawSchedule(event);

    // Recharge optimizer — container = raw diamond need from netDiamondsNeeded, per
    // TECH_SPEC.md's confirmed rule (never pre-subtract FP).
    const recharge = netDia.netDiamondsNeeded > 0
        ? optimizeRecharge(netDia.netDiamondsNeeded, packsData, event.duration_days, resources)
        : { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };

    return {
        eventType: event.type,
        confidence,
        target: { skin, targetCrests, outfit1: !!target?.outfit1 },
        currentCrests,
        drawsNeeded: draws,
        netDiamondsNeeded: netDia,
        idealPlan,
        supplyWindows,
        milestones,
        dailySchedule,
        recharge,
        warnings: buildThemedCrestWarnings(idealPlan, netDia),
    };
}

function estimateFreeTokens(event, drawsEstimate) {
    // Sum reachable token-type milestones (calculator.js only subtracts crest-type
    // milestones; token milestones feed netDiamondsNeeded's freeTokens param, same
    // pattern as freeCrestsProjection() in scheduler.js).
    const milestones = Array.isArray(event.milestones) ? event.milestones : [];
    let tokens = 0;
    for (const m of milestones) {
        if (m.reward_type === "token" && drawsEstimate.draws >= m.draws) {
            tokens += m.tokens ?? 0;
        }
    }
    // Premium supply tokens: assume all reachable phases' max tokens are earned
    // (ideal-environment assumption — actual value refined once idealPlan phases
    // are computed, this is a first-pass estimate to feed netDiamondsNeeded).
    const supply = Array.isArray(event.premium_supply) ? event.premium_supply : [];
    for (const phase of supply) {
        for (const task of phase.tasks ?? []) {
            tokens += task.tokens ?? 0;
        }
    }
    return tokens;
}

function buildNaivePassPurchases(passCount, supplyPhases) {
    if (passCount <= 0) return [];
    // Split across Day 1 + each supply phase start day, per BUILD_PLAN.md's
    // "split pass purchases" rule — remainder goes to Day 1.
    const slots = [1, ...supplyPhases.map((p) => p.start_day)];
    const perSlot = Math.floor(passCount / slots.length);
    let remainder = passCount - perSlot * slots.length;
    return slots.map((day) => {
        const count = perSlot + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        return { count, buyDay: day };
    }).filter((p) => p.count > 0);
}

function buildThemedCrestWarnings(idealPlan, netDia) {
    const warnings = [];
    if (idealPlan.balanceGaps.hasGaps) {
        warnings.push({
            type: "balance_gap",
            message: `Starting diamonds too low on day ${idealPlan.balanceGaps.gaps[0].day} — recharge at least ${idealPlan.balanceGaps.gaps[0].shortfall} dia before then to not miss the daily 1x.`,
        });
    }
    if (netDia.netDiamondsNeeded > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Free draws don't cover the target — ${netDia.netDiamondsNeeded} extra diamonds needed.`,
        });
    }
    return warnings;
}

// ---------------------------------------------------------------------------
// Collector branch
// ---------------------------------------------------------------------------

function buildCollectorPlan(event, resources, target, ownedItems, confidence) {
    const { skin, targetCrests } = resolveTargetCrests(event, target);
    const ownedGroups = ownedItems?.groups ?? {};
    const ownedSkinIds = ownedItems?.skins ?? [];
    const currentCrests = 0;

    const draws = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds);

    const passCount = Number(resources?.weeklyPasses ?? 0);
    const supplyPhases = Array.isArray(event.premium_supply) ? event.premium_supply : [];
    const purchases = buildNaivePassPurchases(passCount, supplyPhases);
    const passPlan = weeklyPassPlan(packsData, event.duration_days, purchases);

    const starlight = starlightTiming(event, resources, passPlan.dailyDiamondSchedule);
    const spendPlan = coaPrioritySpendPlan(
        event, resources, targetCrests, currentCrests, ownedGroups, ownedSkinIds,
        passPlan.dailyDiamondSchedule, starlight.day
    );
    const supplyWindows = premiumSupplyWindowPlan(event);
    const milestones = milestoneTokenSchedule(event, draws);
    const dailySchedule = dailyDrawSchedule(event);

    return {
        eventType: event.type,
        confidence,
        target: { skin, targetCrests, outfit1: false },
        currentCrests,
        drawsNeeded: draws,
        starlight,
        spendPlan,
        supplyWindows,
        milestones,
        dailySchedule,
        warnings: buildCollectorWarnings(spendPlan),
    };
}

function buildCollectorWarnings(spendPlan) {
    const warnings = [];
    if (spendPlan.branch === "diamond_window_then_coa" && !spendPlan.spendEval.useFirst10x && spendPlan.spendEval.tierDailyOnly === null) {
        warnings.push({ type: "no_spend_tier_reached", message: "Current diamonds don't reach any spend-task tier." });
    }
    return warnings;
}

// ---------------------------------------------------------------------------
// Bingo branch
// ---------------------------------------------------------------------------

function buildBingoPlan(event, resources, ownedItems, confidence) {
    const ownedSkinIds = ownedItems?.skins ?? [];

    // Free tokens estimate — milestones + premium supply, same "ideal" assumption
    // as themed crest (all reachable phases' tokens earned).
    let freeTokens = 0;
    const milestones = Array.isArray(event.milestones) ? event.milestones : [];
    for (const m of milestones) {
        if (m.reward_type === "token") freeTokens += m.tokens ?? 0;
    }
    const supply = Array.isArray(event.premium_supply) ? event.premium_supply : [];
    for (const phase of supply) {
        for (const task of phase.tasks ?? []) freeTokens += task.tokens ?? 0;
    }

    const winCondition = bingoWinCondition(event, freeTokens, ownedSkinIds);
    const dailySchedule = dailyDrawSchedule(event);

    return {
        eventType: "bingo",
        confidence,
        winCondition,
        dailySchedule,
        warnings: [],
    };
}