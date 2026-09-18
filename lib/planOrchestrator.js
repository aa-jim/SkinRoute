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
import { eventDayNow } from "./eventHelpers.js";
import { buildCollectorPlan as simulateCollectorPlan, buildCollectorPlanWithPacks } from "./idealSchedule.collector.js";
import { buildThemedCrestPlan as simulateThemedCrestPlan, buildThemedCrestPlanWithPacks } from "./idealSchedule.themedCrest.js";
import { buildAspirantsPlanWithPacks as simulateAspirantsPlanWithPacks, buildAspirantsPlan as simulateAspirantsPlan, distributePassPurchases, passPurchasesTotalDia } from "./idealSchedule.aspirants.js";
import packsData from "@/data/packs.json" with { type: "json" };

/**
 * Single entry point for all event types. Routes to the correct sub-planner.
 */
export function buildPlan(event, resources, target, ownedItems, confidence = "realistic", overrideStartDay) {
    const startDay = overrideStartDay ?? Math.max(1, todayEventDay(event));
    if (!event?.duration_days || startDay > event.duration_days) {
        throw new Error("Event window has already ended \u2014 no planable days left");
    }
    if (event.type === "bingo") {
        return { ...buildBingoPlan(event, resources, ownedItems, confidence, overrideStartDay), startDay };
    }
    if (event.type === "collector") {
        return { ...buildCollectorPlan(event, resources, target, ownedItems, confidence, overrideStartDay), startDay };
    }
    return { ...buildThemedCrestPlan(event, resources, target, ownedItems, confidence, overrideStartDay), startDay };
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
export function todayEventDay(event) {
    // 2PM BDT reset boundary (same as event card days-left) — see eventHelpers.js
    return eventDayNow(event) ?? 1;
}

function passFirstBuyDay(resources, event, startDay) {
    const rem = Number(resources?.passDaysRemaining);
    const count = Number(resources?.weeklyPasses ?? 0);
    if (!count || isNaN(rem)) return startDay ?? 1;
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
function buildCollectorPlan(event, resources, target, ownedItems, confidence, overrideStartDay) {
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
    const startDay = overrideStartDay ?? Math.max(1, todayEventDay(event));
    const firstPassBuyDay = passFirstBuyDay(resources, event, startDay);
    const passData = packsData.weekly_pass;
    const passesInBalance = passCount > 0 && firstPassBuyDay <= 1
        && startingDia >= passCount * passData.dia_instant + passData.dia_daily;

    // Pass A: run with the user's actual starting resources first.
    let sim = simulateCollectorPlan(event, packsData, draws.draws, { startingDia, startingCoa, passCount, firstPassBuyDay, passesInBalance, startDay });

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
    const effectivePassStart = passCount === 0 ? startDay : firstPassBuyDay;
    const totalSpan = event.duration_days - effectivePassStart + 1;
    const maxUsefulPasses = Math.min(Math.max(Math.floor(totalSpan / 7), totalSpan > 0 ? 1 : 0), 10);
    const searchEnd = Math.max(passCount, maxUsefulPasses);

    if (sim.day1RechargeNeeded > 0 || sim.unaffordableDiaShortfall > 0) {
        for (let tryPasses = passCount; tryPasses <= searchEnd; tryPasses++) {
            const trial = simulateCollectorPlan(event, packsData, draws.draws, {
                startingDia, startingCoa, passCount: tryPasses, firstPassBuyDay: effectivePassStart, passesInBalance: false, startDay,
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
        startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
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
    const windowExpired = startDay > windowEnd;
    const starlightExtra = (sim.day1RechargeNeeded > 0 || windowExpired)
        ? windowExpired
            ? Math.max(0, 300 - startingDia)
            : Math.max(0, 300 + threshold - (hasPasses ? futureDrip + passDiaDay1 : 0) - startingDia)
        : 0;
    const day1Need = Math.max(sim.day1RechargeNeeded, starlightExtra);

    if (totalSpan <= 2) {
        if (day1Need > 0) {
            const fix = optimizeRecharge(day1Need, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, resources);
            if (fix.packsUsed && !fix.impossible) {
                rechargeEntries.push(...fix.packsUsed);
                day1Packs.push(...fix.packsUsed);
                day1PackDia = fix.packsUsed.reduce((sum, e) => sum + e.count * e.dia, 0);
                sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
                    startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
                }, day1PackDia, 0);
            }
        }
        if (sim.unaffordableDiaShortfall > 0) {
            const extraFix = optimizeRecharge(sim.unaffordableDiaShortfall, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, resources);
            if (extraFix.packsUsed && !extraFix.impossible) {
                rechargeEntries.push(...extraFix.packsUsed);
                day1Packs.push(...extraFix.packsUsed);
                day1PackDia += extraFix.packsUsed.reduce((sum, e) => sum + e.count * e.dia, 0);
                sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
                    startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
                }, day1PackDia, 0);
            }
        }
    } else {
        if (day1Need > 0) {
            const fix = optimizeRecharge(day1Need, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, resources);
            if (fix.packsUsed && !fix.impossible) {
                rechargeEntries.push(...fix.packsUsed);
                day1Packs.push(...fix.packsUsed);
                day1PackDia = fix.packsUsed.reduce((sum, e) => sum + e.count * e.dia, 0);
            }
        }

        sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
            startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
        }, day1PackDia, 0);

        if (sim.unaffordableDiaShortfall > 0) {
            const finalDayFix = optimizeRecharge(sim.unaffordableDiaShortfall, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, resources);
            if (finalDayFix.packsUsed && !finalDayFix.impossible) {
                rechargeEntries.push(...finalDayFix.packsUsed);
                finalDayPacks.push(...finalDayFix.packsUsed);
                finalDayPackDia = finalDayFix.packsUsed.reduce((sum, e) => sum + e.count * e.dia, 0);
                sim = buildCollectorPlanWithPacks(event, packsData, draws.draws, {
                    startingDia, startingCoa, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
                }, day1PackDia, finalDayPackDia);
            }
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
        if (day1Row) day1Row.notes.unshift(...packNotes);
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
        if (lastRow) lastRow.notes.unshift(...packNotes);
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
function buildThemedCrestPlan(event, resources, target, ownedItems, confidence, overrideStartDay) {
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
    const startDay = overrideStartDay ?? Math.max(1, todayEventDay(event));
    const firstPassBuyDay = passFirstBuyDay(resources, event, startDay);
    const wp = packsData.weekly_pass;
    const passesInBalance = passCount > 0 && firstPassBuyDay <= 1
        && startingDia >= passCount * wp.dia_instant + wp.dia_daily;

    let sim;

    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
    const rechargeEntries = [];
    let optimalPassCount = passCount;

    const supply = event.premium_supply ?? [];
    const firstPhaseStartDay = supply.length > 0 ? Math.min(...supply.map(p => p.start_day)) : event.duration_days + 1;

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

    // Step B1: complete each premium-supply phase's recharge tasks with packs
    // FIRST, before any balance decision. Recharge tasks award ~20 tokens per
    // 250 dia (best value in the event), so they're always worth completing —
    // even when the user's starting balance already covers all spending. Their
    // free draws also shrink the true balance gap, so the pass search below
    // sees a realistic shortfall instead of over-buying passes to cover draws
    // that were never needed.
    for (const phase of supply) {
        if (phase.start_day < startDay) continue;
        const existingRecharge = rechargeDiaByDay[phase.start_day] || 0;
        const minForTasks = Math.max(0, getHighestRechargeThreshold(phase) - existingRecharge);
        if (minForTasks > 0) addPacksToDay(phase.start_day, minForTasks, true);
    }

    // Pass search: try higher pass counts one at a time, stop at first that keeps
    // the pre-window balance non-negative AND has no final-day shortfall. Trials
    // include the Step B1 task packs (extraDiaByDay / rechargeDiaByDay), so the
    // shortfall reflects the free draws the recharge tasks unlock.
    const effectivePassStart = passCount === 0 ? startDay : firstPassBuyDay;
    const totalSpan = event.duration_days - effectivePassStart + 1;
    const maxUsefulPasses = Math.min(Math.max(Math.floor(totalSpan / 7), totalSpan > 0 ? 1 : 0), 10);

    // Surprise-window pass floor: passes bought inside the first active_days
    // count as recharge (recharge_task_value, usually 100 each) and unlock the
    // surprise free-draw tiers. When the window is still reachable, the plan
    // buys at least enough passes to claim the highest token tier — even when
    // the starting balance already covers all spending (passes stay the
    // cheapest dia-per-BDT in the game, so the surprise draws are near-free).
    const surprisePassFloor = (() => {
        if (!event.has_surprise_tasks || passesInBalance) return 0;
        const s = event.surprise_tasks;
        if (!s || effectivePassStart < startDay || effectivePassStart > Math.min(s.active_days ?? 0, event.duration_days)) return 0;
        const claimable = (s.tasks ?? []).filter((t) => (t.tokens ?? 0) > 0);
        if (claimable.length === 0) return 0;
        const target = Math.max(...claimable.map((t) => t.threshold_dia ?? 0));
        const passRechargeValue = packsData.weekly_pass?.recharge_task_value ?? packsData.weekly_pass?.dia_instant ?? 0;
        if (passRechargeValue <= 0) return 0;
        return Math.max(0, Math.ceil(target / passRechargeValue));
    })();

    const searchEnd = Math.max(passCount, maxUsefulPasses, surprisePassFloor);

    function preWindowMinBalance(rows) {
        const pre = rows.filter(r => r.day < firstPhaseStartDay);
        if (pre.length === 0) return Infinity;
        return pre.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);
    }

    const firstTrial = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
        startingDia, passCount, firstPassBuyDay: effectivePassStart, passesInBalance: false, startDay,
    }, extraDiaByDay, rechargeDiaByDay);
    const passSearchNeeded = firstTrial.unaffordableDiaShortfall > 0 || preWindowMinBalance(firstTrial.rows) < 0 || surprisePassFloor > passCount;
    if (passSearchNeeded) {
        const from = Math.max(passCount, surprisePassFloor);
        for (let tryPasses = from; tryPasses <= searchEnd; tryPasses++) {
            const trial = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
                startingDia, passCount: tryPasses, firstPassBuyDay: effectivePassStart, passesInBalance: false, startDay,
            }, extraDiaByDay, rechargeDiaByDay);
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

    // Extra passes bought through the pass search count as recharge value on
    // their purchase day (recharge_task_value, usually 100) — unlocking the
    // surprise window (first active_days) and, when bought on a supply-window
    // start day, that window's recharge tasks. Matches in-game: a pass is
    // credited 100 dia recharge on the day it is purchased.
    if (extraPasses > 0 && firstPassBuyDay >= 1 && firstPassBuyDay <= event.duration_days) {
        const passRechargeValue = packsData.weekly_pass?.recharge_task_value ?? packsData.weekly_pass?.dia_instant ?? 0;
        if (passRechargeValue > 0) {
            rechargeDiaByDay[firstPassBuyDay] = (rechargeDiaByDay[firstPassBuyDay] || 0) + extraPasses * passRechargeValue;
        }
    }

    // Re-run sim with chosen pass count
    sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
        startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
    }, extraDiaByDay, rechargeDiaByDay);

    // Step A: Pre-window gap
    const pwMin = preWindowMinBalance(sim.rows);
    if (pwMin < 0) {
        addPacksToDay(startDay, -pwMin);
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
        if (phase.start_day < startDay) continue;
        let safety = 0;
        while (safety++ < 5) {
            sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
                startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
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
        startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
    }, extraDiaByDay, rechargeDiaByDay);

    if (sim.unaffordableDiaShortfall > 0) {
        const finalInjectionDay = supply.length > 0 ? event.duration_days : startDay;
        addPacksToDay(finalInjectionDay, sim.unaffordableDiaShortfall);
        sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
            startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
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
                addPacksToDay(startDay, surprise750Target - totalRechargeDia);
                sim = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
                    startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
                }, extraDiaByDay, rechargeDiaByDay);
            }
        }
    }

    // Step D: Global pack reconciliation
    // Every addPacksToDay call above is DP-optimal for its exact container, but
    // the partition as a whole isn't — B1's per-phase injections can leave the
    // chunks (e.g. 250 + 191) paying small-pack overhead that one exact-fit pack
    // wouldn't. Re-optimize the TOTAL regular-pack dia in a single call,
    // enumerate re-assignments of the candidate packs onto the existing purchase
    // days (phase-start days keep their recharge credit, so task/surprise claims
    // are preserved), and adopt only when strictly cheaper AND the re-sim oracle
    // validates (no final-day shortfall, no negative balance anywhere, surprise
    // window claims intact). Weekly passes and FP packs never move.
    {
        // FP purchases were already decided by the steps above (B1/Step B/C via
        // usedFpClaimed) — the reconciliation only re-partitions the REGULAR mix,
        // so the candidate must not see unclaimed FP packs as available.
        const allFpClaimed = { fp_50: true, fp_150: true, fp_250: true, fp_500: true };
        const passEntries = [];
        const regularEntries = [];
        for (const p of rechargeEntries) {
            if (p.type === "pass") passEntries.push(p);
            else if (p.type !== "fp") regularEntries.push(p);
        }

        if (regularEntries.length > 0) {
            const regularTotalDia = regularEntries.reduce((sum, p) => sum + p.count * p.dia, 0);
            const regularTotalBdt = regularEntries.reduce((sum, p) => sum + p.count * p.bdt, 0);
            const cand = optimizeRecharge(
                regularTotalDia,
                { regular: packsData.regular, first_purchase: packsData.first_purchase },
                event.duration_days,
                { fpClaimed: allFpClaimed },
                false
            );

            if (cand.packsUsed && !cand.impossible && cand.totalBdt < regularTotalBdt) {
                const anchors = [];
                for (const [day, packs] of packsByDay) {
                    const regs = packs.filter((p) => p.type !== "fp" && p.type !== "pass");
                    if (regs.length > 0) anchors.push({ day, minCredit: regs.reduce((s, p) => s + p.count * p.dia, 0) });
                }
                anchors.sort((a, b) => a.day - b.day);

                if (anchors.length > 0) {
                    const phaseStartDays = new Set(supply.filter((ph) => ph.start_day >= startDay).map((ph) => ph.start_day));
                    const minCreditByDay = new Map(anchors.map((a) => [a.day, a.minCredit]));
                    const anchorDays = anchors.map((a) => a.day);

                    const fpByDay = new Map();
                    for (const [day, packs] of packsByDay) {
                        const f = packs.filter((p) => p.type === "fp");
                        if (f.length > 0) fpByDay.set(day, [...f]);
                    }

                    const pool = [];
                    for (const p of cand.packsUsed) {
                        for (let i = 0; i < p.count; i++) pool.push({ id: p.id, type: p.type, bdt: p.bdt, dia: p.dia, count: 1 });
                    }
                    pool.sort((a, b) => b.dia - a.dia);

                    const totalAssignments = Math.pow(anchorDays.length, pool.length);
                    const assignmentsToTry = Math.min(totalAssignments, 4096);
                    let adopted = false;

                    for (let code = 0; code < assignmentsToTry && !adopted; code++) {
                        const assigned = new Map();
                        for (const d of anchorDays) assigned.set(d, []);
                        let c = code;
                        for (const p of pool) {
                            assigned.get(anchorDays[c % anchorDays.length]).push(p);
                            c = Math.floor(c / anchorDays.length);
                        }

                        let ok = true;
                        for (const [d, packs] of assigned) {
                            const min = minCreditByDay.get(d);
                            if (min && phaseStartDays.has(d)) {
                                const sum = packs.reduce((s, p) => s + p.dia, 0);
                                if (sum < min) { ok = false; break; }
                            }
                        }
                        if (!ok) continue;

                        const newExtraDiaByDay = {};
                        const newRechargeDiaByDay = {};
                        if (extraPasses > 0 && firstPassBuyDay >= 1 && firstPassBuyDay <= event.duration_days) {
                            const passRechargeValue = packsData.weekly_pass?.recharge_task_value ?? packsData.weekly_pass?.dia_instant ?? 0;
                            if (passRechargeValue > 0) newRechargeDiaByDay[firstPassBuyDay] = extraPasses * passRechargeValue;
                        }
                        for (const [d, packs] of fpByDay) {
                            let extra = 0;
                            let credit = 0;
                            for (const p of packs) {
                                const fpDef = packsData.first_purchase?.find((f) => f.id === p.id);
                                extra += p.count * p.dia;
                                credit += (fpDef ? fpDef.dia_base : p.dia) * p.count;
                            }
                            newExtraDiaByDay[d] = (newExtraDiaByDay[d] || 0) + extra;
                            newRechargeDiaByDay[d] = (newRechargeDiaByDay[d] || 0) + credit;
                        }
                        for (const [d, packs] of assigned) {
                            let extra = 0;
                            for (const p of packs) extra += p.dia;
                            if (extra > 0) {
                                newExtraDiaByDay[d] = (newExtraDiaByDay[d] || 0) + extra;
                                newRechargeDiaByDay[d] = (newRechargeDiaByDay[d] || 0) + extra;
                            }
                        }

                        const oracle = buildThemedCrestPlanWithPacks(event, packsData, draws.draws, {
                            startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, startDay,
                        }, newExtraDiaByDay, newRechargeDiaByDay);
                        const minLeft = oracle.rows.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);
                        if (oracle.unaffordableDiaShortfall === 0 && minLeft >= 0
                            && (oracle.surpriseCumRecharge ?? 0) >= (sim.surpriseCumRecharge ?? 0)) {
                            packsByDay.clear();
                            for (const [d, packs] of assigned) {
                                if (packs.length > 0) packsByDay.set(d, packs);
                            }
                            for (const [d, packs] of fpByDay) {
                                if (packsByDay.has(d)) packsByDay.get(d).push(...packs);
                                else packsByDay.set(d, [...packs]);
                            }
                            rechargeEntries.length = 0;
                            rechargeEntries.push(...passEntries);
                            for (const [, packs] of packsByDay) rechargeEntries.push(...packs);
                            sim = oracle;
                            adopted = true;
                        }
                    }
                }
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

    // Compute surprise ladder from the schedule's WINDOW recharge (first
    // active_days) — what the sim actually claims — not whole-event recharge,
    // which would report tiers as crossed when no purchase lands in the window.
    const surpriseLadder = event.has_surprise_tasks
        ? surpriseTaskProgress(event, sim.surpriseCumRecharge ?? 0)
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
        const row = sim.rows[day - startDay];
        const notes = [];
        const sorted = [...packs].sort((a, b) => (a.type === "fp" ? -1 : 1) - (b.type === "fp" ? -1 : 1));
        for (const e of sorted) {
            const name = fpLabel[e.id] || e.id.replace(/^r_/, '');
            const prefix = e.count > 1 ? `${e.count}\u00d7 ` : '';
            notes.push(`Buy ${prefix}${name} dias pack (${e.count * e.bdt} BDT)`);
        }
        if (row) row.notes.unshift(...notes);
    }

    // Day-1 surprise tier notes removed — the simulator now claims surprise
    // tokens as real free draws (row.draws / totalDraws) inside the window.

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

function buildBingoPlan(event, resources, ownedItems, confidence, overrideStartDay) {
    const plan = buildBingoPlanForTarget(event, resources, ownedItems, confidence, overrideStartDay, null, false);
    return attachBingoBdtCosts(plan, event, resources, ownedItems, confidence, overrideStartDay);
}

// Attach per-tier BDT by PLANNING for each draw tier (its own pass search,
// candidate search, phase packs and shortfall top-ups at that tier's
// targetDraws) - NOT by charging the tier a prefix of the 60-draw worst-case
// schedule, whose front-loaded day-20/21 top-up packs only fund the final
// draws and made cheaper tiers look far pricier than they are. worst stays
// the plan itself. A probe failure falls back to the worst-case money so
// Step 4 can never break over card labels.
function attachBingoBdtCosts(plan, event, resources, ownedItems, confidence, overrideStartDay) {
    const d = plan.winCondition?.draws;
    if (!d) return plan;
    const probe = (T) => {
        try {
            return buildBingoPlanForTarget(event, resources, ownedItems, confidence, overrideStartDay, T, true).recharge?.totalBdt ?? plan.recharge.totalBdt;
        } catch {
            return plan.recharge.totalBdt;
        }
    };
    // A smaller tier's honest plan can never cost more than the next tier's
    // (buy the bigger plan and stop early). Whichever way the probes price it,
    // cap so the diamond-card ranges always read non-decreasing.
    const tRealistic = Math.min(probe(d.realistic), plan.recharge.totalBdt);
    const tL1 = Math.min(probe(d.lucky[1]), tRealistic);
    plan.winCondition.bdtCost = {
        lucky: [Math.min(probe(d.lucky[0]), tL1), tL1],
        realistic: tRealistic,
        worst: plan.recharge.totalBdt,
    };
    return plan;
}

// Full bingo plan for a specific draw target (the worst-case tier unless
// overridden). Per-tier cost probes set isProbe=true and skip the bdtCost
// attach step, so probing never recurses.
function buildBingoPlanForTarget(event, resources, ownedItems, confidence, overrideStartDay, targetDrawsOverride, isProbe) {
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
    const targetDraws = targetDrawsOverride ?? winCondition.draws.worst;

    const simEvent = normalizeEventForSim(event);

    const startingDia = Number(resources?.diamonds ?? 0);
    const passCount = Number(resources?.weeklyPasses ?? 0);
    const startDay = overrideStartDay ?? Math.max(1, todayEventDay(event));
    const firstPassBuyDay = passFirstBuyDay(resources, event, startDay);
    const wp = packsData.weekly_pass;
    const passesInBalance = passCount > 0 && firstPassBuyDay <= 1
        && startingDia >= passCount * wp.dia_instant + wp.dia_daily;

    // Aspirants uses a specialized simulator (different draw/claim pattern)
    const isAspirants = event.id === "aspirants_2026";

    function simPlain(res) {
        return isAspirants
            ? simulateAspirantsPlan(event, packsData, targetDraws, { ...res, startDay })
            : simulateThemedCrestPlan(simEvent, packsData, targetDraws, { ...res, startDay });
    }

    function simWithPacks(res, extra, rechargeExtra) {
        return isAspirants
            ? simulateAspirantsPlanWithPacks(event, packsData, targetDraws, { ...res, startDay }, extra, rechargeExtra)
            : buildThemedCrestPlanWithPacks(simEvent, packsData, targetDraws, { ...res, startDay }, extra, rechargeExtra);
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

    const effectivePassStart = passCount === 0 ? startDay : firstPassBuyDay;
    const totalSpan = event.duration_days - effectivePassStart + 1;
    const divisor = isAspirants ? Math.ceil(totalSpan / 7) : Math.floor(totalSpan / 7);
    const maxUsefulPasses = Math.min(Math.max(divisor, totalSpan > 0 ? 1 : 0), 10);
    const searchEnd = Math.max(passCount, maxUsefulPasses);

    // Pass search always uses passesInBalance=false (distributed). When the user's
    // passes are already in balance (all pre-owned, stacked on firstPassBuyDay),
    // the search overestimates extra pass value — skip it.
    if (!passesInBalance && (sim.unaffordableDiaShortfall > 0 || preWindowMinBalance(sim.rows) < 0)) {
        for (let tryPasses = passCount; tryPasses <= searchEnd; tryPasses++) {
            const trial = simPlain({
                startingDia, passCount: tryPasses, firstPassBuyDay: effectivePassStart, passesInBalance: false,
            });
            optimalPassCount = tryPasses;
            if (preWindowMinBalance(trial.rows) >= 0 && trial.unaffordableDiaShortfall === 0) {
                break;
            }
        }
    }

    let extraPasses = optimalPassCount - passCount;
    // NOTE: the weekly_pass rechargeEntries entry is pushed further down, AFTER
    // the aspirants "drop first pass" trial below, so its per-pass dia can
    // reflect the drop-aware drip queue (phase-start purchases instead of
    // firstPassBuyDay).

    const extraDiaByDay = {};
    const rechargeDiaByDay = {};
    const packsByDay = new Map();
    // Record which days the plan actually tells the user to buy passes/packs
    // (mirrors the "Buy N× weekly pass" / "Buy ... dias pack" schedule notes),
    // so winCondition.bdtCost can read per-tier money straight off the schedule.
    const passReceipts = [];
    const fpLabel = { fp_50: "First Purchase Bonus 50 dias", fp_150: "First Purchase Bonus 150 dias", fp_250: "First Purchase Bonus 250 dias", fp_500: "First Purchase Bonus 500 dias" };
    const usedFpClaimed = { ...(resources?.fpClaimed ?? {}) };

    // sink: optional scratch target ({extra, recharge, packs, entries, fp}) so the
    // drop-candidate trials can inject packs without touching the real state.
    function addPacksToDay(day, needs, rechargeMode = false, sink = null) {
        const t = sink ?? { extra: extraDiaByDay, recharge: rechargeDiaByDay, packs: packsByDay, entries: rechargeEntries, fp: usedFpClaimed };
        const fix = optimizeRecharge(needs, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, { fpClaimed: t.fp }, rechargeMode);
        if (fix.packsUsed && !fix.impossible) {
            for (const p of fix.packsUsed) {
                if (p.type === "fp") t.fp[p.id] = true;
            }
            t.entries.push(...fix.packsUsed);
            if (!t.packs.has(day)) t.packs.set(day, []);
            t.packs.get(day).push(...fix.packsUsed);
            t.extra[day] = (t.extra[day] || 0) + fix.totalDia;
            // FP packs: only base dia counts toward recharge (bonus/extra don't)
            let rechargeDia = 0;
            for (const p of fix.packsUsed) {
                const fpDef = p.type === "fp" ? packsData.first_purchase?.find(f => f.id === p.id) : null;
                rechargeDia += (fpDef ? fpDef.dia_base : p.dia) * p.count;
            }
            t.recharge[day] = (t.recharge[day] || 0) + rechargeDia;
        }
    }

    // -------------------------------------------------------------------------
    // Aspirants: drop the pre-phase (day-1) weekly pass when diamonds suffice.
    //
    // The pass search's day-1 unit exists only to fund draws with dia. Candidate
    // structures WITHOUT that unit are evaluated against the keep-plan on scratch
    // maps (real state untouched): (a) same pass count redistributed across the
    // remaining phase starts, (b) one fewer pass — exactly the "N phase passes
    // + the phase-2 pack" structure. Each candidate is priced (passes + phase
    // packs + a shortfall top-up via the same knapsack the funding loop
    // uses). NOTE: passes bought the same day drip SEQUENTIALLY, so N phase-start
    // passes yield less dia than N x 220 within the window — the top-up pack is
    // the honest price of dropping the day-1 pass. The cheapest candidate is
    // adopted when it costs at most 30 BDT (~15% of a pass) more than keeping
    // it; otherwise nothing changes (plans stay byte-identical). Phase-start
    // (recharge-task) passes are never dropped.
    // -------------------------------------------------------------------------
    const remainingPhaseStarts = supplyArray.map(p => p.start_day).filter(d => d >= startDay).sort((a, b) => a - b);
    let dropFirstPass = false;
    const passSubstituted = new Set();
    let phasePassBumps = 0;
    let phasePassBumpDia = 0;
    if (isAspirants && !passesInBalance
        && remainingPhaseStarts.length > 0 && firstPassBuyDay < remainingPhaseStarts[0]) {
        const wpBdt = packsData.weekly_pass?.bdt ?? 0;

        function evaluateCandidate(dropMode, totalPasses) {
            const sink = { extra: {}, recharge: {}, packs: new Map(), entries: [], fp: { ...usedFpClaimed } };
            injectPhasePacks(sink, totalPasses, dropMode);
            const trial = simWithPacks({ startingDia, passCount: totalPasses, firstPassBuyDay, passesInBalance, dropFirstPass: dropMode, passPhaseStarts: remainingPhaseStarts }, sink.extra, sink.recharge);
            if (preWindowMinBalance(trial.rows) < 0) return null;
            let topUpBdt = 0;
            if (trial.unaffordableDiaShortfall > 0) {
                const fix = optimizeRecharge(trial.unaffordableDiaShortfall, { regular: packsData.regular, first_purchase: packsData.first_purchase }, event.duration_days, { fpClaimed: { ...sink.fp } }, false);
                if (!fix.packsUsed || fix.impossible) return null;
                topUpBdt = fix.packsUsed.reduce((s, p) => s + p.count * p.bdt, 0);
            }
            const phasePackBdt = [...sink.packs.values()].reduce((s, ps) => s + ps.reduce((a, p) => a + p.count * p.bdt, 0), 0);
            return { dropMode, totalPasses, topUpBdt, bdt: totalPasses * wpBdt + phasePackBdt + topUpBdt };
        }

        const keep = evaluateCandidate(false, optimalPassCount);
        const dropCandidates = [];
        const cSame = evaluateCandidate(true, optimalPassCount);
        if (cSame) dropCandidates.push(cSame);
        const cFewer = extraPasses >= 2
            ? evaluateCandidate(true, optimalPassCount - 1)
            : evaluateCandidate(false, passCount); // don't buy the single extra pass at all
        if (cFewer) dropCandidates.push(cFewer);
        dropCandidates.sort((x, y) => x.bdt - y.bdt || x.totalPasses - y.totalPasses);

        const best = dropCandidates[0];
        // Adopt only when the residual gap the drop leaves behind is itself
        // coverable within a small tolerance of a pass's price. A price tolerance
        // (30 BDT, ~15% of a pass) replaces the previous stricter residual-top-up
        // test: it lets the day-1 pass disappear once the user's own diamonds +
        // the phase-start passes cover the requirement (dia ~>= 1,900), while
        // still keeping the pass wherever dropping it would cost more than 30 BDT
        // more than keeping it — at low diamond balances the day-1 pass IS the
        // cheapest dia source (passes ~1.1 dia/BDT vs regular packs ~0.55), so it
        // is only removed when that trade-off is a wash or better.
        if (best && keep && best.bdt <= keep.bdt + 30) {
            dropFirstPass = best.dropMode;
            optimalPassCount = best.totalPasses;
            extraPasses = optimalPassCount - passCount;
            injectPhasePacks(); // commit the winner's packs; any residual shortfall is closed by the checkpoint-staged funding loop below
        }
    }

    if (extraPasses > 0) {
        const passData = packsData.weekly_pass;
        let entryDia;
        if (dropFirstPass) {
            // Exact schedule accounting (sequential queue — inst dia lands on
            // each purchase day even when the drip falls outside the event).
            // Extras = the last `extraPasses` passes in the same queue, so the
            // owned-pass prefix is subtracted from the full distribution.
            const allP = distributePassPurchases(optimalPassCount, firstPassBuyDay, remainingPhaseStarts, true);
            const ownedP = distributePassPurchases(passCount, firstPassBuyDay, remainingPhaseStarts, true);
            const total = passPurchasesTotalDia(allP, passData, event.duration_days)
                - passPurchasesTotalDia(ownedP, passData, event.duration_days);
            entryDia = total / extraPasses;
        } else {
            entryDia = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days).totalDia / extraPasses;
        }
        rechargeEntries.push({
            id: "weekly_pass", type: "pass", count: extraPasses,
            bdt: passData?.bdt ?? 0,
            dia: entryDia,
        });
    }

    sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, dropFirstPass, passPhaseStarts: remainingPhaseStarts }, extraDiaByDay, rechargeDiaByDay);

    const pwMin = preWindowMinBalance(sim.rows);
    if (pwMin < 0) {
        addPacksToDay(startDay, -pwMin);
    }

    function getHighestRechargeThreshold(phase) {
        const tasks = (phase.tasks ?? []).filter(t => t.type?.startsWith("recharge_"));
        return tasks.reduce((max, t) => Math.max(max, t.threshold_dia ?? 0), 0);
    }

    // Phase-recharge injection (extracted so the drop-candidate trials above can
    // run it against scratch sinks; the normal flow calls it with no args).
    function injectPhasePacks(sink = null, passCountOverride = optimalPassCount, dropOverride = dropFirstPass) {
        const t = sink ?? { extra: extraDiaByDay, recharge: rechargeDiaByDay, packs: packsByDay, entries: rechargeEntries, fp: usedFpClaimed };
        for (const phase of supplyArray) {
            if (phase.start_day < startDay) continue;
            let safety = 0;
            while (safety++ < 5) {
                sim = simWithPacks({ startingDia, passCount: passCountOverride, firstPassBuyDay, passesInBalance, dropFirstPass: dropOverride, passPhaseStarts: remainingPhaseStarts }, t.extra, t.recharge);

                const phaseRows = sim.rows.filter(r => r.day >= phase.start_day);
                const phaseMinBalance = phaseRows.reduce((m, r) => Math.min(m, r.diaLeft ?? 0), Infinity);
                let existingRecharge = t.recharge[phase.start_day] || 0;

                // For Aspirants, passes bought on phase start day also contribute recharge value.
                // When passesInBalance=true, all passes are stacked on firstPassBuyDay (pre-event) and
                // their recharge is subtracted inside the simulator — so no pass recharge on phase days.
                if (isAspirants && !passesInBalance) {
                    const passRechargeVal = packsData.weekly_pass?.recharge_task_value ?? packsData.weekly_pass?.dia_instant ?? 0;
                    const phaseStarts = dropOverride ? remainingPhaseStarts : supplyArray.map(p => p.start_day).sort((a, b) => a - b);
                    const dist = distributePassPurchases(passCountOverride, firstPassBuyDay, phaseStarts, dropOverride);
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
                    // Small recharge gap -> substitute ONE more weekly pass instead of
                    // the 11/55/86-class small-pack trio: the pass costs 200 BDT but
                    // carries 100 recharge credit (covers the gap) plus ~220 dia
                    // (instant + in-window drip) at ~1.1 dia/BDT vs ~0.5 for small
                    // packs. Only on real injections; only when the distribution
                    // queue's extra pass lands on THIS phase start (it always appends
                    // to the last purchase); once per phase.
                    if (sink === null && isAspirants && !passesInBalance
                        && minForTasks <= (wp.recharge_task_value ?? 0) * 2
                        && optimalPassCount < 10
                        && !passSubstituted.has(phase.start_day)) {
                        const phaseStarts = dropOverride ? remainingPhaseStarts : supplyArray.map(p => p.start_day).sort((a, b) => a - b);
                        const dist = distributePassPurchases(optimalPassCount, firstPassBuyDay, phaseStarts, dropOverride);
                        const lastBuy = dist[dist.length - 1];
                        if (lastBuy && lastBuy.day === phase.start_day) {
                            optimalPassCount++;
                            passSubstituted.add(phase.start_day);
                            phasePassBumps += 1;
                            phasePassBumpDia += wp.dia_instant + wp.dia_daily * Math.max(0, Math.min(wp.days, event.duration_days - phase.start_day + 1));
                            continue; // re-sim: the pass now covers the gap; residual is sized next pass
                        }
                    }
                    addPacksToDay(phase.start_day, need, true, t);
                }
                // Balance need: use rechargeMode=false so FP weight = total (cheaper per dia)
                if (balanceNeed > 0) {
                    addPacksToDay(phase.start_day, balanceNeed, false, t);
                }
            }
        }
    }

    injectPhasePacks();

    sim = simWithPacks({ startingDia, passCount: optimalPassCount, firstPassBuyDay, passesInBalance, dropFirstPass, passPhaseStarts: remainingPhaseStarts }, extraDiaByDay, rechargeDiaByDay);

    const topUpPassDays = [];
    let finalCheckpointDay = 0;
    let finalTenxDay = 0;
    let finalTailDay = 0;
    const aspirantsWp = packsData.weekly_pass;
    const aspirantsDailyCost = event.discount_draw_cost?.daily_1x ?? event.draw_cost_1x;
    const aspirantsTenxCost = event.discount_draw_cost?.first_time_10x ?? event.draw_cost_10x;
    let aspirantsPhasePassCount = optimalPassCount;
    if (isAspirants) {
        const aspirantsLastPhaseEnd = sim.lastPhaseEnd ?? 0;
        const firstAccDay = Math.min(Math.max(startDay, aspirantsLastPhaseEnd + 2), event.duration_days);
        const simArgsForAspirants = () => ({ startingDia, passCount: aspirantsPhasePassCount, firstPassBuyDay, passesInBalance, dropFirstPass, passPhaseStarts: remainingPhaseStarts });
        let tenxFunded = false;
        for (let guard = 0; guard < 8 && sim.unaffordableDiaShortfall > 0; guard++) {
            let checkpointDay = 0;
            {
                let cum = 0;
                for (const r of sim.rows) { cum += r.draws; if (cum >= 40) { checkpointDay = r.day; break; } }
            }
            let tenxDay, tailDay, checkDay;
            if (checkpointDay > 0) {
                tenxDay = Math.min(checkpointDay + 1, event.duration_days);
                tailDay = Math.min(tenxDay + 1, event.duration_days);
                checkDay = checkpointDay;
            } else {
                tenxDay = firstAccDay;
                tailDay = Math.min(tenxDay + 1, event.duration_days);
                checkDay = tenxDay;
            }
            const starved = sim.rows.find(r =>
                r.day === checkDay
                && r.draws === 0 && r.diaLeft < aspirantsDailyCost
            );
            let didStarved = false;
            if (starved && !tenxFunded) {
                const need = aspirantsDailyCost - Math.max(0, starved.diaLeft);
                const daysRemaining = event.duration_days - starved.day + 1;
                const totalPasses = aspirantsPhasePassCount + topUpPassDays.length;
                const usePass = need >= 80 || need * (aspirantsWp.bdt / 100) >= 150 || daysRemaining >= 7;
                if (usePass && totalPasses < 10) {
                    const queueBefore = firstPassBuyDay + totalPasses * aspirantsWp.days;
                    const startDrip = Math.max(starved.day, queueBefore);
                    const dripDays = Math.max(0, Math.min(aspirantsWp.days, event.duration_days - startDrip + 1));
                    const passDia = aspirantsWp.dia_instant + aspirantsWp.dia_daily * dripDays;
                    const passRechargeValue = aspirantsWp.recharge_task_value ?? aspirantsWp.dia_instant;
                    topUpPassDays.push(starved.day);
                    rechargeDiaByDay[starved.day] = (rechargeDiaByDay[starved.day] || 0) + passRechargeValue;
                    extraDiaByDay[starved.day] = (extraDiaByDay[starved.day] || 0) + passDia;
                    rechargeEntries.push({ id: "weekly_pass", type: "pass", count: 1, bdt: aspirantsWp.bdt, dia: passDia });
                } else {
                    addPacksToDay(starved.day, need);
                }
                didStarved = true;
            }
            if (!didStarved) {
                if (!tenxFunded && targetDraws > 40) {
                    const diaAtCheckpoint = sim.rows[tenxDay - startDay]?.diaLeft ?? 0;
                    const needTenx = Math.max(0, aspirantsTenxCost - Math.max(0, diaAtCheckpoint));
                    const cappedNeed = Math.min(needTenx > 0 ? needTenx : aspirantsTenxCost, sim.unaffordableDiaShortfall);
                    const needToFund = needTenx > 0 ? cappedNeed : Math.min(aspirantsTenxCost, sim.unaffordableDiaShortfall);
                    if (needToFund > 0) addPacksToDay(tenxDay, needToFund);
                    tenxFunded = true;
                } else if (targetDraws > 40) {
                    const needTail = sim.unaffordableDiaShortfall;
                    if (needTail > 0) addPacksToDay(tailDay, needTail);
                } else {
                    addPacksToDay(tenxDay, sim.unaffordableDiaShortfall);
                }
            }
            finalCheckpointDay = checkpointDay > 0 ? checkpointDay : firstAccDay;
            finalTenxDay = tenxDay;
            finalTailDay = tailDay;
            sim = simWithPacks(simArgsForAspirants(), extraDiaByDay, rechargeDiaByDay);
        }
        if (finalCheckpointDay === 0 || finalTenxDay === 0) {
            let cum = 0, cp = 0;
            for (const r of sim.rows) { cum += r.draws; if (cum >= 40) { cp = r.day; break; } }
            const aspirantsLastPhaseEnd2 = sim.lastPhaseEnd ?? 0;
            const firstAccDay2 = Math.min(Math.max(startDay, aspirantsLastPhaseEnd2 + 1), event.duration_days);
            finalCheckpointDay = cp;
            finalTenxDay = cp > 0 ? cp : firstAccDay2;
            finalTailDay = Math.min(finalTenxDay + 1, event.duration_days);
            if (finalCheckpointDay === 0) finalCheckpointDay = finalTenxDay;
        }
    }

    if (!isAspirants && sim.unaffordableDiaShortfall > 0) {
        const injectionDay = supplyArray.length > 0 ? event.duration_days : startDay;
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

    // The pass substitutions above bumped optimalPassCount after the weekly_pass
    // entry was written - fold the extra passes into it (money + per-pass dia).
    if (phasePassBumps > 0) {
        const wpEntry = rechargeEntries.find(e => e.id === "weekly_pass");
        if (wpEntry) {
            const oldCount = wpEntry.count;
            wpEntry.count += phasePassBumps;
            wpEntry.dia = Math.round((wpEntry.dia * oldCount + phasePassBumpDia) / wpEntry.count);
        } else {
            rechargeEntries.push({
                id: "weekly_pass", type: "pass", count: phasePassBumps,
                bdt: packsData.weekly_pass?.bdt ?? 0,
                dia: Math.round(phasePassBumpDia / phasePassBumps),
            });
        }
    }

    const aspirantsEffectivePhasePassCount = isAspirants ? aspirantsPhasePassCount : optimalPassCount;
    if (extraPasses > 0 || topUpPassDays.length > 0) {
        if (isAspirants) {
            const phaseStarts = dropFirstPass ? remainingPhaseStarts : supplyArray.map(p => p.start_day).sort((a, b) => a - b);
            const totalP = distributePassPurchases(aspirantsEffectivePhasePassCount, firstPassBuyDay, phaseStarts, dropFirstPass);
            const initP = distributePassPurchases(passCount, firstPassBuyDay, phaseStarts, dropFirstPass);
            const extraByDay = {};
            for (const tp of totalP) extraByDay[tp.day] = (extraByDay[tp.day] || 0) + tp.count;
            for (const ip of initP) extraByDay[ip.day] = (extraByDay[ip.day] || 0) - ip.count;
            for (const [dayStr, count] of Object.entries(extraByDay)) {
                if (count > 0) {
                    const row = sim.rows[parseInt(dayStr) - startDay];
                    if (row) row.notes.unshift(`Buy ${count}\u00d7 weekly pass`);
                    passReceipts.push({ day: Math.max(startDay, parseInt(dayStr)), count });
                }
            }
            for (const day of topUpPassDays) {
                const row = sim.rows[day - startDay];
                if (row) row.notes.unshift(`Buy 1\u00d7 weekly pass`);
                passReceipts.push({ day: Math.max(startDay, day), count: 1 });
            }
            if (phasePassBumps > 0) {
                const phaseStarts2 = dropFirstPass ? remainingPhaseStarts : supplyArray.map(p => p.start_day).sort((a, b) => a - b);
                const dist = distributePassPurchases(aspirantsEffectivePhasePassCount, firstPassBuyDay, phaseStarts2, dropFirstPass);
                for (const d of dist) {
                    if (passSubstituted.has(d.day)) {
                        const row = sim.rows[d.day - startDay];
                        if (row) row.notes.unshift(`Buy ${d.count}\u00d7 weekly pass`);
                        passReceipts.push({ day: Math.max(startDay, d.day), count: d.count });
                    }
                }
            }
        } else {
            const passData = packsData.weekly_pass;
            const extraInfo = computeExtraPassDia(extraPasses, passCount, firstPassBuyDay, passData, event.duration_days);
            const row = sim.rows[0];
            if (row) row.notes.unshift(extraInfo.note);
            passReceipts.push({ day: startDay, count: extraPasses });
        }
    }

    for (const [day, packs] of packsByDay) {
        const row = sim.rows[day - startDay];
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

    if (isAspirants) {
        if (!isProbe) {
            const probeDia = (T) => {
                try {
                    const p = buildBingoPlanForTarget(event, resources, ownedItems, confidence, overrideStartDay, T, true);
                    return p.daySchedule?.totals?.dia ?? 0;
                } catch {
                    return sim.rows.reduce((s, r) => s + r.diaSpent, 0);
                }
            };
            const c30 = probeDia(30);
            const c40 = probeDia(40);
            const c50 = probeDia(50);
            const c60 = sim.rows.reduce((s, r) => s + r.diaSpent, 0);
            const cap = (a, b) => Math.min(a, b);
            const rc50 = cap(c50, c60);
            const rc40 = cap(c40, rc50);
            const rc30 = cap(c30, rc40);
            winCondition.diamondCost = { lucky: [rc30, rc40], realistic: rc50, worst: c60 };
        } else {
            const base = { startingDia, passCount: aspirantsPhasePassCount, firstPassBuyDay, passesInBalance, startDay, dropFirstPass, passPhaseStarts: remainingPhaseStarts };
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
    }

    // winCondition.bdtCost is attached by the buildBingoPlan wrapper - each tier
    // is priced by planning for that tier (its own pass search, candidate
    // search, phase packs and shortfall top-ups at its own targetDraws), not by
    // charging it a prefix of this 60-draw schedule. Probes (isProbe) skip this.

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
        target: null,
        drawsNeeded: { draws: targetDraws },
        drawsNeededAll,
        daySchedule: { rows: sim.rows, totals: computeBingoTotals(sim.rows) },
        recharge,
        totalDiamondsForPlan,
        netDiamondsNeeded: { netDiamondsNeeded: recharge.totalDia },
        supplyWindows,
        milestones: milestoneSchedule,
        warnings,
        checkpointDay: finalCheckpointDay,
        tenxDay: finalTenxDay,
        tailDay: finalTailDay,
        isAspirants,
    };
}
