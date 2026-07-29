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
    surpriseTaskProgress,
} from "./scheduler.js";
import { optimizeRecharge } from "./optimizer.js";
import { buildCollectorPlan as simulateCollectorPlan, buildCollectorPlanWithPacks } from "./idealSchedule.collector.js";
import { buildThemedCrestPlan as simulateThemedCrestPlan, buildThemedCrestPlanWithPacks } from "./idealSchedule.themedCrest.js";
import { buildAspirantsPlanWithPacks as simulateAspirantsPlanWithPacks, buildAspirantsPlan as simulateAspirantsPlan, distributePassPurchases } from "./idealSchedule.aspirants.js";
import packsData from "@/data/packs.json";

/**
 * Single entry point for all event types. Routes to the correct sub-planner.
 */
export function buildPlan(event, resources, target, ownedItems, confidence = "realistic") {
    if (event.type === "bingo") {
        return buildBingoPlan(event, resources, ownedItems, confidence);
    }
    if (event.type === "collector") {
        return buildCollectorPlan(event, resources, target, ownedItems, confidence);
    }
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

/**
 * Convert the user's passDaysRemaining (total days left across all owned passes,
 * as shown in-game) to an event-relative day number for the first pass purchase.
 * Formula: firstPassBuyDay = todayEventDay - (passCount * 7 - daysRemaining)
 * Defaults to 1 if no passes or missing input.
 */
function todayEventDay(event) {
    return Math.floor((Date.now() - new Date(event.start_date)) / 86400000) + 1;
}

function passFirstBuyDay(resources, event) {
    const rem = Number(resources?.passDaysRemaining);
    const count = Number(resources?.weeklyPasses ?? 0);
    if (!count || isNaN(rem)) return 1;
    const elapsed = count * 7 - rem;
    return Math.max(1, todayEventDay(event) - elapsed);
}

/**
 * Compute the total diamonds an extra batch of passes will actually contribute,
 * considering how many drip days fall within the event window.
 * @param {number} extraCount
 * @param {number} existingCount - passes already queued before this batch
 * @param {number} firstPassBuyDay
 * @param {object} pass - packsData.weekly_pass
 * @param {number} duration - event.duration_days
 * @returns {{ totalDia: number, dripDays: number, note: string }}
 */
function computeExtraPassDia(extraCount, existingCount, firstPassBuyDay, pass, duration) {
    const inst = pass.dia_instant;
    const daily = pass.dia_daily;
    const passDays = pass.days;
    let queueDay = firstPassBuyDay + existingCount * passDays;
    let totalDia = 0;
    let totalDripDays = 0;
    for (let i = 0; i < extraCount; i++) {
        if (queueDay > duration) break;
        totalDia += inst;
        const dripEnd = Math.min(queueDay + passDays - 1, duration);
        const dripDays = Math.max(0, dripEnd - queueDay + 1);
        totalDripDays += dripDays;
        totalDia += dripDays * daily;
        queueDay += passDays;
    }
    const totalInst = extraCount * inst;
    const day1Drip = (firstPassBuyDay + existingCount * passDays <= 1) ? daily : 0;
    const day1Total = totalInst + day1Drip;
    const note = extraCount === 1
        ? `Buy 1× weekly pass → ${inst} + ${day1Drip} = ${day1Total} dia`
        : `Buy ${extraCount}× weekly pass → ${totalInst} + ${day1Drip} = ${day1Total} dia`;
    return { totalDia, dripDays: totalDripDays, note };
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

    const drawsNeededAll = {
        optimistic: drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, "optimistic").draws,
        realistic: drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, "realistic").draws,
        worst: drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, "worst").draws,
    };

    const startingDia = Number(resources?.diamonds ?? 0);
    const startingCoa = Number(resources?.coa ?? 0);
    const passCount = Number(resources?.weeklyPasses ?? 0);
    const firstPassBuyDay = passFirstBuyDay(resources, event);
    const passData = packsData.weekly_pass;
    const passesInBalance = passCount > 0 && firstPassBuyDay <= 1
        && startingDia >= passCount * passData.dia_instant + passData.dia_daily;

    // Pass A: run with the user's actual starting resources first.
    let sim = simulateCollectorPlan(event, packsData, draws.draws, { startingDia, startingCoa, passCount, firstPassBuyDay, passesInBalance });

    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
    const rechargeEntries = [];

    let day1PackDia = 0;
    let finalDayPackDia = 0;
    let optimalPassCount = passCount;
    const day1Packs = [];
    const finalDayPacks = [];

    // Pass search: try higher pass counts one at a time, stop at first that closes
    // BOTH day-1 and final-day gaps to zero. Passes are searched before packs because
    // they also feed the CoA box (Collector). Only counts up to max useful passes are
    // tried — passes beyond that don't realize full drip value before event end.
    const totalSpan = event.duration_days - firstPassBuyDay + 1;
    const maxUsefulPasses = Math.min(Math.max(Math.floor(totalSpan / 7), 0), 10);
    const searchEnd = Math.max(passCount, maxUsefulPasses);

    if (sim.day1RechargeNeeded > 0 || sim.unaffordableDiaShortfall > 0) {
        for (let tryPasses = passCount; tryPasses <= searchEnd; tryPasses++) {
            const trial = simulateCollectorPlan(event, packsData, draws.draws, {
                startingDia, startingCoa, passCount: tryPasses, firstPassBuyDay, passesInBalance: false,
            });
            optimalPassCount = tryPasses;
            if (trial.day1RechargeNeeded === 0 && trial.unaffordableDiaShortfall === 0) {
                break;
            }
        }
    }

    const extraPasses = optimalPassCount - passCount;
    if (extraPasses > 0) {
        const passData = packsData.weekly_pass;
        const extraInfo = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days);
        rechargeEntries.push({
            id: "weekly_pass", type: "pass", count: extraPasses,
            bdt: passData?.bdt ?? 0,
            dia: extraInfo.totalDia / extraPasses,
        });
    }

    // Re-run sim with chosen pass count, then fill any remaining gaps with packs
    sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
        startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
    }, 0, 0);

    // Day-1 gap → packs (knapsack optimizer finds cheapest BDT combo)
    // Also size day-1 packs to enable Starlight on day 1 if affordable:
    // after Starlight (300) + remaining window drip must cover spend_500
    const supply = event.premium_supply;
    const phase = supply?.[0];
    const windowEnd = phase ? (phase.start_day ?? 1) + (phase.duration_days ?? 7) - 1 : Math.min(7, event.duration_days);
    const spendTasks = (phase?.tasks ?? []).filter(t => t.type?.startsWith("spend_"));
    const threshold = spendTasks.length > 0 ? spendTasks[spendTasks.length - 1].threshold_dia : 500;
    const hasPasses = optimalPassCount > 0;
    const passDiaDay1 = hasPasses ? optimalPassCount * passData.dia_instant + passData.dia_daily : 0;
    const futureDrip = hasPasses ? Math.max(0, windowEnd - 1) * passData.dia_daily : 0;
    const starlightExtra = hasPasses && sim.day1RechargeNeeded > 0
        ? Math.max(0, 300 + threshold - futureDrip - passDiaDay1 - startingDia)
        : 0;
    const day1Need = Math.max(sim.day1RechargeNeeded, starlightExtra);

    if (day1Need > 0) {
        const fix = optimizeRecharge(day1Need, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, resources);
        if (fix.packsUsed && !fix.impossible) {
            rechargeEntries.push(...fix.packsUsed);
            day1Packs.push(...fix.packsUsed);
            day1PackDia = fix.packsUsed.reduce((sum, e) => sum + e.count * e.dia, 0);
        }
    }

    // Re-run sim with day-1 pack diamonds so balances are accurate for final-day check
    sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
        startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
    }, day1PackDia, 0);

    // Final-day gap → packs
    if (sim.unaffordableDiaShortfall > 0) {
        const finalDayFix = optimizeRecharge(sim.unaffordableDiaShortfall, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, resources);
        if (finalDayFix.packsUsed && !finalDayFix.impossible) {
            rechargeEntries.push(...finalDayFix.packsUsed);
            finalDayPacks.push(...finalDayFix.packsUsed);
            finalDayPackDia = finalDayFix.packsUsed.reduce((sum, e) => sum + e.count * e.dia, 0);
            sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
                startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
            }, day1PackDia, finalDayPackDia);
        }
    }

    // Inject per-pack purchase notes into day 1 and final day rows (broken-down style)
    const fpLabel = { fp_50: "First Purchase Bonus 50 dias", fp_150: "First Purchase Bonus 150 dias", fp_250: "First Purchase Bonus 250 dias", fp_500: "First Purchase Bonus 500 dias" };
    if (day1Packs.length > 0 || extraPasses > 0) {
        const day1Row = sim.rows[0];
        const packNotes = [];
        if (extraPasses > 0) {
            const passData = packsData.weekly_pass;
            const extraInfo = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days);
            packNotes.push(extraInfo.note);
        }
        const sorted = [...day1Packs].sort((a, b) => (a.type === "fp" ? -1 : 1) - (b.type === "fp" ? -1 : 1));
        for (const e of sorted) {
            const name = fpLabel[e.id] || e.id.replace(/^r_/, '');
            const prefix = e.count > 1 ? `${e.count}× ` : '';
            packNotes.push(`Buy ${prefix}${name} dias pack (${e.count * e.bdt} BDT)`);
        }
        day1Row.notes.unshift(...packNotes);
    }
    if (finalDayPacks.length > 0) {
        const lastRow = sim.rows[sim.rows.length - 1];
        const packNotes = [];
        const sorted = [...finalDayPacks].sort((a, b) => (a.type === "fp" ? -1 : 1) - (b.type === "fp" ? -1 : 1));
        for (const e of sorted) {
            const name = fpLabel[e.id] || e.id.replace(/^r_/, '');
            const prefix = e.count > 1 ? `${e.count}× ` : '';
            packNotes.push(`Buy ${prefix}${name} dias pack (${e.count * e.bdt} BDT)`);
        }
        lastRow.notes.unshift(...packNotes);
    }

    if (rechargeEntries.length > 0) {
        const totalBdt = rechargeEntries.reduce((sum, p) => sum + p.count * p.bdt, 0);
        const totalDia = rechargeEntries.reduce((sum, p) => sum + p.count * p.dia, 0);
        recharge = { totalBdt, totalDia, completionDay: event.duration_days, packsUsed: rechargeEntries, impossible: false };
    }

    const supplyWindows = premiumSupplyWindowPlan(event);
    const milestones = milestoneTokenSchedule(event, draws);
    const totalDiamondsForPlan = startingDia + recharge.totalDia;

    return {
        eventType: event.type,
        confidence,
        target: { skin, targetCrests, outfit1: !!target?.outfit1 },
        currentCrests,
        drawsNeeded: draws,
        supplyWindows,
        milestones,
        drawsNeededAll,
        daySchedule: { rows: sim.rows, totals: computeCollectorTotals(sim.rows) },
        recharge,
        totalDiamondsForPlan,
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
            message: `Starting diamonds don't cover the Day 1 spend-window plan. See recharge plan to start drawing`,
        });
    }
    if (sim.unaffordableDiaShortfall > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Free draws don't cover the target. ${sim.unaffordableDiaShortfall} extra diamonds needed on the final day.`,
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

    const drawsNeededAll = {
        optimistic: drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, "optimistic").draws,
        realistic: drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, "realistic").draws,
        worst: drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, "worst").draws,
    };

    const startingDia = Number(resources?.diamonds ?? 0);
    const passCount = Number(resources?.weeklyPasses ?? 0);
    const firstPassBuyDay = passFirstBuyDay(resources, event);
    const wp = packsData.weekly_pass;
    const passesInBalance = passCount > 0 && firstPassBuyDay <= 1
        && startingDia >= passCount * wp.dia_instant + wp.dia_daily;

    let sim = simulateThemedCrestPlan(event, packsData, draws.draws, { startingDia, passCount, firstPassBuyDay, passesInBalance });

    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
    const rechargeEntries = [];
    let optimalPassCount = passCount;

    const supply = event.premium_supply ?? [];
    const firstPhaseStartDay = supply.length > 0 ? Math.min(...supply.map(p => p.start_day)) : event.duration_days + 1;

    // Pass search: try higher pass counts one at a time, stop at first that keeps
    // the pre-window balance non-negative AND has no final-day shortfall.
    const totalSpan = event.duration_days - firstPassBuyDay + 1;
    const maxUsefulPasses = Math.min(Math.max(Math.floor(totalSpan / 7), 0), 10);
    const searchEnd = Math.max(passCount, maxUsefulPasses);

    function preWindowMinBalance(rows) {
        const pre = rows.filter(r => r.day < firstPhaseStartDay);
        if (pre.length === 0) return Infinity;
        return pre.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);
    }

    const passSearchNeeded = sim.unaffordableDiaShortfall > 0 || preWindowMinBalance(sim.rows) < 0;
    if (passSearchNeeded) {
        for (let tryPasses = passCount; tryPasses <= searchEnd; tryPasses++) {
            const trial = simulateThemedCrestPlan(event, packsData, draws.draws, {
                startingDia, passCount: tryPasses, firstPassBuyDay, passesInBalance: false,
            });
            optimalPassCount = tryPasses;
            if (preWindowMinBalance(trial.rows) >= 0 && trial.unaffordableDiaShortfall === 0) {
                break;
            }
        }
    }

    const extraPasses = optimalPassCount - passCount;
    if (extraPasses > 0) {
        const passData = packsData.weekly_pass;
        const extraInfo = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days);
        rechargeEntries.push({
            id: "weekly_pass", type: "pass", count: extraPasses,
            bdt: passData?.bdt ?? 0,
            dia: extraInfo.totalDia / extraPasses,
        });
    }

    // -----------------------------------------------------------------------
    // Build external diamond injection schedule (extraDiaByDay)
    // The orchestrator determines ALL pack/pass diamonds and injects them at
    // the correct days. The simulator does not calculate its own recharge.
    // -----------------------------------------------------------------------
    const extraDiaByDay = {};
    const rechargeDiaByDay = {};
    const packsByDay = new Map();
    const fpLabel = { fp_50: "First Purchase Bonus 50 dias", fp_150: "First Purchase Bonus 150 dias", fp_250: "First Purchase Bonus 250 dias", fp_500: "First Purchase Bonus 500 dias" };
    const usedFpClaimed = { ...(resources?.fpClaimed ?? {}) };

    function getHighestRechargeThreshold(phase) {
        const tasks = (phase.tasks ?? []).filter(t => t.type?.startsWith("recharge_"));
        return tasks.reduce((max, t) => Math.max(max, t.threshold_dia ?? 0), 0);
    }

    function addPacksToDay(day, needs, rechargeMode = false) {
        const fix = optimizeRecharge(needs, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, { fpClaimed: usedFpClaimed }, rechargeMode);
        if (fix.packsUsed && !fix.impossible) {
            for (const p of fix.packsUsed) {
                if (p.type === "fp") usedFpClaimed[p.id] = true;
            }
            rechargeEntries.push(...fix.packsUsed);
            if (!packsByDay.has(day)) packsByDay.set(day, []);
            packsByDay.get(day).push(...fix.packsUsed);
            extraDiaByDay[day] = (extraDiaByDay[day] || 0) + fix.totalDia;
            // FP packs: only base dia counts toward recharge (bonus/extra don't)
            let rechargeDia = 0;
            for (const p of fix.packsUsed) {
                const fpDef = p.type === "fp" ? packsData.first_purchase?.find(f => f.id === p.id) : null;
                rechargeDia += (fpDef ? fpDef.dia_base : p.dia) * p.count;
            }
            rechargeDiaByDay[day] = (rechargeDiaByDay[day] || 0) + rechargeDia;
        }
    }

    // Re-run sim with chosen pass count
    sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
        startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
    }, extraDiaByDay, rechargeDiaByDay);

    // Step A: Pre-window (day-1) gap
    const pwMin = preWindowMinBalance(sim.rows);
    if (pwMin < 0) {
        addPacksToDay(1, -pwMin);
    }

    // Surprise task: decide on day-1 pack sizing for 750 threshold
    // Condition: totalRechargeDia - passDiaForSurprise - premiumMinRecharge >= 750
    const premiumMinRecharge = supply.reduce((sum, phase) => sum + getHighestRechargeThreshold(phase), 0);
    const passDiaForSurprise = optimalPassCount * 100;

    // Step B: Per-phase recharge loop
    // For each premium supply phase, inject enough on the phase start day to
    // cover the phase's recharge tasks AND any shortfall through the event end.
    // Loop converges because FP packs only contribute their base dia to recharge,
    // so multiple iterations may be needed to meet the threshold.
    for (const phase of supply) {
        let safety = 0;
        while (safety++ < 5) {
            sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
                startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
            }, extraDiaByDay, rechargeDiaByDay);

            const phaseRows = sim.rows.filter(r => r.day >= phase.start_day);
            const phaseMinBalance = phaseRows.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);

            const existingRecharge = rechargeDiaByDay[phase.start_day] || 0;
            const minForTasks = Math.max(0, getHighestRechargeThreshold(phase) - existingRecharge);
            const deficit = Math.max(0, -phaseMinBalance);
            const totalNeed = Math.max(minForTasks, deficit);

            if (totalNeed <= 0) break;
            addPacksToDay(phase.start_day, totalNeed, true);
        }
    }

    // Step C: Final-day gap
    sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
        startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
    }, extraDiaByDay, rechargeDiaByDay);

    if (sim.unaffordableDiaShortfall > 0) {
        const finalInjectionDay = supply.length > 0 ? event.duration_days : 1;
        addPacksToDay(finalInjectionDay, sim.unaffordableDiaShortfall);
        sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
            startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
        }, extraDiaByDay, rechargeDiaByDay);
    }

    // Surprise task: 750 threshold sizing
    // Only size up to 750 if net recharge beyond pass value and premium min >= 750
    if (event.has_surprise_tasks) {
        const totalRechargeDia = rechargeEntries.reduce((sum, p) => sum + p.count * p.dia, 0);
        const netForSurprise = totalRechargeDia - passDiaForSurprise - premiumMinRecharge;
        if (netForSurprise >= 750) {
            const surprise750Target = 750 + passDiaForSurprise + premiumMinRecharge;
            if (totalRechargeDia < surprise750Target) {
                addPacksToDay(1, surprise750Target - totalRechargeDia);
                sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
                    startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance,
                }, extraDiaByDay, rechargeDiaByDay);
            }
        }
    }

    // Merge same-id packs and build recharge summary
    if (rechargeEntries.length > 0) {
        const merged = new Map();
        for (const p of rechargeEntries) {
            const key = p.id;
            if (merged.has(key)) {
                merged.get(key).count += p.count;
            } else {
                merged.set(key, { ...p });
            }
        }
        const mergedPacks = Array.from(merged.values());
        const totalBdt = mergedPacks.reduce((sum, p) => sum + p.count * p.bdt, 0);
        const totalDia = mergedPacks.reduce((sum, p) => sum + p.count * p.dia, 0);
        recharge = { totalBdt, totalDia, completionDay: event.duration_days, packsUsed: mergedPacks, impossible: false };
    }

    // Compute surprise ladder
    const surpriseLadder = event.has_surprise_tasks
        ? surpriseTaskProgress(event, recharge.totalDia)
        : { applicable: false, type: null, tiersCrossed: [], note: "" };

    // -----------------------------------------------------------------------
    // Inject per-pack purchase notes into the correct day rows
    // -----------------------------------------------------------------------
    const day1PassNote = extraPasses > 0
        ? computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, packsData.weekly_pass, event.duration_days).note
        : null;

    if (day1PassNote) {
        const row = sim.rows[0];
        if (row) row.notes.unshift(day1PassNote);
    }

    for (const [day, packs] of packsByDay) {
        const row = sim.rows[day - 1];
        const notes = [];
        const sorted = [...packs].sort((a, b) => (a.type === "fp" ? -1 : 1) - (b.type === "fp" ? -1 : 1));
        for (const e of sorted) {
            const name = fpLabel[e.id] || e.id.replace(/^r_/, '');
            const prefix = e.count > 1 ? `${e.count}\u00d7 ` : '';
            notes.push(`Buy ${prefix}${name} dias pack (${e.count * e.bdt} BDT)`);
        }
        row.notes.unshift(...notes);
    }

    // Day 1 surprise tier notes — only tasks that give tokens
    if (surpriseLadder.applicable && surpriseLadder.tiersCrossed.length > 0) {
        const row = sim.rows[0];
        if (row) {
            for (const t of surpriseLadder.tiersCrossed) {
                const tokens = typeof t === 'object' ? (t.tokens ?? 0) : 0;
                if (tokens > 0) {
                    const threshold = typeof t === 'object' ? (t.threshold_dia ?? 0) : 0;
                    row.notes.push(`Claim ${tokens} token${tokens > 1 ? 's' : ''} (surprise recharge ${threshold} dia) → ${tokens} free draw${tokens > 1 ? 's' : ''}`);
                }
            }
        }
    }

    const supplyWindows = premiumSupplyWindowPlan(event);
    const milestones = milestoneTokenSchedule(event, draws);
    const totalDiamondsForPlan = startingDia + recharge.totalDia;
    const netDiamondsNeeded = { netDiamondsNeeded: recharge.totalDia };

    return {
        eventType: event.type,
        confidence,
        target: { skin, targetCrests, outfit1: !!target?.outfit1 },
        currentCrests,
        drawsNeeded: draws,
        drawsNeededAll,
        supplyWindows,
        milestones,
        daySchedule: { rows: sim.rows, totals: computeThemedCrestTotals(sim.rows) },
        recharge,
        totalDiamondsForPlan,
        netDiamondsNeeded,
        surpriseLadder,
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
    if (sim.unaffordableDiaShortfall > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Free draws don't cover the target. ${sim.unaffordableDiaShortfall} extra diamonds needed on the final day.`,
        });
    }
    return warnings;
}

// ---------------------------------------------------------------------------
// Helpers for bingo + themed-crest shared schedule building
// ---------------------------------------------------------------------------

function normalizeEventForSim(event) {
    return {
        ...event,
        premium_supply: Array.isArray(event.premium_supply) ? event.premium_supply : [],
        milestones: Array.isArray(event.milestones) ? event.milestones : [],
    };
}

function computeBingoTotals(rows) {
    return rows.reduce(
        (acc, r) => ({ draws: acc.draws + r.draws, dia: acc.dia + r.diaSpent }),
        { draws: 0, dia: 0 }
    );
}

// ---------------------------------------------------------------------------
// Bingo branch — themed-crest-style schedule using bingo's worst-case draws
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
    const targetDraws = winCondition.draws.worst;

    const simEvent = normalizeEventForSim(event);

    const startingDia = Number(resources?.diamonds ?? 0);
    const passCount = Number(resources?.weeklyPasses ?? 0);
    const firstPassBuyDay = passFirstBuyDay(resources, event);
    const wp = packsData.weekly_pass;
    const passesInBalance = passCount > 0 && firstPassBuyDay <= 1
        && startingDia >= passCount * wp.dia_instant + wp.dia_daily;

    // Aspirants uses a specialized simulator (different draw/claim pattern)
    const isAspirants = event.id === "aspirants_2026";

    function simPlain(res) {
        return isAspirants
            ? simulateAspirantsPlan(event, packsData, targetDraws, res)
            : simulateThemedCrestPlan(simEvent, packsData, targetDraws, res);
    }

    function simWithPacks(res, extra, rechargeExtra) {
        return isAspirants
            ? simulateAspirantsPlanWithPacks(event, packsData, targetDraws, res, extra, rechargeExtra)
            : buildThemedCrestPlanWithPacks(simEvent, packsData, targetDraws, res, extra, rechargeExtra);
    }

    let sim = simPlain({ startingDia, passCount, firstPassBuyDay, passesInBalance });

    let rechargeEntries = [];
    let optimalPassCount = passCount;

    const supplyArray = supply;
    const firstPhaseStartDay = supplyArray.length > 0
        ? Math.min(...supplyArray.map(p => p.start_day))
        : event.duration_days + 1;

    function preWindowMinBalance(rows) {
        const pre = rows.filter(r => r.day < firstPhaseStartDay);
        if (pre.length === 0) return Infinity;
        return pre.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);
    }

    const totalSpan = event.duration_days - firstPassBuyDay + 1;
    const divisor = isAspirants ? Math.ceil(totalSpan / 7) : Math.floor(totalSpan / 7);
    const maxUsefulPasses = Math.min(Math.max(divisor, 0), 10);
    const searchEnd = Math.max(passCount, maxUsefulPasses);

    // Pass search always uses passesInBalance=false (distributed). When the user's
    // passes are already in balance (all pre-owned, stacked on firstPassBuyDay),
    // the search overestimates extra pass value — skip it.
    if (!passesInBalance && (sim.unaffordableDiaShortfall > 0 || preWindowMinBalance(sim.rows) < 0)) {
        for (let tryPasses = passCount; tryPasses <= searchEnd; tryPasses++) {
            const trial = simPlain({
                startingDia, passCount: tryPasses, firstPassBuyDay, passesInBalance: false,
            });
            optimalPassCount = tryPasses;
            if (preWindowMinBalance(trial.rows) >= 0 && trial.unaffordableDiaShortfall === 0) {
                break;
            }
        }
    }

    const extraPasses = optimalPassCount - passCount;
    if (extraPasses > 0) {
        const passData = packsData.weekly_pass;
        const extraInfo = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days);
        rechargeEntries.push({
            id: "weekly_pass", type: "pass", count: extraPasses,
            bdt: passData?.bdt ?? 0,
            dia: extraInfo.totalDia / extraPasses,
        });
    }

    const extraDiaByDay = {};
    const rechargeDiaByDay = {};
    const packsByDay = new Map();
    const fpLabel = { fp_50: "First Purchase Bonus 50 dias", fp_150: "First Purchase Bonus 150 dias", fp_250: "First Purchase Bonus 250 dias", fp_500: "First Purchase Bonus 500 dias" };
    const usedFpClaimed = { ...(resources?.fpClaimed ?? {}) };

    function addPacksToDay(day, needs, rechargeMode = false) {
        const fix = optimizeRecharge(needs, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, { fpClaimed: usedFpClaimed }, rechargeMode);
        if (fix.packsUsed && !fix.impossible) {
            for (const p of fix.packsUsed) {
                if (p.type === "fp") usedFpClaimed[p.id] = true;
            }
            rechargeEntries.push(...fix.packsUsed);
            if (!packsByDay.has(day)) packsByDay.set(day, []);
            packsByDay.get(day).push(...fix.packsUsed);
            extraDiaByDay[day] = (extraDiaByDay[day] || 0) + fix.totalDia;
            // FP packs: only base dia counts toward recharge (bonus/extra don't)
            let rechargeDia = 0;
            for (const p of fix.packsUsed) {
                const fpDef = p.type === "fp" ? packsData.first_purchase?.find(f => f.id === p.id) : null;
                rechargeDia += (fpDef ? fpDef.dia_base : p.dia) * p.count;
            }
            rechargeDiaByDay[day] = (rechargeDiaByDay[day] || 0) + rechargeDia;
        }
    }

    sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);

    const pwMin = preWindowMinBalance(sim.rows);
    if (pwMin < 0) {
        addPacksToDay(1, -pwMin);
    }

    function getHighestRechargeThreshold(phase) {
        const tasks = (phase.tasks ?? []).filter(t => t.type?.startsWith("recharge_"));
        return tasks.reduce((max, t) => Math.max(max, t.threshold_dia ?? 0), 0);
    }

    for (const phase of supplyArray) {
        let safety = 0;
        while (safety++ < 5) {
            sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);

            const phaseRows = sim.rows.filter(r => r.day >= phase.start_day);
            const phaseMinBalance = phaseRows.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);
            let existingRecharge = rechargeDiaByDay[phase.start_day] || 0;

            // For Aspirants, passes bought on phase start day also contribute recharge value.
            // When passesInBalance=true, all passes are stacked on firstPassBuyDay (pre-event) and
            // their recharge is subtracted inside the simulator — so no pass recharge on phase days.
            if (isAspirants && !passesInBalance) {
                const passRechargeVal = packsData.weekly_pass?.recharge_task_value ?? packsData.weekly_pass?.dia_instant ?? 0;
                const phaseStarts = supplyArray.map(p => p.start_day).sort((a, b) => a - b);
                const dist = distributePassPurchases(optimalPassCount, firstPassBuyDay, phaseStarts);
                const passCountOnDay = dist.find(d => d.day === phase.start_day)?.count ?? 0;
                existingRecharge += passCountOnDay * passRechargeVal;
            }

            const minForTasks = Math.max(0, getHighestRechargeThreshold(phase) - existingRecharge);

            // Balance shortfall from daily deficit (non-negative since diaLeft is always >= 0)
            const balanceNeed = Math.max(0, -phaseMinBalance);

            if (minForTasks <= 0 && balanceNeed <= 0) break;

            // Recharge need: must use rechargeMode=true so FP weight = dia_base
            if (minForTasks > 0) {
                let need = minForTasks;
                if (isAspirants && phase.start_day >= 15 && need < 257) need = 257;
                addPacksToDay(phase.start_day, need, true);
            }
            // Balance need: use rechargeMode=false so FP weight = total (cheaper per dia)
            if (balanceNeed > 0) {
                addPacksToDay(phase.start_day, balanceNeed, false);
            }
        }
    }

    sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);

    if (isAspirants && sim.unaffordableDiaShortfall > 0) {
        // First ensure the 10x draw on Day 20 is affordable — missing it cascades
        // into many more missed draws and a much larger shortfall.
        const day19 = sim.rows.find(r => r.day === 19);
        const day19Dia = day19?.diaLeft ?? 0;
        const tenxCost = event.discount_draw_cost?.first_time_10x ?? event.draw_cost_10x;
        if (tenxCost > 0) {
            // Pass drip on Day 20: sequential passes stack, so compute if any pass
            // is still active on day 20.
            const lastDripDay = firstPassBuyDay + optimalPassCount * wp.days;
            const day20Drip = 20 <= lastDripDay ? wp.dia_daily : 0;
            const estDay20Dia = day19Dia + (extraDiaByDay[20] ?? 0) + day20Drip;
            const tenxGap = Math.max(0, tenxCost - estDay20Dia);
            if (tenxGap > 0) {
                addPacksToDay(20, tenxGap);
                sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);
            }
        }

        if (sim.unaffordableDiaShortfall > 0) {
            addPacksToDay(21, sim.unaffordableDiaShortfall);
            sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);
        }

        if (sim.unaffordableDiaShortfall > 0) {
            addPacksToDay(31, sim.unaffordableDiaShortfall);
            sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);
        }
    }

    if (!isAspirants && sim.unaffordableDiaShortfall > 0) {
        const injectionDay = supplyArray.length > 0 ? event.duration_days : 1;
        addPacksToDay(injectionDay, sim.unaffordableDiaShortfall);
        sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance }, extraDiaByDay, rechargeDiaByDay);
    }

    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
    if (rechargeEntries.length > 0) {
        const merged = new Map();
        for (const p of rechargeEntries) {
            const key = p.id;
            if (merged.has(key)) {
                merged.get(key).count += p.count;
            } else {
                merged.set(key, { ...p });
            }
        }
        const mergedPacks = Array.from(merged.values());
        const totalBdt = mergedPacks.reduce((sum, p) => sum + p.count * p.bdt, 0);
        const totalDia = mergedPacks.reduce((sum, p) => sum + p.count * p.dia, 0);
        recharge = { totalBdt, totalDia, completionDay: event.duration_days, packsUsed: mergedPacks, impossible: false };
    }

    if (extraPasses > 0) {
        if (isAspirants) {
            const phaseStarts = supplyArray.map(p => p.start_day).sort((a, b) => a - b);
            const totalP = distributePassPurchases(optimalPassCount, firstPassBuyDay, phaseStarts);
            const initP = distributePassPurchases(passCount, firstPassBuyDay, phaseStarts);
            const extraByDay = {};
            for (const tp of totalP) extraByDay[tp.day] = (extraByDay[tp.day] || 0) + tp.count;
            for (const ip of initP) extraByDay[ip.day] = (extraByDay[ip.day] || 0) - ip.count;
            for (const [dayStr, count] of Object.entries(extraByDay)) {
                if (count > 0) {
                    const row = sim.rows[parseInt(dayStr) - 1];
                    if (row) row.notes.unshift(`Buy ${count}\u00d7 weekly pass`);
                }
            }
        } else {
            const passData = packsData.weekly_pass;
            const extraInfo = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days);
            const row = sim.rows[0];
            if (row) row.notes.unshift(extraInfo.note);
        }
    }

    for (const [day, packs] of packsByDay) {
        const row = sim.rows[day - 1];
        if (!row) continue;
        const notes = [];
        const sorted = [...packs].sort((a, b) => (a.type === "fp" ? -1 : 1) - (b.type === "fp" ? -1 : 1));
        for (const e of sorted) {
            const name = fpLabel[e.id] || e.id.replace(/^r_/, '');
            const prefix = e.count > 1 ? `${e.count}\u00d7 ` : '';
            notes.push(`Buy ${prefix}${name} dias pack (${e.count * e.bdt} BDT)`);
        }
        row.notes.unshift(...notes);
    }

    // Cap total draws to targetDraws — remove excess draws from the end,
    // refunding the spent diamonds so the balance doesn't show phantom consumption.
    let actualTotal = sim.rows.reduce((sum, r) => sum + r.draws, 0);
    if (actualTotal > targetDraws) {
        let excess = actualTotal - targetDraws;
        for (let i = sim.rows.length - 1; i >= 0 && excess > 0; i--) {
            const row = sim.rows[i];
            if (row.draws === 0) continue;
            const remove = Math.min(row.draws, excess);
            const avgCost = row.draws > 0 ? row.diaSpent / row.draws : 0;
            row.draws -= remove;
            row.diaSpent -= Math.round(remove * avgCost);
            if (row.draws === 0) {
                row.notes = row.notes.filter(n => n !== "1x daily" && !n.startsWith("Final push"));
            }
            excess -= remove;
        }
        sim.rows[sim.rows.length - 1].notes.push(`Stopped at ${targetDraws} draws (bingo target reached)`);
    }

    const supplyWindows = premiumSupplyWindowPlan(simEvent);
    const milestoneSchedule = milestoneTokenSchedule(simEvent, { draws: targetDraws });
    const totalDiamondsForPlan = startingDia + recharge.totalDia;

    const drawsNeededAll = {
        optimistic: winCondition.draws.lucky[0],
        realistic: winCondition.draws.realistic,
        worst: winCondition.draws.worst,
    };

    // Aspirants: compute diamond cost per confidence level by running the
    // simulator for each target and applying the same excess-draw cap logic.
    if (isAspirants) {
        const base = { startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance };
        function costForTarget(t) {
            const s = simulateAspirantsPlanWithPacks(event, packsData, t, base, extraDiaByDay, rechargeDiaByDay);
            const rows = s.rows;
            let actual = rows.reduce((sum, r) => sum + r.draws, 0);
            if (actual > t) {
                let excess = actual - t;
                for (let i = rows.length - 1; i >= 0 && excess > 0; i--) {
                    const row = rows[i];
                    if (row.draws === 0) continue;
                    const remove = Math.min(row.draws, excess);
                    const avg = row.draws > 0 ? row.diaSpent / row.draws : 0;
                    row.draws -= remove;
                    row.diaSpent -= Math.round(remove * avg);
                    excess -= remove;
                }
            }
            return rows.reduce((sum, r) => sum + r.diaSpent, 0);
        }
        const costs = [30, 40, 50, 60].map(costForTarget);
        winCondition.diamondCost = {
            lucky: [costs[0], costs[1]],
            realistic: costs[2],
            worst: costs[3],
        };
    }

    const warnings = [];
    if (sim.unaffordableDiaShortfall > 0) {
        warnings.push({
            type: "recharge_needed",
            message: `Free draws don't cover the target. ${sim.unaffordableDiaShortfall} extra diamonds needed.`,
        });
    }

    return {
        eventType: "bingo",
        confidence,
        winCondition,
        dailySchedule,
        target: { skin: { name: "Bingo", hero: "" }, targetCrests: 0 },
        drawsNeeded: { draws: targetDraws },
        drawsNeededAll,
        daySchedule: { rows: sim.rows, totals: computeBingoTotals(sim.rows) },
        recharge,
        totalDiamondsForPlan,
        netDiamondsNeeded: { netDiamondsNeeded: recharge.totalDia },
        supplyWindows,
        milestones: milestoneSchedule,
        warnings,
    };
}
