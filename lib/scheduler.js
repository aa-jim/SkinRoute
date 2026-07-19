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