// lib/scheduler.js
// Part 5C-i — Event-agnostic scheduler functions (TECH_SPEC.md Steps 0, 1, 2, 7, 8).
// Consumes calculator.js outputs, does not recompute crest math.
//
// EXPLICITLY OUT OF SCOPE for 5C-i (deferred to 5C-ii):
//   - Starlight timing / ≥300 dia conditional wait [Collector only]
//   - CoA priority spend order [Collector only]
//   - Event-specific spend-task strategy (CoA-priority vs daily+singles-vs-10x)
//   - Bingo win-condition scheduling
//   - Final push (last event day gap-close)
//   - Actual recharge AMOUNTS for premium supply windows (5C-i only returns window SHAPE)
//
// premium_supply task timing convention (confirmed 2026-07-17 chat):
//   - "anytime" tasks (no threshold_dia, no diamond dependency, e.g. login): safe to fix
//     at a suggested day now.
//   - "conditional" tasks (depend on player resources reaching a threshold, e.g. Exquisite's
//     starlight_activate needing >=300 dia): 5C-i must NOT invent a day — timing.suggestedDay
//     stays null, resolved later by 5C-ii which has resources in scope.
//   - "window_locked" tasks (threshold_dia present, must land inside phase.start_day..end_day
//     per its event doc): fixed window bounds, amount still deferred to 5C-ii.

import { drawsNeeded } from "./calculator.js";
import { coaSufficiencyCheck } from "./coaSufficiency.js";

// ---------------------------------------------------------------------------
// Step 0 — Free draws / free crests projection
// ---------------------------------------------------------------------------

/**
 * Step 0 (TECH_SPEC.md): project total free crests from daily 1x draws + milestone
 * tokens across the whole event, before any recharge is considered.
 *
 * Free TOKEN milestones (reward_type:"token") are counted as extra free draws and
 * folded into daily_1x_draws for the freeCrests estimate — this mirrors Formula 3's
 * freeTokens param in calculator.js, just computed here since scheduler.js is where
 * milestone token counts first get read out of events.json.
 *
 * Free CREST milestones (reward_type:"crests") are NOT double counted here — those
 * are already subtracted from the target inside drawsNeeded()'s gapAfterMilestones.
 * This function reports them separately (freeMilestoneCrests) for schedule display only.
 *
 * @param {object} event
 * @param {number} targetCrests
 * @param {number} currentCrests
 * @param {object} ownedGroups
 * @param {string[]} ownedSkinIds
 * @returns {{
 *   dailyDrawCrests:number, freeTokenCrests:number, freeMilestoneCrests:number,
 *   totalFreeCrests:number, targetCrests:number, needsRecharge:boolean,
 *   gapAfterFree:number, drawsNeededResult:object
 * }}
 */
export function freeCrestsProjection(event, targetCrests, currentCrests = 0, ownedGroups = {}, ownedSkinIds = []) {
    const duration = event.duration_days;
    if (!duration || duration <= 0) {
        throw new Error(`freeCrestsProjection: event "${event.id}" missing valid duration_days`);
    }

    // Reuse calculator.js — do not recompute E[crests/draw] or milestone-threshold logic here.
    const drawsNeededResult = drawsNeeded(event, targetCrests, currentCrests, ownedGroups, ownedSkinIds);
    const effectiveE = drawsNeededResult.effectiveE;

    // Sum free draw TOKENS from milestones (reward_type:"token") that are actually reachable —
    // reachability uses the same draws_needed >= threshold rule as calculator.js's crest-milestone
    // check, applied here to token-type milestones since calculator.js only handles crest-type.
    const milestones = Array.isArray(event.milestones) ? event.milestones : [];
    let freeTokenCount = 0;
    let freeMilestoneCrests = 0;
    for (const m of milestones) {
        if (m.reward_type === "token" && drawsNeededResult.draws >= m.draws) {
            freeTokenCount += m.tokens ?? 0;
        }
        if (m.reward_type === "crests" && drawsNeededResult.draws >= m.draws) {
            freeMilestoneCrests += m.crests ?? 0;
        }
    }

    const dailyDrawCrests = duration * effectiveE;
    const freeTokenCrests = freeTokenCount * effectiveE;
    const totalFreeCrests = dailyDrawCrests + freeTokenCrests + currentCrests;

    const gapAfterFree = Math.max(0, targetCrests - totalFreeCrests);

    return {
        dailyDrawCrests,
        freeTokenCrests,
        freeMilestoneCrests,
        totalFreeCrests,
        targetCrests,
        needsRecharge: gapAfterFree > 0,
        gapAfterFree,
        drawsNeededResult,
    };
}

// ---------------------------------------------------------------------------
// Step 1 — Weekly pass drip scheduling
// ---------------------------------------------------------------------------

/**
 * Step 1 (TECH_SPEC.md): sequential weekly pass drip scheduling.
 * Passes queue one at a time — pass N's daily drip starts the day pass N-1 finishes,
 * NOT simultaneously. Max 10 stackable (packs.json weekly_pass rule).
 *
 * This function does NOT decide how many passes to buy or which days to buy them —
 * that's a resource/spend-strategy decision (5C-ii). It only lays out, for a GIVEN
 * number of passes and purchase days, what diamonds land on which day.
 *
 * @param {object} packsData - packs.json weekly_pass object
 * @param {number} eventDurationDays
 * @param {Array<{count:number, buyDay:number}>} purchases - e.g. [{count:2,buyDay:1},{count:2,buyDay:8}]
 *   Caller (5C-ii) decides count/buyDay; this function just projects the drip.
 * @returns {{
 *   totalPassesQueued:number, dailyDiamondSchedule:object,
 *   totalDiamondsFromPasses:number, exceedsMaxStack:boolean
 * }}
 */
export function weeklyPassPlan(packsData, eventDurationDays, purchases = []) {
    const pass = packsData?.weekly_pass;
    if (!pass) throw new Error("weeklyPassPlan: packs.json missing weekly_pass");

    const totalPassesQueued = purchases.reduce((sum, p) => sum + (p.count ?? 0), 0);
    const exceedsMaxStack = totalPassesQueued > 10;

    const dailyDiamondSchedule = {}; // { [day]: diaFromPasses }
    const addDia = (day, amount) => {
        if (day < 1 || day > eventDurationDays) return; // drip falling outside event window is lost
        dailyDiamondSchedule[day] = (dailyDiamondSchedule[day] ?? 0) + amount;
    };

    // Passes are sequential: sort purchase batches by buyDay, then queue each individual
    // pass's 7-day drip starting from whichever day the PREVIOUS pass's drip finished
    // (or its own buyDay if the queue is empty / already caught up).
    const sortedPurchases = [...purchases].sort((a, b) => a.buyDay - b.buyDay);
    let queueCursorDay = null; // day the next pass's drip should start

    for (const { count, buyDay } of sortedPurchases) {
        for (let i = 0; i < count; i++) {
            // Instant bonus always lands on the actual purchase day, not the queue day.
            addDia(buyDay, pass.dia_instant);

            const dripStartDay = queueCursorDay !== null ? Math.max(queueCursorDay, buyDay) : buyDay;
            for (let d = 0; d < pass.days; d++) {
                addDia(dripStartDay + d, pass.dia_daily);
            }
            queueCursorDay = dripStartDay + pass.days; // next pass in queue starts after this one's drip ends
        }
    }

    const totalDiamondsFromPasses = Object.values(dailyDiamondSchedule).reduce((a, b) => a + b, 0);

    return { totalPassesQueued, dailyDiamondSchedule, totalDiamondsFromPasses, exceedsMaxStack };
}

// ---------------------------------------------------------------------------
// Step 2 — Premium supply window SHAPE (no recharge amounts decided here)
// ---------------------------------------------------------------------------

/**
 * Step 2 (TECH_SPEC.md): read event.premium_supply[] and classify each task's timing
 * without deciding recharge amounts (5C-ii's job). See file-header note for the
 * anytime / conditional / window_locked convention.
 *
 * @param {object} event
 * @returns {Array<{phase:number, startDay:number, endDay:number, tasks:Array<object>}>}
 */
export function premiumSupplyWindowPlan(event) {
    const supply = event.premium_supply;
    if (typeof supply === "string") {
        // Placeholder sentinel (e.g. Sanrio's "PLACEHOLDER_NEEDS_CONFIRMATION") — no confirmed
        // data exists yet. Fail loudly rather than silently returning an empty schedule.
        throw new Error(
            `premiumSupplyWindowPlan: event "${event.id}" premium_supply is an unconfirmed placeholder ("${supply}") — cannot schedule`
        );
    }
    if (!Array.isArray(supply)) {
        throw new Error(`premiumSupplyWindowPlan: event "${event.id}" missing premium_supply array`);
    }

    return supply.map((phase) => {
        const startDay = phase.start_day;
        const duration = phase.duration_days;
        if (!startDay || !duration) {
            throw new Error(
                `premiumSupplyWindowPlan: event "${event.id}" phase ${phase.phase} missing start_day/duration_days`
            );
        }
        const endDay = startDay + duration - 1;

        const tasks = (phase.tasks ?? []).map((task) => {
            const hasThreshold = typeof task.threshold_dia === "number";

            // "anytime" tasks: no threshold_dia AND no diamond dependency implied by task type.
            // starlight_activate is the one confirmed exception — it has no threshold_dia field
            // but genuinely depends on a >=300 dia balance (EXQUISITE_COLLECTION_EVENT.md), so it
            // must NOT be misclassified as a free "anytime" task just because it lacks the field.
            if (task.type === "starlight_activate") {
                return { ...task, timing: "conditional", condition: "dia_balance >= 300", suggestedDay: null };
            }
            if (!hasThreshold) {
                return { ...task, timing: "anytime", suggestedDay: startDay };
            }
            return { ...task, timing: "window_locked", windowStartDay: startDay, windowEndDay: endDay, suggestedDay: null };
        });

        return { phase: phase.phase, startDay, endDay, tasks };
    });
}

// ---------------------------------------------------------------------------
// Step 7 — Daily draw schedule skeleton
// ---------------------------------------------------------------------------

/**
 * Step 7 (TECH_SPEC.md) skeleton: one row per event day for the mandatory daily
 * discounted 1x draw. The final day's row is tagged "final_push_pending" — 5C-ii
 * fills in the actual gap-close action (10x batches + singles) since that needs
 * live crest totals, which this event-agnostic pass does not compute.
 *
 * @param {object} event
 * @returns {Array<{day:number, action:string, isFinalDay:boolean}>}
 */
export function dailyDrawSchedule(event) {
    const duration = event.duration_days;
    if (!duration || duration <= 0) {
        throw new Error(`dailyDrawSchedule: event "${event.id}" missing valid duration_days`);
    }

    const schedule = [];
    for (let day = 1; day <= duration; day++) {
        const isFinalDay = day === duration;
        schedule.push({
            day,
            action: isFinalDay ? "daily_1x + final_push_pending" : "daily_1x",
            isFinalDay,
        });
    }
    return schedule;
}

// ---------------------------------------------------------------------------
// Step 8 — Milestone token consumption timing
// ---------------------------------------------------------------------------

/**
 * Step 8 (TECH_SPEC.md): map each reachable milestone (per drawsNeeded()'s own
 * draws >= threshold check) to an APPROXIMATE calendar day, assuming daily-1x-only
 * pacing (1 draw/day baseline — a simplification; actual day may land earlier if
 * the player recharges/bulk-draws, which 5C-ii's spend strategy will adjust).
 *
 * "other" reward_type milestones (e.g. Street Fighter's draw-60 potion) are included
 * for schedule completeness but flagged nonCalculable so the UI can grey them out.
 *
 * @param {object} event
 * @param {object} drawsNeededResult - output of calculator.js drawsNeeded()
 * @returns {Array<{draws:number, approxDay:number, reward_type:string, reachable:boolean, nonCalculable:boolean, detail:object}>}
 */
export function milestoneTokenSchedule(event, drawsNeededResult) {
    const milestones = Array.isArray(event.milestones) ? event.milestones : [];
    if (typeof event.milestones === "string") {
        throw new Error(
            `milestoneTokenSchedule: event "${event.id}" milestones is an unconfirmed placeholder ("${event.milestones}") — cannot schedule`
        );
    }

    return milestones.map((m) => {
        const reachable = drawsNeededResult.draws >= m.draws;
        return {
            draws: m.draws,
            approxDay: m.draws, // 1 draw/day baseline under daily-1x-only pacing; refined by 5C-ii
            reward_type: m.reward_type,
            reachable,
            nonCalculable: m.reward_type === "other",
            detail: m,
        };
    });
}

// ===========================================================================
// PART 5C-ii — Resource-dependent scheduler functions
// (TECH_SPEC.md Steps 3, 4, 5, 6 + SCHEDULING_APPROACHES.md event-specific techniques)
//
// These functions take `resources` (from wizardContext Step 1: diamonds, coa,
// weeklyPasses, firstPassDate, fpClaimed) as real input — this is the boundary
// 5C-i couldn't cross. Not wired to live UI yet (Step 4 / Part 7 doesn't exist),
// so tested here with hand-built resource objects standing in for that input.
//
// Event branching (confirmed 2026-07-17): caller decides which spend strategy
// to run based on event.type — this file exposes both, does not auto-select,
// since scheduler.js has no knowledge of a "top-level orchestrator" yet (that's
// effectively Part 7's job once the results page exists).
// ===========================================================================

// ---------------------------------------------------------------------------
// Step 3 — Starlight timing [Collector/Exquisite Collection ONLY]
// ---------------------------------------------------------------------------

/**
 * Step 3 (TECH_SPEC.md): find the first day the player's diamond balance
 * (starting resources.diamonds + weekly pass drip, per 5C-i's weeklyPassPlan
 * output) reaches >= 300, and schedule Starlight purchase there.
 *
 * Does NOT decide whether to buy more passes to reach 300 faster — that's a
 * knapsack/optimizer (Part 5D) concern. This function only answers: given the
 * pass plan already chosen, on what day does Starlight become affordable.
 *
 * @param {object} event - must be type "collector"
 * @param {object} resources - { diamonds, ... } from wizardContext, diamonds as string or number
 * @param {object} dailyDiamondSchedule - weeklyPassPlan().dailyDiamondSchedule (day -> dia from passes)
 * @returns {{ affordable:boolean, day:number|null, balanceOnDay:number|null }}
 */
export function starlightTiming(event, resources, dailyDiamondSchedule = {}) {
    if (event.type !== "collector") {
        throw new Error(`starlightTiming: event "${event.id}" is not type "collector" — Starlight only applies to Collector events`);
    }
    const STARLIGHT_THRESHOLD = 300;
    const startingDia = Number(resources?.diamonds ?? 0);

    if (startingDia >= STARLIGHT_THRESHOLD) {
        return { affordable: true, day: 1, balanceOnDay: startingDia };
    }

    let runningBalance = startingDia;
    const duration = event.duration_days;
    for (let day = 1; day <= duration; day++) {
        runningBalance += dailyDiamondSchedule[day] ?? 0;
        if (runningBalance >= STARLIGHT_THRESHOLD) {
            return { affordable: true, day, balanceOnDay: runningBalance };
        }
    }

    // Never reaches 300 within the event under this pass plan — caller (optimizer)
    // may need to recommend an additional pass or direct top-up.
    return { affordable: false, day: null, balanceOnDay: runningBalance };
}

// ---------------------------------------------------------------------------
// Step 6 — CoA priority spend order [Collector/Exquisite Collection ONLY]
// REWRITTEN 2026-07-19 — see SCHEDULING_APPROACHES.md "Ideal draw environment"
// (confirmed rule). Supersedes the old flat "always clear to spend_500" version.
// ---------------------------------------------------------------------------

/**
 * "Ideal Collector-event draw environment" (SCHEDULING_APPROACHES.md, confirmed 2026-07-19).
 * Three-branch spend order:
 *   Step 0 — coaSufficiencyCheck(): if CoA alone (no Starlight, no spend-task keys) already
 *            covers target crests across the full event, skip diamonds AND Starlight
 *            entirely — CoA-only draws from Day 1.
 *   Step 1 — otherwise, spend diamonds on daily 1x (Day 1 onward) up to the HIGHEST
 *            spend-task tier actually reachable (100/250/500) — stop there, never overspend
 *            chasing an unreachable next tier. The one-time first-10x discount is used on
 *            Day 1 ONLY if it's affordable AND it either unlocks a higher tier than
 *            daily-1x-only would reach, or reaches the SAME tier meaningfully sooner
 *            (frees the CoA-only phase to start earlier) — never spent if it wouldn't
 *            change the outcome.
 *   Step 2 — Starlight bought as soon as running diamond balance (starting dia + pass drip)
 *            crosses >=300 — only relevant/needed if Step 0 didn't already skip it.
 *   Step 3 — CoA-only phase starts the day after the diamond window closes, runs until
 *            CoA is fully depleted.
 *   Step 4 — any key (login, spend-task, Starlight, milestone) redeemed as a free draw
 *            immediately when earned — no benefit to banking (handled by Part 7's
 *            day-by-day renderer, not this function).
 *   Step 5 — final day: remaining diamonds first, then remaining CoA, on full-price
 *            singles to close the exact gap (see finalPushPlan()).
 *
 * @param {object} event - must be type "collector"
 * @param {object} resources - { diamonds, coa } (raw strings/numbers from wizardContext)
 * @param {number} targetCrests
 * @param {number} currentCrests
 * @param {object} ownedGroups
 * @param {string[]} ownedSkinIds
 * @param {object} dailyDiamondSchedule - from weeklyPassPlan(), day -> dia from passes
 * @param {number|null} starlightDay - from starlightTiming(), or null if not affordable
 *   (ignored/irrelevant if Step 0 skips diamonds entirely)
 * @returns {{
 *   branch: "coa_only_skip_diamonds"|"diamond_window_then_coa",
 *   sufficiency: object,
 *   spendEval?: object,
 *   phase1: object|null,
 *   phase2: object,
 *   phase3: object|null
 * }}
 */
const SPEND_TIERS = [100, 250, 500]; // must match event.premium_supply task thresholds

function evaluateSpendWindow(event, startingDia, dailyDiamondSchedule, windowEndDay) {
    const duration = Math.min(event.duration_days, windowEndDay ?? event.duration_days);
    const dailyCost = event.discount_draw_cost?.daily_1x;
    const first10xCost = event.discount_draw_cost?.first_time_10x;
    if (!dailyCost || !first10xCost) {
        throw new Error(`evaluateSpendWindow: event "${event.id}" missing discount_draw_cost fields`);
    }

    function simulate(useFirst10xOnDay1) {
        let dia = startingDia;
        let cumSpend = 0;
        let highestTierReached = null;
        let dayTierReached = null;
        let lastDayDrawAffordable = 0; // fallback: last day diamonds could still fund a daily 1x

        for (let day = 1; day <= duration; day++) {
            dia += dailyDiamondSchedule[day] ?? 0;

            if (day === 1 && useFirst10xOnDay1) {
                if (dia >= first10xCost) {
                    dia -= first10xCost;
                    cumSpend += first10xCost;
                }
            }

            if (dia >= dailyCost) {
                dia -= dailyCost;
                cumSpend += dailyCost;
                lastDayDrawAffordable = day;
            }

            for (const tier of SPEND_TIERS) {
                if (cumSpend >= tier && (highestTierReached === null || tier > highestTierReached)) {
                    highestTierReached = tier;
                    dayTierReached = day;
                }
            }

            if (highestTierReached === 500) break;
        }

        // If no tier was ever reached, the window still closes once diamonds are exhausted
        // (last day a daily-1x draw was affordable) — must not silently run the full event
        // duration with nothing happening.
        const endDay = dayTierReached ?? Math.max(1, lastDayDrawAffordable);

        return { highestTierReached, dayTierReached, finalCumSpend: cumSpend, endDay };
    }

    const dailyOnly = simulate(false);
    const withFirst10x = simulate(true);

    // Affordability gate must use the Day-1 balance AFTER pass/drip inflow (matching what
    // simulate() itself checks internally), not raw startingDia — a player with e.g. 336
    // starting dia can't afford a 350-cost first-10x alone, but CAN once Day-1 pass
    // diamonds land on top of it.
    const day1Balance = startingDia + (dailyDiamondSchedule[1] ?? 0);

    const useFirst10x =
        day1Balance >= first10xCost &&
        (
            (withFirst10x.highestTierReached ?? 0) > (dailyOnly.highestTierReached ?? 0) ||
            // Same tier, but reached sooner — still worth it, since it frees the CoA-only
            // phase to start earlier.
            (
                (withFirst10x.highestTierReached ?? 0) === (dailyOnly.highestTierReached ?? 0) &&
                (withFirst10x.highestTierReached ?? 0) > 0 &&
                withFirst10x.dayTierReached < dailyOnly.dayTierReached
            )
        );

    const chosen = useFirst10x ? withFirst10x : dailyOnly;

    return {
        tierDailyOnly: dailyOnly.highestTierReached,
        dayTierDailyOnlyReached: dailyOnly.dayTierReached,
        tierWithFirst10x: withFirst10x.highestTierReached,
        dayTierWithFirst10xReached: withFirst10x.dayTierReached,
        useFirst10x,
        diamondWindowEndDay: chosen.endDay,
        cumulativeDiaSpent: chosen.finalCumSpend,
    };
}

export function coaPrioritySpendPlan(
    event, resources, targetCrests, currentCrests, ownedGroups, ownedSkinIds,
    dailyDiamondSchedule, starlightDay
) {
    if (event.type !== "collector") {
        throw new Error(`coaPrioritySpendPlan: event "${event.id}" is not type "collector"`);
    }
    const startingDia = Number(resources?.diamonds ?? 0);
    const startingCoa = Number(resources?.coa ?? 0);

    // ---- Step 0: CoA-sufficiency check ----
    const sufficiency = coaSufficiencyCheck(event, targetCrests, currentCrests, startingCoa, ownedGroups, ownedSkinIds);

    if (sufficiency.sufficient) {
        return {
            branch: "coa_only_skip_diamonds",
            sufficiency,
            note: "CoA alone covers target crests — diamonds and Starlight skipped entirely. CoA-only draws Day 1 through event end, redeem milestone keys as earned.",
            phase1: null,
            phase2: {
                startDay: 1,
                currency: "coa",
                note: "CoA-only draws from Day 1. No diamond spend-task window, no Starlight purchase.",
            },
            phase3: null,
        };
    }

    // ---- Step 1: diamond spend-task window, stop at highest reachable tier ----
    // Cap the simulation to the premium supply phase's own end day (e.g. Day 7 for
    // Exquisite Collection) — spend_100/250/500 tasks are only checkable inside that
    // window; spending diamonds past it doesn't earn any more spend-task keys.
    const supplyPhases = Array.isArray(event.premium_supply) ? event.premium_supply : [];
    const spendPhase = supplyPhases.find((p) =>
        (p.tasks ?? []).some((t) => t.type?.startsWith("spend_"))
    );
    const windowEndDay = spendPhase ? spendPhase.start_day + spendPhase.duration_days - 1 : undefined;
    const spendEval = evaluateSpendWindow(event, startingDia, dailyDiamondSchedule, windowEndDay);

    // ---- Step 2: Starlight timing note (actual day computed by starlightTiming(), passed in) ----
    const starlightNote = starlightDay
        ? `Buy Starlight on day ${starlightDay} (diamond balance reaches >=300 that day).`
        : "Starlight not affordable within current diamond/pass plan.";

    return {
        branch: "diamond_window_then_coa",
        sufficiency,
        spendEval,
        phase1: {
            startDay: 1,
            endDay: spendEval.diamondWindowEndDay,
            currency: "diamonds",
            highestTierReached: spendEval.useFirst10x ? spendEval.tierWithFirst10x : spendEval.tierDailyOnly,
            useFirst10xOnDay1: spendEval.useFirst10x,
            note: `Spend diamonds on daily 1x${spendEval.useFirst10x ? " + first-time 10x (Day 1, unlocks a higher/faster tier)" : ""} until the highest reachable spend-task tier clears (reached: ${spendEval.useFirst10x ? spendEval.tierWithFirst10x : spendEval.tierDailyOnly ?? "none"}). ${starlightNote}`,
        },
        phase2: {
            startDay: spendEval.diamondWindowEndDay + 1,
            currency: "coa",
            note: "Diamond spending stops. All subsequent draws paid from CoA balance until CoA is fully depleted.",
            endsWhen: "coa_balance === 0",
        },
        phase3: {
            currency: "diamonds",
            note: "Resume diamond spending (recharge packs / remaining balance) to finish the draw target, once CoA is exhausted.",
            startsWhen: "coa_balance === 0",
        },
    };
}

// ---------------------------------------------------------------------------
// Step 4 — Spend-task strategy: daily-1x+singles vs 10x-bulk [Themed Crest / Legend / Special]
// ---------------------------------------------------------------------------

/**
 * SCHEDULING_APPROACHES.md technique: for a given premium supply window, compare
 * the diamond cost of (a) letting daily-1x draws accumulate + topping up with
 * regular singles, vs (b) doing a 10x bulk draw, to hit the window's spend
 * threshold. Picks whichever is cheaper for THIS event's actual numbers —
 * explicitly NOT hardcoded to "always daily+singles" (Exquisite's own 7-day/
 * 500-threshold/500-10x-cost combo is a confirmed counter-example where bulk
 * wins), so this function recomputes both paths every time it's called.
 *
 * NOTE: Exquisite Collection should NOT call this function — it uses
 * coaPrioritySpendPlan() instead, which already accounts for its cost tradeoff
 * via the CoA-priority technique. Calling this on a "collector" event throws.
 *
 * @param {object} event - must NOT be type "collector"
 * @param {number} spendThreshold - dia threshold to hit (e.g. 100, 250, 500)
 * @param {number} windowDurationDays - length of the premium supply window
 * @returns {{
 *   pathA: { label:string, diamonds:number, draws:number },
 *   pathB: { label:string, diamonds:number, draws:number },
 *   cheaper: "pathA"|"pathB", savings:number
 * }}
 */
export function spendTaskStrategy(event, spendThreshold, windowDurationDays) {
    if (event.type === "collector") {
        throw new Error(
            `spendTaskStrategy: event "${event.id}" is type "collector" — use coaPrioritySpendPlan() instead, this event's spend tradeoff is already resolved by the CoA-priority technique`
        );
    }
    const cost1x = event.draw_cost_1x;
    const cost10x = event.draw_cost_10x;
    const daily1x = event.discount_draw_cost?.daily_1x;
    if (!cost1x || !cost10x || !daily1x) {
        throw new Error(`spendTaskStrategy: event "${event.id}" missing draw_cost_1x/10x or discount_draw_cost.daily_1x`);
    }

    // Path A — daily 1x (discounted) for each day of the window, then top up the
    // remaining gap with minimum regular singles (never a 10x bulk purely for spend).
    const dailyTotal = daily1x * windowDurationDays;
    let pathADia, pathADraws;
    if (dailyTotal >= spendThreshold) {
        // Daily discount alone already clears the threshold — no singles needed.
        pathADia = dailyTotal;
        pathADraws = windowDurationDays;
    } else {
        const gap = spendThreshold - dailyTotal;
        const singlesNeeded = Math.ceil(gap / cost1x);
        pathADia = dailyTotal + singlesNeeded * cost1x;
        pathADraws = windowDurationDays + singlesNeeded;
    }

    // Path B — one 10x bulk draw (spends cost10x regardless of whether it exceeds
    // the threshold — the "convenience" option per SCHEDULING_APPROACHES.md).
    const pathBDia = cost10x;
    const pathBDraws = 10;

    const cheaper = pathADia <= pathBDia ? "pathA" : "pathB";
    const savings = Math.abs(pathADia - pathBDia);

    return {
        pathA: { label: "Daily 1x + top-up singles", diamonds: pathADia, draws: pathADraws },
        pathB: { label: "10x bulk draw", diamonds: pathBDia, draws: pathBDraws },
        cheaper,
        savings,
    };
}

// ---------------------------------------------------------------------------
// Step 5 — Final push [ALL event types]
// ---------------------------------------------------------------------------

/**
 * Step 5 (TECH_SPEC.md): last event day gap-close. Given the ACTUAL crests
 * earned by the final day (a live figure Part 7 will compute by walking the
 * day-by-day schedule — this function does not simulate draws itself), close
 * the exact remaining gap with 10x batches first, then singles for the
 * remainder. Never buys more than the exact gap requires.
 *
 * @param {object} event
 * @param {number} actualCrestsAtFinalDay - live total from Part 7's day-by-day walk
 * @param {number} targetCrests
 * @param {number} effectiveE - E[crests/draw] at whatever confidence level the
 *   final push should assume (realistic, per Step 5's "check actual crests" framing —
 *   caller passes whichever confidence the results page is currently showing)
 * @returns {{
 *   gap:number, tenxBatches:number, singles:number, totalDiamonds:number,
 *   overshootCrests:number
 * }}
 */
export function finalPushPlan(event, actualCrestsAtFinalDay, targetCrests, effectiveE) {
    const cost1x = event.draw_cost_1x;
    const cost10x = event.draw_cost_10x;
    if (!cost1x || !cost10x) {
        throw new Error(`finalPushPlan: event "${event.id}" missing draw_cost_1x/10x`);
    }
    if (!effectiveE || effectiveE <= 0) {
        throw new Error(`finalPushPlan: effectiveE must be a positive number`);
    }

    const gap = Math.max(0, targetCrests - actualCrestsAtFinalDay);
    if (gap === 0) {
        return { gap: 0, tenxBatches: 0, singles: 0, totalDiamonds: 0, overshootCrests: 0 };
    }

    const drawsNeededForGap = Math.ceil(gap / effectiveE);
    const tenxBatches = Math.floor(drawsNeededForGap / 10);
    const remainingDraws = drawsNeededForGap - tenxBatches * 10;

    const totalDiamonds = tenxBatches * cost10x + remainingDraws * cost1x;
    const totalDrawsBought = tenxBatches * 10 + remainingDraws;
    const overshootCrests = totalDrawsBought * effectiveE - gap;

    return { gap, tenxBatches, singles: remainingDraws, totalDiamonds, overshootCrests };
}


// ===========================================================================
// PART 5C-iii — Themed Crest / Legend / Special "Ideal draw environment"
// (SCHEDULING_APPROACHES.md, confirmed — diamonds-only, no CoA, no Starlight,
// mirrors Collector's ideal-environment structure but simpler: no sufficiency-
// skip branch, since there's no second currency to prefer over diamonds.)
//
// Ideal method (confirmed by user, this chat):
//   1. Daily 1x every day — non-negotiable (dailyDrawSchedule(), already exists).
//   2. No recharge outside premium supply windows — hold diamonds otherwise.
//   3. On each premium supply window: recharge to clear whichever recharge_*/
//      spend_* tiers actually exist on THAT event's task list (read dynamically
//      from event.premium_supply[].tasks — NOT hardcoded to Collector's
//      100/250/500, since Street Fighter stops at 250 and future events may
//      differ). Recharge-triggered tasks (recharge_any/50/100/250) are a
//      separate check from spend-triggered tasks (spend_100/250) — an event
//      can have both in the same window (Street Fighter does; Collector's
//      Day1-7 window only has spend tasks).
//   4. Surprise ladder (if present on the event): recharge diamonds already
//      spent in step 3 are credited toward it automatically — no separate
//      recharge recommended purely for the ladder. Generic hook, works for
//      Street Fighter's cumulative surprise_rewards_ladder shape AND Soul
//      Vessel's window-based surprise_tasks shape; returns applicable:false
//      for events with neither.
//   5. Last day: bulk draws to close the gap — handled separately by the
//      existing finalPushPlan(), not duplicated here.
//
// NEW THIS PART: dailyBalanceGapCheck() — catches the case where STARTING
// diamonds are too low to even afford Day 1's daily-1x (or run dry any later
// day before the next premium-supply recharge tops the balance back up).
// Runs first, before phase-by-phase spend planning, since a balance gap can
// occur outside a supply window too (e.g. no passes, low starting diamonds,
// long gap between phases).
// ===========================================================================

// ---------------------------------------------------------------------------
// Step 0 (NEW) — Daily balance gap check [Themed Crest / Legend / Special —
// diamonds-only events. NOT for Collector, which has its own CoA-based
// sufficiency check in coaSufficiency.js and a separate balance model.]
// ---------------------------------------------------------------------------

/**
 * Walks the event day by day (starting diamonds + weekly pass drip only —
 * NO CoA, this is diamonds-only per the themed-crest/legend/special draw
 * currency) and flags any day where the running balance can't cover that
 * day's discounted daily-1x cost. This is the case a naive "recharge only
 * during premium supply windows" plan misses: if starting diamonds are too
 * low, even Day 1's daily-1x draw could be skipped, or a long gap between
 * supply windows could run the balance dry mid-event.
 *
 * Does NOT recommend a specific pack to close the gap — that's Part 5D's
 * (optimizer's) job. Only reports WHERE the gaps are and how large, so the
 * caller/optimizer knows a top-up is needed by that day at the latest.
 *
 * @param {object} event - must NOT be type "collector" (diamonds-only assumption)
 * @param {object} resources - { diamonds } from wizardContext (string or number)
 * @param {object} dailyDiamondSchedule - weeklyPassPlan().dailyDiamondSchedule (day -> dia from passes)
 * @returns {{
 *   hasGaps: boolean,
 *   gaps: Array<{day:number, balanceBeforeDraw:number, shortfall:number}>,
 *   finalBalance: number
 * }}
 */
export function dailyBalanceGapCheck(event, resources, dailyDiamondSchedule = {}) {
    if (event.type === "collector") {
        throw new Error(
            `dailyBalanceGapCheck: event "${event.id}" is type "collector" — Collector uses CoA + a different sufficiency model (see coaSufficiency.js), not this diamonds-only check`
        );
    }
    const duration = event.duration_days;
    if (!duration || duration <= 0) {
        throw new Error(`dailyBalanceGapCheck: event "${event.id}" missing valid duration_days`);
    }
    const dailyCost = event.discount_draw_cost?.daily_1x;
    if (!dailyCost) {
        throw new Error(`dailyBalanceGapCheck: event "${event.id}" missing discount_draw_cost.daily_1x`);
    }

    let balance = Number(resources?.diamonds ?? 0);
    const gaps = [];

    for (let day = 1; day <= duration; day++) {
        balance += dailyDiamondSchedule[day] ?? 0;

        if (balance < dailyCost) {
            gaps.push({
                day,
                balanceBeforeDraw: balance,
                shortfall: dailyCost - balance,
            });
            // Daily 1x is skipped this day under current resources — balance carries
            // forward unspent (no draw happened), NOT reset to 0. Next day's pass
            // drip (if any) still adds on top.
            continue;
        }

        balance -= dailyCost;
    }

    return { hasGaps: gaps.length > 0, gaps, finalBalance: balance };
}

// ---------------------------------------------------------------------------
// Step 3b (NEW) — Recharge-triggered premium supply tasks (separate from
// spend-triggered tasks, which spendTaskStrategy() already handles).
// [Themed Crest / Legend / Special — NOT Collector, guarded below]
// ---------------------------------------------------------------------------

/**
 * Recharge tasks (recharge_any / recharge_50 / recharge_100 / recharge_250 /
 * recharge_500 — whichever tiers actually exist on this event's phase) trigger
 * off CUMULATIVE DIAMONDS RECHARGED during the window, regardless of how those
 * diamonds are then spent. Unlike spend tasks, there's no cost-comparison to
 * make (no "path A vs path B") — recharging via a weekly pass or a direct pack
 * both count identically toward the threshold, so this just checks which tiers
 * a given recharge amount clears.
 *
 * Tiers are read DYNAMICALLY from phase.tasks — never hardcoded — since
 * Street Fighter has any/50/100/250 and a future event could differ.
 *
 * @param {object} event - must NOT be type "collector"
 * @param {object} phase - one entry from event.premium_supply[] (already has .tasks[])
 * @param {number} cumulativeRechargeDia - total diamonds recharged during this window
 * @returns {{
 *   tiersCleared: Array<{type:string, threshold_dia:number, tokens:number}>,
 *   tokensEarned: number,
 *   highestThresholdCleared: number
 * }}
 */
export function rechargeTaskStrategy(event, phase, cumulativeRechargeDia) {
    if (event.type === "collector") {
        throw new Error(
            `rechargeTaskStrategy: event "${event.id}" is type "collector" — use coaPrioritySpendPlan() instead`
        );
    }
    const rechargeTasks = (phase.tasks ?? []).filter((t) => t.type?.startsWith("recharge_"));

    const tiersCleared = [];
    let tokensEarned = 0;
    let highestThresholdCleared = 0;

    for (const task of rechargeTasks) {
        const threshold = task.threshold_dia ?? 0;
        if (cumulativeRechargeDia >= threshold) {
            tiersCleared.push({ type: task.type, threshold_dia: threshold, tokens: task.tokens ?? 0 });
            tokensEarned += task.tokens ?? 0;
            if (threshold > highestThresholdCleared) highestThresholdCleared = threshold;
        }
    }

    return { tiersCleared, tokensEarned, highestThresholdCleared };
}

// ---------------------------------------------------------------------------
// Step 4 (NEW) — Surprise task / surprise ladder generic hook
// ---------------------------------------------------------------------------

/**
 * Generic placeholder/hook for events with an EXTRA recharge-triggered reward
 * track beyond standard Premium Supply — covers two known shapes:
 *   - Street Fighter's surprise_rewards_ladder: cumulative, event-wide (not
 *     per-window), diamond-recharge-triggered, array of dia thresholds.
 *   - Soul Vessel-style surprise_tasks: window-based (active_days), also
 *     recharge-triggered, smaller threshold set.
 * If an event has NEITHER field, returns applicable:false — safe no-op for
 * every event that doesn't have this mechanic (most of them).
 *
 * Diamonds already recharged for Premium Supply (step 3/3b) are the SAME
 * diamonds that count here — this function does not recommend any additional
 * recharge, it only reports which ladder tiers that spend already crosses.
 *
 * Reward token math is intentionally NOT computed here — reward types vary
 * per tier (items/crates/crests, not draw tokens for every tier) and are not
 * uniformly confirmed across events yet. This returns threshold-crossed flags
 * only; callers should not assume every crossed tier yields draw tokens.
 *
 * @param {object} event
 * @param {number} cumulativeRechargeDia - total diamonds recharged so far (event-wide)
 * @returns {{
 *   applicable: boolean,
 *   type: "cumulative_ladder"|"window_tasks"|null,
 *   tiersCrossed: Array<number>|Array<object>,
 *   note: string
 * }}
 */
export function surpriseTaskProgress(event, cumulativeRechargeDia = 0) {
    if (Array.isArray(event.surprise_rewards_ladder)) {
        const tiersCrossed = event.surprise_rewards_ladder.filter((t) => cumulativeRechargeDia >= t);
        return {
            applicable: true,
            type: "cumulative_ladder",
            tiersCrossed,
            note: "Cumulative recharge ladder — tiers crossed are informational (rewards are items/crates, not draw tokens, except where confirmed otherwise). No extra recharge recommended beyond what Premium Supply already needs.",
        };
    }

    if (event.has_surprise_tasks && event.surprise_tasks && typeof event.surprise_tasks === "object") {
        const tasks = event.surprise_tasks.tasks ?? [];
        const tiersCrossed = tasks.filter((t) => cumulativeRechargeDia >= (t.threshold_dia ?? 0));
        return {
            applicable: true,
            type: "window_tasks",
            tiersCrossed,
            note: `Window-based surprise tasks (active first ${event.surprise_tasks.active_days ?? "?"} days) — claim within window, do not bank.`,
        };
    }

    return { applicable: false, type: null, tiersCrossed: [], note: "Event has no surprise task/ladder mechanic." };
}

// ---------------------------------------------------------------------------
// Orchestrator — Ideal Themed Crest / Legend / Special draw environment
// ---------------------------------------------------------------------------

/**
 * Ties together dailyBalanceGapCheck (Step 0), the existing daily draw
 * schedule, per-phase spend/recharge tier planning (Steps 3/3b), and the
 * surprise ladder hook (Step 4) into one orchestrated plan — the Themed
 * Crest/Legend/Special equivalent of coaPrioritySpendPlan().
 *
 * Does NOT call finalPushPlan() — stays a separate Part 7 call, same as
 * Collector's plan.
 *
 * @param {object} event - must NOT be type "collector" or "bingo"
 * @param {object} resources - { diamonds } from wizardContext
 * @param {object} dailyDiamondSchedule - from weeklyPassPlan()
 * @returns {{
 *   balanceGaps: object,
 *   dailySchedule: Array<object>,
 *   phases: Array<object>,
 *   surpriseLadder: object,
 *   totalCumulativeRechargeDia: number
 * }}
 */
export function themedCrestIdealPlan(event, resources, dailyDiamondSchedule = {}) {
    if (event.type === "collector") {
        throw new Error(
            `themedCrestIdealPlan: event "${event.id}" is type "collector" — use coaPrioritySpendPlan() instead`
        );
    }
    if (event.type === "bingo") {
        throw new Error(
            `themedCrestIdealPlan: event "${event.id}" is type "bingo" — bingo has no crest target, use bingoWinCondition() instead`
        );
    }

    // Step 0 — balance gap check (diamonds-only, runs before window planning).
    const balanceGaps = dailyBalanceGapCheck(event, resources, dailyDiamondSchedule);

    // Step 1 — daily draw schedule skeleton (reuse existing, unchanged).
    const dailySchedule = dailyDrawSchedule(event);

    // Step 3/3b — per-phase spend + recharge tier planning. Tiers read
    // dynamically per phase, not hardcoded.
    const supply = event.premium_supply;
    if (typeof supply === "string") {
        throw new Error(
            `themedCrestIdealPlan: event "${event.id}" premium_supply is an unconfirmed placeholder ("${supply}") — cannot plan`
        );
    }
    if (!Array.isArray(supply)) {
        throw new Error(`themedCrestIdealPlan: event "${event.id}" missing premium_supply array`);
    }

    let totalCumulativeRechargeDia = 0;
    const phases = supply.map((phase) => {
        const windowDuration = (phase.duration_days ?? 1);

        // Spend-side tiers: derive distinct threshold_dia values from spend_* tasks
        // on this phase, run spendTaskStrategy() per threshold (dynamic, not
        // hardcoded to Collector's [100,250,500]).
        const spendTasks = (phase.tasks ?? []).filter((t) => t.type?.startsWith("spend_"));
        const spendResults = spendTasks.map((task) => {
            const result = spendTaskStrategy(event, task.threshold_dia, windowDuration);
            return { type: task.type, threshold_dia: task.threshold_dia, tokens: task.tokens, ...result };
        });

        // Highest reachable spend tier's diamond cost is what actually gets
        // recharged for this window (the rest are automatically covered once
        // the highest tier's diamonds are spent, since spend tasks share the
        // same underlying draws).
        const highestSpend = spendResults.reduce(
            (best, r) => (r.threshold_dia > (best?.threshold_dia ?? -1) ? r : best),
            null
        );
        const windowRechargeDia = highestSpend
            ? Math.min(highestSpend.pathA.diamonds, highestSpend.pathB.diamonds)
            : 0;

        totalCumulativeRechargeDia += windowRechargeDia;

        // Recharge-side tiers: check which recharge_* tasks the above recharge
        // amount clears (recharging to cover the highest spend tier usually
        // clears recharge tiers too, since recharge >= spend in every event
        // we've seen so far — but computed independently, not assumed).
        const rechargeResult = rechargeTaskStrategy(event, phase, windowRechargeDia);

        return {
            phase: phase.phase,
            startDay: phase.start_day,
            endDay: phase.start_day + windowDuration - 1,
            spendResults,
            rechargeResult,
            windowRechargeDia,
            note: highestSpend
                ? `Recharge ~${windowRechargeDia} dia this window (cheaper path: ${highestSpend.pathA.diamonds <= highestSpend.pathB.diamonds ? highestSpend.pathA.label : highestSpend.pathB.label}) — clears spend tier ${highestSpend.threshold_dia} + recharge tiers up to ${rechargeResult.highestThresholdCleared}.`
                : "No spend-tier tasks in this window.",
        };
    });

    // Step 4 — surprise ladder/task hook, credited off total recharge across
    // all windows (no extra recharge recommended purely for the ladder).
    const surpriseLadder = surpriseTaskProgress(event, totalCumulativeRechargeDia);

    return { balanceGaps, dailySchedule, phases, surpriseLadder, totalCumulativeRechargeDia };
}