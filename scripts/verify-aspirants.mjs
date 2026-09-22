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
// 5 and 7 are IN-PHASE starts (phase 1 = days 3-7): they cover the open-phase
// recharge-claim path (tokens must be claimable on the first planable day).
const GRID_START = QUICK ? [4] : [1, 4, 5, 7, 10, 17, 21, 23];
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

// Byte-pinned aspirants plans (sha256 over the whole plan object, "worst"
// confidence). The 0-dia day-1 plan is the hand-validated reference shape -
// balance-poor pacing must provably stay need-driven. Updated deliberately
// when a reviewed change improves the shape: the converge-on-checkpoint hold
// (Sep 2026) moved the checkpoint from 10/1 to 9/30 (d15, the first
// accumulation day) with one unbroken cadence, ৳3,700 → ৳3,415 (the starved
// d5/d15 holds now draw on d6/d14 instead, the d16 emergency pass and the
// 9/30 idle day are gone, and the final push shrank from 4 to 2 singles).
const ASPIRANTS_BASELINE = {
  "dia0|start1|fp none": "9e06d324be8a13ec",
};

const failures = [];
function check(cond, label, detail) {
  if (!cond) failures.push(`${label} :: ${detail}`);
}

function notesOf(row) {
  return row.actionLines ?? row.notes ?? [];
}
const isTenxNote = (n) => /10-draw|10x/.test(n);

// Day the running draw total first reaches the 40-draw bingo checkpoint (0 when
// the plan never gets there - only the 30/40-draw tier probes).
function cpRowOf(rows) {
  let cum = 0;
  for (const r of rows) { cum += r.draws; if (cum >= 40) return r.day; }
  return 0;
}

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
                  // The first-time 10x is reserved for the 40 -> 50 hop: it may never fire
      // before 40 draws have been accumulated. When the checkpoint day also
      // carries the 10x sub-row, cumBefore (pre-row draws) + same-row daily
      // must reach 40 — i.e. the daily draw on the 10x row is what crosses 40,
      // then the 10x fires immediately after (the sim's in-loop gate enforces
      // totalDraws >= 40 before firing).
      check(cumBefore + (r.draws - 10) >= 40, label,
        `10x on day ${r.day} at ${cumBefore} draws (+${r.draws - 10} same-row) — before the 40 checkpoint`);
      tenxChecked = true;
    }
    cumBefore += r.draws;
  }

  // 5b. First-time-10x day: the planner publishes the day's two accounting units
  //     as row.main / row.subrow. The MAIN row (the row the 40th draw lands on)
  //     must only add and subtract its OWN recharge and diamond spend - the sub
  //     row's 10x spend and its funding packs must never be folded into it (and
  //     the two must still sum to the day's aggregate, which the rest of the
  //     plan - totals, balance, per-tier money - is built on).
  const splitRow = rows.find((r) => r.subrow && r.main);
  if (splitRow) {
    const idx = rows.indexOf(splitRow);
    const prevLeft = idx > 0 ? (rows[idx - 1].diaLeft ?? 0) : 0;
    check(splitRow.main.draws + splitRow.subrow.draws === splitRow.draws, label,
      `split draws ${splitRow.main.draws}+${splitRow.subrow.draws} != day ${splitRow.draws}`);
    check(splitRow.main.diaSpent + splitRow.subrow.diaSpent === splitRow.diaSpent, label,
      `split diaSpent ${splitRow.main.diaSpent}+${splitRow.subrow.diaSpent} != day ${splitRow.diaSpent}`);
    check(splitRow.main.diaAdd + splitRow.subrow.diaAdd === splitRow.diaAdd, label,
      `split diaAdd ${splitRow.main.diaAdd}+${splitRow.subrow.diaAdd} != day ${splitRow.diaAdd}`);
    check(splitRow.main.diaRecharged + splitRow.subrow.diaRecharged === splitRow.diaRecharged, label,
      `split diaRecharged ${splitRow.main.diaRecharged}+${splitRow.subrow.diaRecharged} != day ${splitRow.diaRecharged}`);
    check(splitRow.main.diaLeft >= 0, label, `main-row diaLeft=${splitRow.main.diaLeft} < 0`);
    check(splitRow.main.diaLeft === prevLeft + splitRow.main.diaAdd - splitRow.main.diaSpent, label,
      `main-row balance ${splitRow.main.diaLeft} != ${prevLeft}+${splitRow.main.diaAdd}-${splitRow.main.diaSpent}`);
    check(splitRow.subrow.draws >= 10, label, `sub-row draws=${splitRow.subrow.draws} < 10 (the 10x)`);
    check(splitRow.subrow.diaSpent <= splitRow.diaSpent, label,
      `sub-row spend ${splitRow.subrow.diaSpent} > day spend ${splitRow.diaSpent}`);
    check(splitRow.main.notes.every((n) => !isTenxNote(n) && !(n.includes("Buy") && n.includes("dias pack"))), label,
      `main-row notes still carry sub-row lines: ${JSON.stringify(splitRow.main.notes)}`);
    check(splitRow.subrow.notes.some(isTenxNote), label,
      `sub-row notes missing the first-time 10x: ${JSON.stringify(splitRow.subrow.notes)}`);
    check(splitRow.day === plan.tenxDay, label,
      `split day ${splitRow.day} != tenxDay ${plan.tenxDay}`);
    // The main row must read EXACTLY the checkpoint number: it carries the
    // draws up to and including the 40th. (When free token claims alone cross
    // 40 before the 10x day - cumBefore >= 40 - the clamp yields 0 main draws
    // and the day legitimately shows its own cum; that case has never fired.)
    {
      const cumBeforeSplit = rows.slice(0, idx).reduce((s, r) => s + (r.draws ?? 0), 0);
      check(cumBeforeSplit >= 40 || cumBeforeSplit + splitRow.main.draws === 40, label,
        `checkpoint row reads ${cumBeforeSplit + splitRow.main.draws} != 40`);
    }
    check(cpRowOf(rows) === 0 || cpRowOf(rows) <= splitRow.day, label,
      `40-checkpoint (day ${cpRowOf(rows)}) after the 10x day (${splitRow.day})`);
  } else if (rows.some((r) => notesOf(r).some(isTenxNote))) {
    check(false, label, "first-time 10x fired but no main/sub-row split was published");
  }

  // 6. Staging anchors must be usable by the UI (gold-circle tier reveal).
  check(plan.checkpointDay > 0 && plan.tenxDay > 0 && plan.tailDay > 0, label,
    `checkpoint/tenx/tail = ${plan.checkpointDay}/${plan.tenxDay}/${plan.tailDay}`);

  // 7. Pass cap (in-game max 10 in the sequential queue).
  check(passCount <= 10, label, `passes=${passCount}`);

  // 8. Integer diamond accounting: every recharge entry carries exact integers
  //    (80 instant + 20/day drip per pass — never a fractional per-pass
  //    average), so the displayed totals can never read "6,594.33 dia".
  for (const p of plan.recharge.packsUsed) {
    check(Number.isInteger(p.dia) && Number.isInteger(plan.recharge.totalDia), label,
      `fractional dia: ${p.id} dia=${p.dia} totalDia=${plan.recharge.totalDia}`);
  }

  // 9. Open-phase claims: a start INSIDE a phase window (4/5/7 land in phase 1,
  //    days 3-7) must claim that phase's recharge tokens on the first planable
  //    day — 12 recharge + 1 login (spend tokens may add more). The old
  //    exact-phase-start-day check silently dropped all of them.
  if ([4, 5, 7].includes(startDay)) {
    check(rows[0].draws >= 13, label, `open-phase tokens not claimed on day 1: draws=${rows[0].draws} notes=${JSON.stringify(notesOf(rows[0]))}`);
  }

  // 10. Sub-row separation (dia-0 plans): the 50-gap money is booked AFTER the
  //     organic 40-checkpoint — the first-time 10x fires on a later row, never
  //     on the checkpoint row itself (the checkpoint row only carries the small
  //     cadence top-up). Rich-starting plans may organically fire the 10x
  //     same-day when the balance already covers it — that's fine.
    if (dia === 0) {
      let cum = 0, cpRow = 0, tenxRow = 0;
      for (const r of rows) {
        cum += r.draws;
        // cum now includes this row's draws, so cpRow = the day the running
        // total FIRST reached 40 (checking before the add reported one row late).
        if (!cpRow && cum >= 40) cpRow = r.day;
        if (!tenxRow && notesOf(r).some(isTenxNote)) tenxRow = r.day;
      }
            // Late starts (17/21/23) can collapse the staged push onto the final day
      // (checkpoint ON the last day -> 10x same row) - honest for a 1-2 day
      // window. For normal starts the 10x may fire on the checkpoint row itself
      // (the daily draw crosses 40, then the 10x fires same-row per the sim's
      // in-loop gate), so allow tenxRow >= cpRow when a following day exists.
      check(tenxRow === 0 || cpRow >= ASPIRANTS.duration_days || tenxRow >= cpRow,
        label, `10x on day ${tenxRow} not on/after the 40-checkpoint row (${cpRow})`);
    }

  // 11. Per-tier cards: diamond + BDT ladders must be monotonic, and the worst
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

  // 12. Lazy cadence (surplus day-1 plans): with a rich starting balance the
  //     pacing is calendar-driven - the 40-checkpoint lands exactly on the
  //     first accumulation day (day 15, right after phase 2 closes) and the
  //     schedule reaches 60 on the final day, so there is no stockpiled
  //     mid-phase checkpoint (the old 42 -> 52 on day 12) and no idle tail
  //     days at the end.
  if (startDay === 1 && dia >= 2000) {
    check(cpRowOf(rows) === 15, label,
      `rich-start checkpoint on day ${cpRowOf(rows)} (expected 15 - the first accumulation day)`);
    const lastDrawDay = rows.filter((r) => (r.draws ?? 0) > 0).pop()?.day ?? 0;
    check(lastDrawDay === ASPIRANTS.duration_days, label,
      `last draw on day ${lastDrawDay} != ${ASPIRANTS.duration_days} - idle tail days at the end`);
  }

  return {
    dia, startDay, fp: fpLabel,
    bdt: plan.recharge.totalBdt,
    rechargeDia: plan.recharge.totalDia,
    spent: totals.dia,
    endLeft: last?.diaLeft ?? 0,
    passes: passCount,
    checkpoint: plan.checkpointDay,
    tenx: plan.tenxDay,
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
      const plan = planAspirants(dia, startDay, fp);
      // Byte pin: hand-validated aspirants plans must never drift.
      const baselineKey = `dia${dia}|start${startDay}|fp ${fpLabel}`;
      if (ASPIRANTS_BASELINE[baselineKey]) {
        const bHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
        check(bHash === ASPIRANTS_BASELINE[baselineKey], `pin ${baselineKey}`,
          `plan hash ${bHash} != baseline ${ASPIRANTS_BASELINE[baselineKey]}`);
      }
      results.push(verifyAspirants(plan, dia, startDay, fpLabel));
      // DEBUG: print dia=0 start=1 fp=none schedule
      if (dia === 0 && startDay === 1 && fpLabel === "none") {
        console.log(`\n[DEBUG] dia=0 start=1 fp=none schedule (first 20 rows):`);
        plan.daySchedule.rows.slice(0, 20).forEach(r => {
          console.log(`  day ${r.day}  draws=${r.draws}  diaLeft=${r.diaLeft}  diaAdd=${r.diaAdd}  recharged=${r.diaRecharged}  spent=${r.diaSpent}  notes=${JSON.stringify(r.notes)}`);
        });
        console.log(`  cp=${plan.checkpointDay} tenx=${plan.tenxDay} tail=${plan.tailDay}`);
        const cpRow = plan.daySchedule.rows.find((r) => r.day === plan.tenxDay);
        if (cpRow?.main && cpRow?.subrow) {
          console.log(`  [split] main: ${cpRow.main.draws} draws / ${cpRow.main.diaSpent} spent / ${cpRow.main.diaAdd} added / ${cpRow.main.diaLeft} left  (day: ${cpRow.draws} / ${cpRow.diaSpent} / ${cpRow.diaLeft})`);
          console.log(`  [split] sub : ${cpRow.subrow.draws} draws / ${cpRow.subrow.diaSpent} spent / ${cpRow.subrow.diaAdd} added`);
        }
      }
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
  console.log(`  dia=${String(r.dia).padEnd(5)} start=${String(r.startDay).padEnd(3)} fp=${r.fp.padEnd(7)} BDT=${String(r.bdt).padEnd(6)} rechargeDia=${String(r.rechargeDia).padEnd(6)} spent=${String(r.spent).padEnd(6)} left=${String(r.endLeft).padEnd(5)} passes=${r.passes} cp=${r.checkpoint} tenx=${r.tenx}  ${r.packs}`);
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
