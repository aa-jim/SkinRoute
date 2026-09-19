// scripts/verify-aspirants.mjs
//
// Read-only verification harness for the Aspirants (`aspirants_2026`, bingo)
// recharge planner. Run with:  npm run verify:aspirants   (add `--quick` for a
// small smoke run).
//
// Why this exists: the aspirants end-game funding loop used to exit with a plan
// that was still short by 47-734 diamonds ("Free draws don't cover the target.
// N extra diamonds needed.") because the tail branch's daily-savings heuristic
// could evaluate to 0 while a real residual remained. `next lint` / `next build`
// cannot see that — only the numbers can. This script asserts the invariants
// that must hold for EVERY input, and pins the non-aspirants plans by hash so a
// change to the shared bingo branch can never quietly move JJK / Street Fighter
// / Collector.
//
// Implemented as an ESM script + loader hook (scripts/next-alias-hook.mjs) so it
// runs on plain `node` against the raw sources and raw data/*.json — no build,
// no dev server, no network. Nothing is written.

import { register } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

register(pathToFileURL(path.join(scriptDir, "next-alias-hook.mjs")).href, import.meta.url);

const events = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "events.json"), "utf8")).events;
const { buildPlan } = await import(pathToFileURL(path.join(repoRoot, "lib", "planOrchestrator.js")).href);

const QUICK = process.argv.includes("--quick");
const ASPIRANTS = events.find((e) => e.id === "aspirants_2026");
const ALL_FP = { fp_50: true, fp_150: true, fp_250: true, fp_500: true };
const OWNED = { groups: {}, skins: [] };

const GRID_DIA = QUICK ? [0, 2025] : [0, 500, 1000, 1500, 2000, 2025, 2500, 3000, 4000];
const GRID_START = QUICK ? [4] : [1, 4, 10, 17, 21, 23];
const GRID_FP = QUICK ? [{}] : [{}, ALL_FP];

// Captured on the pre-fix code (aspirants2026 @ 7ba2cdb) with the exact same
// inputs; the aspirants fix must not touch any other event type.
const REGRESSION_BASELINE = {
  "street_fighter_2026|dia0|start1": "0e9312c939f0d56b",
  "street_fighter_2026|dia1000|start1": "53e0920361c9370d",
  "jujutsu_kaisen_2026|dia0|start1": "259d00e29cbd6c6c",
  "jujutsu_kaisen_2026|dia2000|start1": "98b29641030d51eb",
  "exquisite_collection|dia0|start1": "67bc0d2ac3b262d2",
  "exquisite_collection|dia500|start5": "64a8cf5fae0f79a2",
};
const REGRESSION_CASES = [
  ["street_fighter_2026", 0, 1],
  ["street_fighter_2026", 1000, 1],
  ["jujutsu_kaisen_2026", 0, 1],
  ["jujutsu_kaisen_2026", 2000, 1],
  ["exquisite_collection", 0, 1],
  ["exquisite_collection", 500, 5],
];

const failures = [];
function check(cond, label, detail) {
  if (!cond) failures.push(`${label} :: ${detail}`);
}

function notesOf(row) {
  return row.actionLines ?? row.notes ?? [];
}
const isTenxNote = (n) => /10-draw|10x/.test(n);

function planAspirants(dia, startDay, fp) {
  return buildPlan(ASPIRANTS, { diamonds: dia, weeklyPasses: 0, fpClaimed: fp }, null, OWNED, "worst", startDay);
}

function verifyAspirants(plan, dia, startDay, fpLabel) {
  const label = `aspirants dia=${dia} start=${startDay} fp=${fpLabel}`;
  const rows = plan.daySchedule.rows;
  const totals = plan.daySchedule.totals;
  const last = rows[rows.length - 1];
  const passCount = plan.recharge.packsUsed.find((p) => p.id === "weekly_pass")?.count ?? 0;

  // 1. The plan must always reach the bingo bottom line (worst = 60 draws).
  check(totals.draws === 60, label, `draws=${totals.draws} (expected 60)`);

  // 2. THE regression this harness exists for: a plan must never ship a funding
  //    warning. `recharge_needed` means the schedule spends diamonds the
  //    recharge table never tells the user to buy.
  check(plan.warnings.length === 0, label, `warnings=${JSON.stringify(plan.warnings.map((w) => w.message))}`);

  // 3. Whole-plan funding: starting balance + suggested recharge must cover the
  //    total draw spend.
  check(dia + plan.recharge.totalDia >= totals.dia, label,
    `starting ${dia} + recharge ${plan.recharge.totalDia} < spend ${totals.dia}`);

  // 4. No row may show a negative balance, and no row may carry negative values.
  for (const r of rows) {
    check((r.diaLeft ?? 0) >= 0, label, `day ${r.day} diaLeft=${r.diaLeft}`);
    check((r.draws ?? 0) >= 0 && (r.diaSpent ?? 0) >= 0, label, `day ${r.day} draws=${r.draws} spent=${r.diaSpent}`);
  }

  // 5. First-time 10x is reserved for the 40 -> 50 hop: it may never be the
  //    draw that crosses the 40-draw bingo checkpoint.
  let cumBefore = 0;
  let tenxChecked = false;
  for (const r of rows) {
    if (!tenxChecked && notesOf(r).some(isTenxNote)) {
      check(cumBefore + (r.draws - 10) >= 40, label,
        `10x on day ${r.day} at ${cumBefore} draws (+${r.draws - 10} same-row) — before the 40 checkpoint`);
      tenxChecked = true;
    }
    cumBefore += r.draws;
  }

  // 6. Staging anchors must be usable by the UI (gold-circle tier reveal).
  check(plan.checkpointDay > 0 && plan.tenxDay > 0 && plan.tailDay > 0, label,
    `checkpoint/tenx/tail = ${plan.checkpointDay}/${plan.tenxDay}/${plan.tailDay}`);

  // 7. Pass cap (in-game max 10 in the sequential queue).
  check(passCount <= 10, label, `passes=${passCount}`);

  // 8. Per-tier cards: diamond + BDT ladders must be monotonic, and the worst
  //    tier's money must equal the plan's own recharge total.
  const dc = plan.winCondition.diamondCost;
  const bc = plan.winCondition.bdtCost;
  const diaLadder = [dc.lucky[0], dc.lucky[1], dc.realistic, dc.worst];
  const bdtLadder = [bc.lucky[0], bc.lucky[1], bc.realistic, bc.worst];
  for (let i = 1; i < 4; i++) {
    check(diaLadder[i] >= diaLadder[i - 1], label, `dia tiers not monotonic: ${diaLadder.join(" <= ")}`);
    check(bdtLadder[i] >= bdtLadder[i - 1], label, `bdt tiers not monotonic: ${bdtLadder.join(" <= ")}`);
  }
  check(bc.worst === plan.recharge.totalBdt, label, `bdtCost.worst ${bc.worst} != recharge.totalBdt ${plan.recharge.totalBdt}`);
  check((dc.worst ?? 0) <= totals.dia, label, `diaCost.worst ${dc.worst} > spend ${totals.dia}`);

  return {
    dia, startDay, fp: fpLabel,
    bdt: plan.recharge.totalBdt,
    rechargeDia: Math.round(plan.recharge.totalDia),
    spent: totals.dia,
    endLeft: last?.diaLeft ?? 0,
    passes: passCount,
    checkpoint: plan.checkpointDay,
    packs: plan.recharge.packsUsed.map((p) => `${p.id}x${p.count}`).join("+"),
  };
}

// ---------------------------------------------------------------------------
// Aspirants grid
// ---------------------------------------------------------------------------
const results = [];
console.log(`Aspirants grid: ${GRID_DIA.length} dia x ${GRID_START.length} startDay x ${GRID_FP.length} fp = ${GRID_DIA.length * GRID_START.length * GRID_FP.length} plans`);
const startedAt = Date.now();
for (const fp of GRID_FP) {
  for (const startDay of GRID_START) {
    for (const dia of GRID_DIA) {
      const fpLabel = fp === ALL_FP ? "claimed" : "none";
      results.push(verifyAspirants(planAspirants(dia, startDay, fp), dia, startDay, fpLabel));
    }
  }
}
console.log(`  ${results.length} plans in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

function printTable(fpLabel) {
  const rowsFor = results.filter((r) => r.fp === fpLabel);
  console.log(`\nRecommended Recharge BDT (fp=${fpLabel})`);
  console.log("  dia\\start " + GRID_START.map((s) => String(s).padStart(8)).join(""));
  for (const dia of GRID_DIA) {
    const cells = GRID_START.map((s) => {
      const r = rowsFor.find((x) => x.dia === dia && x.startDay === s);
      return String(r ? r.bdt : "-").padStart(8);
    });
    console.log("  " + String(dia).padStart(8) + " " + cells.join(""));
  }
}
for (const fp of GRID_FP) printTable(fp === ALL_FP ? "claimed" : "none");

console.log("\nKey scenarios (60 draws each; left = diamonds left after the last draw)");
for (const r of results.filter((x) => (x.dia === 0 || x.dia === 2025) && (x.startDay === 1 || x.startDay === 4))) {
  console.log(`  dia=${String(r.dia).padEnd(5)} start=${String(r.startDay).padEnd(3)} fp=${r.fp.padEnd(7)} BDT=${String(r.bdt).padEnd(6)} rechargeDia=${String(r.rechargeDia).padEnd(6)} spent=${String(r.spent).padEnd(6)} left=${String(r.endLeft).padEnd(5)} passes=${r.passes} cp=${r.checkpoint}  ${r.packs}`);
}

// ---------------------------------------------------------------------------
// Non-aspirants regression (byte hash of the whole plan object)
// ---------------------------------------------------------------------------
console.log("\nNon-aspirants regression (plan hash must be unchanged)");
for (const [id, dia, startDay] of REGRESSION_CASES) {
  const event = events.find((e) => e.id === id);
  const target = { itemId: event.shop_items?.[0]?.id, mode: "specific", outfit1: false };
  const key = `${id}|dia${dia}|start${startDay}`;
  let hash = "ERR";
  let info = "";
  try {
    const plan = buildPlan(event, { diamonds: dia, weeklyPasses: 0, fpClaimed: {} }, target, OWNED, "realistic", startDay);
    hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
    info = `bdt=${plan.recharge.totalBdt} draws=${plan.daySchedule.totals.draws}`;
  } catch (err) {
    info = `threw: ${err.message}`;
  }
  const expected = REGRESSION_BASELINE[key];
  const ok = hash === expected;
  if (!ok) failures.push(`regression ${key} :: hash ${hash} != baseline ${expected}`);
  console.log(`  ${ok ? "OK  " : "FAIL"} ${key.padEnd(42)} ${hash} (baseline ${expected}) ${info}`);
}

// ---------------------------------------------------------------------------
console.log("");
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} invariant violation(s)`);
  for (const f of failures.slice(0, 40)) console.error("  - " + f);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`PASS: ${results.length} aspirants plans (60 draws, 0 warnings, funded, monotonic tiers) + ${REGRESSION_CASES.length} unchanged non-aspirants plans`);
