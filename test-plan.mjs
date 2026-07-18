// test-plan.mjs — Manual test harness for calculator.js + scheduler.js + optimizer.js
//
// NOT part of the app. A scratch tool to sanity-check the calculation/scheduling
// pipeline with your own numbers before Part 7's UI exists.
//
// HOW TO RUN:
//   1. Place this file in your project ROOT (same level as lib/, data/).
//   2. Edit the CONFIG block below with your test scenario.
//   3. Run:  node test-plan.mjs
//
// If you get "Cannot find module" errors, run it from the project root, not from
// inside lib/ — the import paths below assume that.

import { drawsNeeded, crestsPerDrawBreakdown, netDiamondsNeeded } from "./lib/calculator.js";
import {
  freeCrestsProjection,
  weeklyPassPlan,
  premiumSupplyWindowPlan,
  starlightTiming,
  coaPrioritySpendPlan,
  spendTaskStrategy,
  finalPushPlan,
  milestoneTokenSchedule,
} from "./lib/scheduler.js";
import { optimizeRecharge } from "./lib/optimizer.js";
import fs from "fs";

// =============================================================================
// CONFIG — edit this block for each test scenario
// =============================================================================

const EVENT_ID = "exquisite_collection";
const TARGET_CREST_COST = 800;           // full-price Collector-tier skin (e.g. Lesley, Aldous, Aurora, Esmeralda)
const CURRENT_CRESTS = 0;                // crests already banked

const RESOURCES = {
  diamonds: 336,                          // starting diamonds
  coa: 0,                                 // starting CoA
  fpClaimed: {                            // which FP bonuses are ALREADY used (per MLBB account)
    fp_50: true,
    fp_150: false,
    fp_250: true,
    fp_500: true,
  },
};

// Owned: 2/3 Special skins, 3/3 Basic skins (maxed), 1/1 Battle Emote (maxed)
const OWNED_GROUPS = { special_skin: 2, basic_skin: 3, battle_emote: 1 };
const OWNED_SKIN_IDS = [];     // no Collector/Luckybox target skins owned yet

// Weekly pass purchase plan to test — Exquisite is a 31-day event, so up to 4 passes fit
const PASS_PURCHASES = [{ count: 2, buyDay: 1 }];

// =============================================================================
// RUN — no need to edit below this line
// =============================================================================

const events = JSON.parse(fs.readFileSync("./data/events.json", "utf8")).events;
const packs = JSON.parse(fs.readFileSync("./data/packs.json", "utf8"));
const event = events.find((e) => e.id === EVENT_ID);

if (!event) {
  console.error(`Event "${EVENT_ID}" not found in data/events.json`);
  process.exit(1);
}

console.log(`\n${"=".repeat(70)}`);
console.log(`TEST PLAN — ${event.name} (${event.type}), target ${TARGET_CREST_COST} crests`);
console.log(`${"=".repeat(70)}\n`);

// --- Formula 1: E[crests/draw] ---
const breakdown = crestsPerDrawBreakdown(event, OWNED_GROUPS, OWNED_SKIN_IDS);
console.log("--- E[crests/draw] ---");
console.log(`  Optimistic: ${breakdown.optimistic.toFixed(4)}`);
console.log(`  Realistic:  ${breakdown.realistic.toFixed(4)}`);
console.log(`  Worst case: ${breakdown.worst.toFixed(4)}`);

// --- Formula 2: draws needed ---
const dn = drawsNeeded(event, TARGET_CREST_COST, CURRENT_CRESTS, OWNED_GROUPS, OWNED_SKIN_IDS);
console.log("\n--- Draws Needed (Formula 2) ---");
console.log(`  draws: ${dn.draws}`);
console.log(`  gapAfterMilestones: ${dn.gapAfterMilestones.toFixed(1)}`);
console.log(`  milestonesApplied: ${dn.milestonesApplied.map((m) => `${m.draws}→${m.crests}cr`).join(", ") || "(none reachable)"}`);

// --- Step 0: free crests projection ---
const proj = freeCrestsProjection(event, TARGET_CREST_COST, CURRENT_CRESTS, OWNED_GROUPS, OWNED_SKIN_IDS);
console.log("\n--- Free Crests Projection (Step 0) ---");
console.log(`  dailyDrawCrests: ${proj.dailyDrawCrests.toFixed(1)}`);
console.log(`  freeTokenCrests: ${proj.freeTokenCrests.toFixed(1)}`);
console.log(`  totalFreeCrests: ${proj.totalFreeCrests.toFixed(1)}`);
console.log(`  needsRecharge: ${proj.needsRecharge}`);
console.log(`  gapAfterFree: ${proj.gapAfterFree.toFixed(1)} crests`);

// --- Milestone schedule ---
const milestoneSched = milestoneTokenSchedule(event, dn);
console.log("\n--- Milestone Schedule (Step 8) ---");
milestoneSched.forEach((m) => {
  console.log(`  draw ${m.draws}: ${m.reward_type} ${m.reachable ? "✅ reachable" : "❌ NOT reachable"}${m.nonCalculable ? " (non-calculable, ignored)" : ""}`);
});

// --- Weekly pass plan ---
const wp = weeklyPassPlan(packs, event.duration_days, PASS_PURCHASES);
console.log("\n--- Weekly Pass Plan (Step 1) ---");
console.log(`  totalPassesQueued: ${wp.totalPassesQueued} (exceedsMaxStack: ${wp.exceedsMaxStack})`);
console.log(`  totalDiamondsFromPasses: ${wp.totalDiamondsFromPasses}`);

// --- Premium supply window shape ---
try {
  const supplyPlan = premiumSupplyWindowPlan(event);
  console.log("\n--- Premium Supply Windows (Step 2) ---");
  supplyPlan.forEach((phase) => {
    console.log(`  Phase ${phase.phase}: Day ${phase.startDay}-${phase.endDay}`);
    phase.tasks.forEach((t) => console.log(`    ${t.type}: ${t.timing}${t.tokens ? ` (${t.tokens} tokens)` : ""}`));
  });
} catch (e) {
  console.log(`\n--- Premium Supply Windows: ${e.message} ---`);
}

// --- Event-specific branch ---
if (event.type === "collector") {
  const slTiming = starlightTiming(event, RESOURCES, wp.dailyDiamondSchedule);
  console.log("\n--- Starlight Timing (Step 3, Collector only) ---");
  console.log(`  affordable: ${slTiming.affordable}, day: ${slTiming.day}, balance: ${slTiming.balanceOnDay}`);

  const coaPlan = coaPrioritySpendPlan(event, RESOURCES, slTiming.day);
  console.log("\n--- CoA Priority Spend Plan (Step 6, Collector only) ---");
  console.log(`  Phase1 (diamonds): Day ${coaPlan.phase1.startDay}-${coaPlan.phase1.endDay}`);
  console.log(`  Phase2 (CoA-only): starts Day ${coaPlan.phase2.startDay}`);
  console.log(`  Phase3 (diamonds resume): ${coaPlan.phase3.startsWhen}`);
} else {
  console.log("\n--- Spend Task Strategy (Step 4, Themed Crest/Legend/Special) ---");
  const supply = event.premium_supply;
  if (Array.isArray(supply)) {
    supply.forEach((phase) => {
      const spendTasks = phase.tasks.filter((t) => t.type.startsWith("spend_"));
      spendTasks.forEach((t) => {
        const strat = spendTaskStrategy(event, t.threshold_dia, phase.duration_days);
        console.log(`  Phase ${phase.phase} ${t.type}: cheaper=${strat.cheaper} (${strat[strat.cheaper].diamonds} dia, saves ${strat.savings} dia vs the other path)`);
      });
    });
  }
}

// --- Final push (using current projection as a stand-in for "actual crests at final day") ---
const finalPush = finalPushPlan(event, proj.totalFreeCrests, TARGET_CREST_COST, dn.effectiveE);
console.log("\n--- Final Push Plan (Step 5) ---");
console.log(`  gap: ${finalPush.gap.toFixed(1)} crests`);
console.log(`  10x batches: ${finalPush.tenxBatches}, singles: ${finalPush.singles}`);
console.log(`  totalDiamonds: ${finalPush.totalDiamonds}`);

// --- Recharge optimizer ---
const rechargeGap = netDiamondsNeeded(event, TARGET_CREST_COST, CURRENT_CRESTS, OWNED_GROUPS, OWNED_SKIN_IDS, 0, "realistic");
console.log("\n--- Net Diamonds Needed (Formula 3) ---");
console.log(`  gapAfterFree: ${rechargeGap.gapAfterFree.toFixed(1)} crests`);
console.log(`  netDiamondsNeeded: ${rechargeGap.netDiamondsNeeded} dia`);

if (rechargeGap.netDiamondsNeeded > 0) {
  const optResult = optimizeRecharge(rechargeGap.netDiamondsNeeded, packs, event.duration_days, RESOURCES);
  console.log("\n--- Recharge Optimizer (Part 5D) ---");
  if (optResult.impossible) {
    console.log(`  IMPOSSIBLE: cannot reach ${rechargeGap.netDiamondsNeeded} dia within ${event.duration_days} days with available packs`);
  } else {
    console.log(`  totalBdt: ${optResult.totalBdt}`);
    console.log(`  totalDia: ${optResult.totalDia}`);
    console.log(`  completionDay: ${optResult.completionDay} / ${event.duration_days}`);
    console.log(`  packsUsed:`);
    optResult.packsUsed.forEach((p) => console.log(`    ${p.id} × ${p.count} (${p.bdt * p.count} BDT, ${p.dia * p.count} dia)`));
  }
} else {
  console.log("\n--- Recharge Optimizer: not needed, free resources cover the target ---");
}

console.log(`\n${"=".repeat(70)}\n`);
