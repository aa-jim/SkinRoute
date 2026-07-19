// lib/planOrchestrator.js
// Part 5C-iv / Stage B — single entry point Part 7 calls, regardless of event.type.
// Branches to the correct calculator + scheduler functions per type, returns one
// normalized shape so StepFour.jsx doesn't need to know which event type it's showing.
//
// UPDATED 2026-07-19 (this chat):
//   1. drawsNeeded() now receives the live `confidence` param on every call — previously
//      always defaulted to "optimistic" internally (calculator.js's old hardcoded
//      DRAWS_NEEDED_DIVISOR), so all 3 confidence tabs showed the identical draws figure.
//      Now Optimistic/Realistic/Worst Case each show their own distinct number.
//   2. buildCollectorPlan() now builds a REAL day-by-day schedule (day -> draws, dia
//      spent, CoA spent) instead of only returning phase-boundary text, plus a final-day
//      CoA-priority gap-close and a totals summary (total dia, total CoA, total draws).
//      No crest-outcome simulation is done (per user decision) — only which day spends
//      which resource and how much; a >10-draws-in-one-currency day is written as a
//      "10x draw" (per user's stated simplification, order doesn't matter for display).
//      Free draws from keys (login/Starlight/spend-task/milestone) are shown as their
//      own schedule entries ("claim N key(s) -> N free draw(s)") on the day earned,
//      folded into that day's draw count — NOT subtracted from the headline Total Draws
//      figure, so the number stays consistent with what dailySchedule actually shows.

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

// ---------------------------------------------------------------------------
// Themed Crest / Legend / Special branch
// ---------------------------------------------------------------------------

function buildThemedCrestPlan(event, resources, target, ownedItems, confidence) {
    const { skin, targetCrests } = resolveTargetCrests(event, target);
    const ownedGroups = ownedItems?.groups ?? {};
    const ownedSkinIds = ownedItems?.skins ?? [];
    const currentCrests = 0; // no crest-banking input in Step 1 UI yet — assumed 0, flagged below

    const draws = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, confidence);
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
        if (m.reward_type === "token" && drawsEstimate >= m.draws) {
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

/**
 * Builds the real day-by-day Collector schedule: which day spends which
 * resource, how much, and where free-draw keys land. No crest-outcome
 * simulation (per user decision, 2026-07-19) — this only tracks resource
 * flow (diamonds/CoA in, draws out), not probabilistic crest yield per day.
 *
 * Draw-count basis: totalDrawsTarget (from drawsNeeded(), confidence-aware)
 * is the number of draws the plan works toward. Free-draw days (daily 1x,
 * Starlight/milestone/task keys) are counted toward this total, not added
 * on top — matches how drawsNeeded()/the UI already present "Total Draws".
 *
 * @returns {{
 *   rows: Array<{day:number, draws:number, diaSpent:number, coaSpent:number, notes:string[]}>,
 *   totals: {draws:number, dia:number, coa:number}
 * }}
 */
function buildCollectorDaySchedule(event, resources, spendPlan, starlight, passPlan, milestones, totalDrawsTarget) {
    const duration = event.duration_days;
    const dailyCost = event.discount_draw_cost?.daily_1x;
    const fullCost = event.draw_cost_1x;
    const cost10x = event.draw_cost_10x;
    const first10xCost = event.discount_draw_cost?.first_time_10x;
    const passCoaPerDay = packsData.weekly_pass?.coa_box_daily ?? 0;

    const rows = [];
    for (let day = 1; day <= duration; day++) {
        rows.push({ day, draws: 0, diaSpent: 0, coaSpent: 0, notes: [] });
    }
    const row = (day) => rows[day - 1];

    // ---- Running balances ----
    let diaBalance = Number(resources?.diamonds ?? 0);
    let coaBalance = Number(resources?.coa ?? 0);
    let drawsSoFar = 0;
    let starlightApplied = false;
    let unaffordableDiaShortfall = 0;

    // Weekly pass CoA box: 10 CoA/day per active pass (sequential, same drip window as
    // dia — reuse passPlan.dailyDiamondSchedule's day keys as the "pass active" signal,
    // since a day with pass dia inflow > 0 (past instant-only day) is a day the CoA box
    // is also active; approximate via passPlan itself having a matching day entry).
    const passActiveDays = new Set(Object.keys(passPlan.dailyDiamondSchedule ?? {}).map(Number));

    const isDiamondWindow = spendPlan.branch === "diamond_window_then_coa";
    const diamondWindowEnd = isDiamondWindow ? spendPlan.phase1.endDay : 0;
    const useFirst10x = isDiamondWindow && spendPlan.phase1.useFirst10xOnDay1;

    // Premium supply task tracking (login / spend_100 / spend_250 / spend_500 — Bug 2/3 fix).
    // Only diamond draws during the diamond window count as "spend" (CoA doesn't — confirmed
    // in-game). Login is granted once, day it happens is the phase's own start_day.
    const supplyPhases = Array.isArray(event.premium_supply) ? event.premium_supply : [];
    const spendPhase = supplyPhases.find((p) => (p.tasks ?? []).some((t) => t.type?.startsWith("spend_")));
    const loginTask = spendPhase?.tasks?.find((t) => t.type === "login");
    const spendTiers = (spendPhase?.tasks ?? [])
        .filter((t) => t.type?.startsWith("spend_") && typeof t.threshold_dia === "number")
        .sort((a, b) => a.threshold_dia - b.threshold_dia);
    let cumulativeDiaSpentInWindow = 0;
    const spendTiersClaimed = new Set();
    let loginClaimed = false;
    const milestonesClaimed = new Set();

    // IMPORTANT: iterate every day through `duration` — never break early when
    // drawsSoFar reaches totalDrawsTarget. An early break was a real bug found
    // during testing: milestone/Starlight keys can push drawsSoFar past target
    // mid-event, which silently skipped the final day and its gap-close logic,
    // and left later rows uninitialized (surfacing as NaN in the totals sum).
    // Days after the target is already reached just show a no-op note instead.
    for (let day = 1; day <= duration; day++) {
        const isFinalDay = day === duration;
        const targetAlreadyReached = drawsSoFar >= totalDrawsTarget;

        // Pass diamond drip lands first each day.
        diaBalance += passPlan.dailyDiamondSchedule?.[day] ?? 0;
        // Pass CoA box (10/day while a pass is active).
        if (passActiveDays.has(day)) coaBalance += passCoaPerDay;

        if (!isFinalDay && targetAlreadyReached) {
            row(day).notes.push("Target already reached \u2014 no further draws needed");
            continue;
        }

        // Daily discounted 1x + Starlight check run EVERY day, including the final day —
        // the final day still gets its mandatory discounted draw before the gap-close logic
        // below tops up whatever's still missing at full price (previous bug: this whole
        // block was skipped on the final day, silently dropping that day's cheap draw).
        if (isDiamondWindow && day <= diamondWindowEnd) {
                // Diamond phase: Day 1 first-10x (if chosen), then daily 1x every day.
                let dayDraws = 0;
                let dayDia = 0;
                if (day === 1 && useFirst10x && diaBalance >= first10xCost) {
                    diaBalance -= first10xCost;
                    dayDia += first10xCost;
                    dayDraws += 10;
                    row(day).notes.push("10x draw (dia, first-time discount)");
                }
                if (diaBalance >= dailyCost) {
                    diaBalance -= dailyCost;
                    dayDia += dailyCost;
                    dayDraws += 1;
                    row(day).notes.push("1x daily (dia)");
                }
                row(day).draws += dayDraws;
                row(day).diaSpent += dayDia;
                drawsSoFar += dayDraws;
                cumulativeDiaSpentInWindow += dayDia;

                // Login task: granted once, on the supply phase's start day.
                if (loginTask && !loginClaimed && day === spendPhase.start_day) {
                    loginClaimed = true;
                    const t = loginTask.tokens ?? 0;
                    row(day).notes.push(`Claim ${t} key (login task) \u2192 ${t} free draw${t > 1 ? "s" : ""}`);
                    row(day).draws += t;
                    drawsSoFar += t;
                }

                // Spend-task tiers: check cumulative diamond spend against each tier,
                // grant keys the day the threshold is first crossed (still within window).
                if (day <= diamondWindowEnd) {
                    for (const tier of spendTiers) {
                        if (!spendTiersClaimed.has(tier.type) && cumulativeDiaSpentInWindow >= tier.threshold_dia) {
                            spendTiersClaimed.add(tier.type);
                            const t = tier.tokens ?? 0;
                            row(day).notes.push(`Claim ${t} key${t > 1 ? "s" : ""} (spend ${tier.threshold_dia} dia task) \u2192 ${t} free draw${t > 1 ? "s" : ""}`);
                            row(day).draws += t;
                            drawsSoFar += t;
                        }
                    }
                }
            } else {
                // CoA phase: daily 1x paid in CoA.
                if (coaBalance >= dailyCost) {
                    coaBalance -= dailyCost;
                    row(day).coaSpent += dailyCost;
                    row(day).draws += 1;
                    row(day).notes.push("1x daily (CoA)");
                    drawsSoFar += 1;
                }
            }

            // Starlight purchase: only checked AFTER the diamond spend-task window has
            // fully closed (day > diamondWindowEnd) — never mid-window, even if balance
            // technically crosses 300 there. Spend tasks get full priority; large pass
            // inflow on Day 1 can push balance past 300 while spend draws are still being
            // made, but that's not "spare" diamonds — they're earmarked for the spend
            // tasks. Starlight fires the first day post-window the real running balance
            // (now just accumulating leftover pass drip, untouched by draws) hits >=300.
            if (!starlightApplied && day > diamondWindowEnd && diaBalance >= 300) {
                coaBalance += 300;
                starlightApplied = true;
                row(day).notes.push("Buy Starlight (+300 CoA, +2 keys \u2192 2 free draws)");
                row(day).draws += 2; // the 2 keys, redeemed same day
                drawsSoFar += 2;
            }

        // Milestone / task keys: grant the FIRST day the real simulated drawsSoFar
        // crosses the milestone's draw threshold — not a fixed 1-draw/day approxDay
        // guess, which could land on the wrong day or never fire at all once actual
        // pacing (10x days, CoA-only days) diverges from that baseline (Bug 4 fix).
        // NOTE: milestoneTokenSchedule() nests the original milestone object under
        // `.detail` — token count is m.detail.tokens, NOT a top-level m.tokens field.
        for (const m of milestones) {
            const tokenCount = m.detail?.tokens ?? 0;
            if (m.reward_type === "token" && m.reachable && !milestonesClaimed.has(m.draws) && drawsSoFar >= m.draws) {
                milestonesClaimed.add(m.draws);
                row(day).notes.push(`Claim ${tokenCount} key${tokenCount > 1 ? "s" : ""} (milestone @ ${m.draws} draws) \u2192 ${tokenCount} free draw${tokenCount > 1 ? "s" : ""}`);
                row(day).draws += tokenCount;
                drawsSoFar += tokenCount;
            }
        }

        if (isFinalDay) {
            const remainingDraws = Math.max(0, totalDrawsTarget - drawsSoFar);
            if (remainingDraws > 0) {
                let toClose = remainingDraws;
                // CoA first (per project CoA-priority rule), 10x-collapse if >10 in one currency.
                const coaAffordableDraws = Math.floor(coaBalance / fullCost);
                const coaDrawsUsed = Math.min(toClose, coaAffordableDraws);
                if (coaDrawsUsed > 0) {
                    const coaCost = coaDrawsUsed >= 10
                        ? Math.floor(coaDrawsUsed / 10) * cost10x + (coaDrawsUsed % 10) * fullCost
                        : coaDrawsUsed * fullCost;
                    coaBalance -= coaCost;
                    row(day).coaSpent += coaCost;
                    row(day).draws += coaDrawsUsed;
                    row(day).notes.push(coaDrawsUsed >= 10 ? `${coaDrawsUsed}x final push (CoA, 10x draw)` : `${coaDrawsUsed}x final push (CoA)`);
                    toClose -= coaDrawsUsed;
                }
                if (toClose > 0) {
                    const diaCost = toClose >= 10
                        ? Math.floor(toClose / 10) * cost10x + (toClose % 10) * fullCost
                        : toClose * fullCost;
                    diaBalance -= diaCost;
                    row(day).diaSpent += diaCost;
                    row(day).draws += toClose;
                    row(day).notes.push(toClose >= 10 ? `${toClose}x final push (dia, 10x draw)` : `${toClose}x final push (dia)`);
                    if (diaBalance < 0) {
                        unaffordableDiaShortfall = -diaBalance;
                        row(day).notes.push(`\u26a0 Short ${unaffordableDiaShortfall} dia to fully close this gap \u2014 recharge needed`);
                    }
                }
                drawsSoFar += remainingDraws;
            }
            if (row(day).draws === 0) row(day).notes.push("No further draws needed \u2014 target already reached");
        } else if (row(day).notes.length === 0) {
            row(day).notes.push("No draw (insufficient balance)");
        }
    }

    const totals = rows.reduce(
        (acc, r) => ({ draws: acc.draws + r.draws, dia: acc.dia + r.diaSpent, coa: acc.coa + r.coaSpent }),
        { draws: 0, dia: 0, coa: 0 }
    );

    return { rows, totals, unaffordableDiaShortfall };
}

function buildCollectorPlan(event, resources, target, ownedItems, confidence) {
    const { skin, targetCrests } = resolveTargetCrests(event, target);
    const ownedGroups = ownedItems?.groups ?? {};
    const ownedSkinIds = ownedItems?.skins ?? [];
    const currentCrests = 0;

    const draws = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds, confidence);
    const supplyPhases = Array.isArray(event.premium_supply) ? event.premium_supply : [];

    // ---- Pass 1: simulate with the user's RAW entered resources (as-is) ----
    function simulateWithPassCount(passCount) {
        const purchases = buildNaivePassPurchases(passCount, supplyPhases);
        const passPlan = weeklyPassPlan(packsData, event.duration_days, purchases);
        const starlight = starlightTiming(event, resources, passPlan.dailyDiamondSchedule);
        const spendPlan = coaPrioritySpendPlan(
            event, resources, targetCrests, currentCrests, ownedGroups, ownedSkinIds,
            passPlan.dailyDiamondSchedule, starlight.day
        );
        const milestones = milestoneTokenSchedule(event, draws);
        const daySchedule = buildCollectorDaySchedule(
            event, resources, spendPlan, starlight, passPlan, milestones, draws.draws
        );
        return { passPlan, starlight, spendPlan, milestones, daySchedule };
    }

    const rawPassCount = Number(resources?.weeklyPasses ?? 0);
    let sim = simulateWithPassCount(rawPassCount);
    let recharge = { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };
    let recommendedPasses = rawPassCount;

    // ---- Gap check: did the raw plan's final-day gap-close actually go negative? ----
    // buildCollectorDaySchedule's final day force-closes the exact remaining draw count,
    // so totals.draws always equals the target regardless of real affordability — the
    // ACTUAL shortfall signal is unaffordableDiaShortfall (diaBalance going negative).
    let diaGap = sim.daySchedule.unaffordableDiaShortfall ?? 0;

    if (diaGap > 0) {
        // Passes restructure the WHOLE schedule (extra diamonds AND extra CoA via the
        // weekly pass CoA box, plus a longer/earlier diamond window) — they are not a
        // flat diamond top-up, so sizing optimizeRecharge() on the raw diamond gap alone
        // and letting its knapsack mix in FP/regular packs picks the wrong combo (it has
        // no way to know N passes also brings free CoA that further shrinks the gap).
        // Instead: try increasing pass count first (the confirmed best BDT/dia option),
        // re-simulating the full schedule each time, and stop at the first count that
        // actually closes the shortfall to zero — matches how the ideal-environment rule
        // is meant to be applied (buy passes first, only reach for other packs if passes
        // alone can't cover it).
        let passOnlyClosedGap = false;
        for (let extraPasses = 1; extraPasses <= 10 - rawPassCount; extraPasses++) {
            const trialPasses = rawPassCount + extraPasses;
            const trialSim = simulateWithPassCount(trialPasses);
            if ((trialSim.daySchedule.unaffordableDiaShortfall ?? 0) === 0) {
                recommendedPasses = trialPasses;
                sim = trialSim;
                passOnlyClosedGap = true;
                break;
            }
        }

        if (passOnlyClosedGap) {
            diaGap = 0; // passes alone closed it — don't let the stale original gap trigger the optimizer below
        } else {
            // Even the max stackable passes (10) can't close it — fall back to the
            // generic knapsack optimizer for whatever gap remains after maxing passes,
            // sized against THAT residual gap (not the original raw-input gap).
            recommendedPasses = 10;
            sim = simulateWithPassCount(10);
            diaGap = sim.daySchedule.unaffordableDiaShortfall ?? 0;
        }

        recharge = diaGap > 0
            ? optimizeRecharge(diaGap, packsData, event.duration_days, resources)
            : { totalBdt: 0, totalDia: 0, completionDay: 0, packsUsed: [], impossible: false };

        // If passes alone closed the gap, still show the recommended passes as a
        // "recharge" entry so PackRecommendation.jsx has something to render — build
        // a synthetic packsUsed entry from packs.json's own weekly_pass pricing.
        if (passOnlyClosedGap && recharge.packsUsed.length === 0) {
            const passData = packsData.weekly_pass;
            const passCountBought = recommendedPasses - rawPassCount;
            recharge = {
                totalBdt: passCountBought * passData.bdt,
                totalDia: passCountBought * (passData.dia_instant + passData.dia_daily * passData.days),
                completionDay: 1,
                packsUsed: [{ id: "weekly_pass", type: "pass", count: passCountBought, bdt: passData.bdt, dia: passData.dia_instant + passData.dia_daily * passData.days }],
                impossible: false,
            };
        }
    }

    const { passPlan, starlight, spendPlan, milestones, daySchedule } = sim;
    const supplyWindows = premiumSupplyWindowPlan(event);
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
        recharge,
        recommendedPasses,
        rawPassCount,
        daySchedule,
        warnings: buildCollectorWarnings(spendPlan, recommendedPasses, rawPassCount),
    };
}

function buildCollectorWarnings(spendPlan, recommendedPasses, rawPassCount) {
    const warnings = [];
    if (recommendedPasses > rawPassCount) {
        const extra = recommendedPasses - rawPassCount;
        warnings.push({
            type: "recharge_recommended",
            message: `Current resources can't complete this plan — buy ${extra} more weekly pass${extra > 1 ? "es" : ""} on Day 1 (see Recommended Recharge below) to reach the target.`,
        });
    }
    if (spendPlan.branch === "diamond_window_then_coa") {
        const { spendEval } = spendPlan;
        const reachedTier = spendEval.useFirst10x ? spendEval.tierWithFirst10x : spendEval.tierDailyOnly;
        const SPEND_TIERS = [100, 250, 500];
        const missedTiers = SPEND_TIERS.filter((t) => t > (reachedTier ?? 0));
        if (reachedTier === null) {
            warnings.push({ type: "no_spend_tier_reached", message: "Current diamonds don't reach any spend-task tier — insufficient diamond inflow within the Day 1-7 window." });
        } else if (missedTiers.length > 0) {
            warnings.push({
                type: "partial_spend_tier",
                message: `Reached spend-${reachedTier} dia task only — spend-${missedTiers.join("/")} not reachable with current diamonds/passes. Add more diamonds (e.g. weekly passes) to unlock those keys.`,
            });
        }
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