// lib/planOrchestrator.js
// Part 5C-iv / Stage B — single entry point Part 7 calls, regardless of event.type.
// Branches to the correct calculator + scheduler functions per type, returns one
// normalized shape so StepFour.jsx doesn't need to know which event type it's showing.
//
// REWRITTEN 2026-07-23: replaces the scheduler.js-based day-by-day generation
// (starlightTiming/coaPrioritySpendPlan/themedCrestIdealPlan) AND a since-abandoned
// manual attempt at a greedy pass-purchase optimizer (buildGreedyPassPurchases/
// cheapestRechargeCombo), neither of which produced a reliable schedule. Both
// Collector and Themed Crest branches now call the verified idealSchedule
// simulators (lib/idealSchedule.collector.js, lib/idealSchedule.themedCrest.js),
// which reproduce hand-worked 0-resource reference plans exactly. See BUILD_PLAN.md
// "Part 7 REWRITE" for full verification methodology and confirmed rules.
//
// scheduler.js's starlightTiming(), coaPrioritySpendPlan(), themedCrestIdealPlan()
// are superseded for these two event types (left in scheduler.js, unused here, in
// case of rollback) — freeCrestsProjection, weeklyPassPlan, premiumSupplyWindowPlan,
// dailyDrawSchedule, milestoneTokenSchedule, finalPushPlan are still imported where
// still relevant (supply window display data, milestone display data).

import { drawsNeeded, bingoWinCondition } from "./calculator.js";
import {
    premiumSupplyWindowPlan,
    dailyDrawSchedule,
    milestoneTokenSchedule,
} from "./scheduler.js";
import { optimizeRecharge } from "./optimizer.js";
import { buildCollectorPlan as simulateCollectorPlan } from "./idealSchedule.collector.js";
import { buildThemedCrestPlan as simulateThemedCrestPlan } from "./idealSchedule.themedCrest.js";
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
// Collector branch
// ---------------------------------------------------------------------------

/**
 * @returns {{
 *   eventType, confidence, target, currentCrests, drawsNeeded, supplyWindows,
 *   milestones, daySchedule:{rows, totals}, recharge, warnings
 * }}
 */
function buildCollectorPlan(event, resources, target, ownedItems, confidence) {
    const { skin, targetCrests } = resolveTargetCrests(event, target);
    const ownedGroups = ownedItems?.groups ?? {};
    const ownedSkinIds = ownedItems?.skins ?? [];
    const currentCrests = 0;

    const draws = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, confidence);

    const startingDia = Number(resources?.diamonds ?? 0);
    const startingCoa = Number(resources?.coa ?? 0);
    const passCount = Number(resources?.weeklyPasses ?? 0);

    function totalShortfall(sim) {
        return sim.day1RechargeNeeded + sim.unaffordableDiaShortfall;
    }

    // Pass A: run with the user's actual starting resources first.
    let sim = simulateCollectorPlan(event, packsData, draws.draws, { startingDia, startingCoa, passCount });

    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };

    if (totalShortfall(sim) > 0) {
        // Pass B: search additional pass counts first (best dia/BDT ratio + feeds the CoA
        // box, not a like-for-like swap with generic packs — must be tried via full
        // re-simulation). Stop at the first count where BOTH shortfalls close to 0.
        let passOnlyCoversGap = false;
        let bestPassCount = passCount;
        for (let tryPasses = passCount + 1; tryPasses <= 10; tryPasses++) {
            const trial = simulateCollectorPlan(event, packsData, draws.draws, {
                startingDia, startingCoa, passCount: tryPasses,
            });
            if (totalShortfall(trial) === 0) {
                sim = trial;
                bestPassCount = tryPasses;
                passOnlyCoversGap = true;
                break;
            }
        }

        if (passOnlyCoversGap) {
            const extraPasses = bestPassCount - passCount;
            const passDia = packsData.weekly_pass?.dia_instant + packsData.weekly_pass?.dia_daily * packsData.weekly_pass?.days;
            recharge = {
                totalBdt: extraPasses * (packsData.weekly_pass?.bdt ?? 0),
                totalDia: extraPasses * passDia,
                completionDay: 1,
                packsUsed: [{ id: "weekly_pass", type: "pass", count: extraPasses, bdt: packsData.weekly_pass?.bdt, dia: passDia }],
                impossible: false,
            };
        } else {
            // Even 10 passes isn't enough — fall back to the generic knapsack optimizer
            // for whatever shortfall remains at max passes.
            const trial10 = simulateCollectorPlan(event, packsData, draws.draws, {
                startingDia, startingCoa, passCount: 10,
            });
            sim = trial10;
            const remainingShortfall = totalShortfall(trial10);
            if (remainingShortfall > 0) {
                recharge = optimizeRecharge(remainingShortfall, packsData, event.duration_days, resources);
            }
        }
    }

    const supplyWindows = premiumSupplyWindowPlan(event);
    const milestones = milestoneTokenSchedule(event, draws);

    return {
        eventType: event.type,
        confidence,
        target: { skin, targetCrests, outfit1: false },
        currentCrests,
        drawsNeeded: draws,
        supplyWindows,
        milestones,
        daySchedule: { rows: sim.rows, totals: computeCollectorTotals(sim.rows) },
        recharge,
        warnings: buildCollectorWarnings(sim),
    };
}

function computeCollectorTotals(rows) {
    return rows.reduce(
        (acc, r) => ({ draws: acc.draws + r.draws, dia: acc.dia + r.diaSpent, coa: acc.coa + r.coaSpent }),
        { draws: 0, dia: 0, coa: 0 }
    );
}

function buildCollectorWarnings(sim) {
    const warnings = [];
    if (sim.day1RechargeNeeded > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Starting diamonds don't cover the Day 1 spend-window plan — ${sim.day1RechargeNeeded} extra diamonds needed up front.`,
        });
    }
    if (sim.unaffordableDiaShortfall > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Free draws don't cover the target — ${sim.unaffordableDiaShortfall} extra diamonds needed on the final day.`,
        });
    }
    return warnings;
}

// ---------------------------------------------------------------------------
// Themed Crest / Legend / Special branch
// ---------------------------------------------------------------------------

/**
 * @returns {{
 *   eventType, confidence, target, currentCrests, drawsNeeded, supplyWindows,
 *   milestones, daySchedule:{rows, totals}, recharge, warnings
 * }}
 */
function buildThemedCrestPlan(event, resources, target, ownedItems, confidence) {
    const { skin, targetCrests } = resolveTargetCrests(event, target);
    const ownedGroups = ownedItems?.groups ?? {};
    const ownedSkinIds = ownedItems?.skins ?? [];
    const currentCrests = 0;

    const draws = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, confidence);

    const startingDia = Number(resources?.diamonds ?? 0);
    const passCount = Number(resources?.weeklyPasses ?? 0);

    function totalShortfall(sim) {
        return sim.day1RechargeNeeded + sim.unaffordableDiaShortfall;
    }

    let sim = simulateThemedCrestPlan(event, packsData, draws.draws, { startingDia, passCount });

    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };

    if (totalShortfall(sim) > 0) {
        let passOnlyCoversGap = false;
        let bestPassCount = passCount;
        for (let tryPasses = passCount + 1; tryPasses <= 10; tryPasses++) {
            const trial = simulateThemedCrestPlan(event, packsData, draws.draws, {
                startingDia, passCount: tryPasses,
            });
            if (totalShortfall(trial) === 0) {
                sim = trial;
                bestPassCount = tryPasses;
                passOnlyCoversGap = true;
                break;
            }
        }

        if (passOnlyCoversGap) {
            const extraPasses = bestPassCount - passCount;
            const passDia = packsData.weekly_pass?.dia_instant + packsData.weekly_pass?.dia_daily * packsData.weekly_pass?.days;
            recharge = {
                totalBdt: extraPasses * (packsData.weekly_pass?.bdt ?? 0),
                totalDia: extraPasses * passDia,
                completionDay: 1,
                packsUsed: [{ id: "weekly_pass", type: "pass", count: extraPasses, bdt: packsData.weekly_pass?.bdt, dia: passDia }],
                impossible: false,
            };
        } else {
            const trial10 = simulateThemedCrestPlan(event, packsData, draws.draws, {
                startingDia, passCount: 10,
            });
            sim = trial10;
            const remainingShortfall = totalShortfall(trial10);
            if (remainingShortfall > 0) {
                recharge = optimizeRecharge(remainingShortfall, packsData, event.duration_days, resources);
            }
        }
    }

    const supplyWindows = premiumSupplyWindowPlan(event);
    const milestones = milestoneTokenSchedule(event, draws);

    return {
        eventType: event.type,
        confidence,
        target: { skin, targetCrests, outfit1: !!target?.outfit1 },
        currentCrests,
        drawsNeeded: draws,
        supplyWindows,
        milestones,
        daySchedule: { rows: sim.rows, totals: computeThemedCrestTotals(sim.rows) },
        recharge,
        warnings: buildThemedCrestWarnings(sim),
    };
}

function computeThemedCrestTotals(rows) {
    return rows.reduce(
        (acc, r) => ({ draws: acc.draws + r.draws, dia: acc.dia + r.diaSpent }),
        { draws: 0, dia: 0 }
    );
}

function buildThemedCrestWarnings(sim) {
    const warnings = [];
    if (sim.day1RechargeNeeded > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Starting diamonds don't cover the first premium supply window — ${sim.day1RechargeNeeded} extra diamonds needed up front.`,
        });
    }
    if (sim.unaffordableDiaShortfall > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Free draws don't cover the target — ${sim.unaffordableDiaShortfall} extra diamonds needed on the final day.`,
        });
    }
    return warnings;
}

// ---------------------------------------------------------------------------
// Bingo branch (unchanged from previous versions)
// ---------------------------------------------------------------------------

function buildBingoPlan(event, resources, ownedItems, confidence) {
    const ownedSkinIds = ownedItems?.skins ?? [];

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