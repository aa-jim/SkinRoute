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
// ---------------------------------------------------------------------------

/**
 * SCHEDULING_APPROACHES.md CoA-priority technique, confirmed sequence:
 *   1. Day 1-7: spend diamonds on draws to hit the 500-dia spend threshold
 *      (unlocks all 3 spend-task tiers: 1+2+3 keys), coinciding with Starlight
 *      purchase (+300 CoA, +2 keys) somewhere in this window.
 *   2. After Day 7 closes: STOP spending diamonds. CoA-only draws until CoA=0.
 *   3. Only after CoA runs out: resume diamonds to finish the draw target.
 *
 * This function does not compute exact draw counts per phase (that needs live
 * crest totals as draws happen, which is a running-simulation concern beyond
 * static scheduling) — it returns the PHASE BOUNDARIES and currency-priority
 * rule, which the day-by-day renderer (Part 7) applies while walking draws.
 *
 * @param {object} event - must be type "collector"
 * @param {object} resources - { diamonds, coa }
 * @param {number} starlightDay - from starlightTiming(), or null if not affordable
 * @returns {{
 *   phase1: { startDay:number, endDay:number, currency:string, note:string },
 *   phase2: { startDay:number, currency:string, note:string, endsWhen:string },
 *   phase3: { currency:string, note:string, startsWhen:string },
 *   coaAvailableFromStarlight:number
 * }}
 */
export function coaPrioritySpendPlan(event, resources, starlightDay = null) {
    if (event.type !== "collector") {
        throw new Error(`coaPrioritySpendPlan: event "${event.id}" is not type "collector"`);
    }
    const supply = event.premium_supply;
    if (typeof supply === "string" || !Array.isArray(supply) || supply.length === 0) {
        throw new Error(`coaPrioritySpendPlan: event "${event.id}" premium_supply missing or unconfirmed`);
    }
    const window1 = supply[0]; // Exquisite has exactly one window (Day 1-7)

    return {
        phase1: {
            startDay: window1.start_day,
            endDay: window1.start_day + window1.duration_days - 1,
            currency: "diamonds",
            note: `Spend diamonds on draws to hit 500-dia spend threshold (unlocks 1+2+3 key tasks). ${starlightDay ? `Buy Starlight on day ${starlightDay} within this window if it falls inside it.` : "Starlight not affordable within pass plan — resolve via optimizer."
                }`,
        },
        phase2: {
            startDay: window1.start_day + window1.duration_days, // day AFTER window1 closes
            currency: "coa",
            note: "Diamond spending stops. All subsequent draws (daily 1x, keys, singles, 10x) paid from CoA balance until CoA is fully depleted.",
            endsWhen: "coa_balance === 0",
        },
        phase3: {
            currency: "diamonds",
            note: "Resume diamond spending (recharge packs / remaining balance) to finish the draw target.",
            startsWhen: "coa_balance === 0",
        },
        coaAvailableFromStarlight: starlightDay ? 300 : 0,
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