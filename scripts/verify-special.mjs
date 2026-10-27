// scripts/verify-special.mjs
//
// Read-only verification harness for the "special" event type — first and
// foremost the 11.11 Kagura Legend event (data/events.json, id `11.11_2026`).
// Run with:
//
//   npm run verify:special   (add `--quick` for a small smoke run)
//
// Why this exists: the special mechanics (mega draw, first-time 10x, promo
// draws, recharge rebate, consecutive-recharge streak, early phase-token claim,
// pass purchase spreading) are opt-in and live inside the shared themed-crest
// simulator. `next lint` / `next build` cannot see whether a 11.11 plan
// actually claims its streak tokens, whether its phases land on d8/d15, or
// whether its passes are spread to satisfy the streak floor — only the numbers
// can. This script asserts those invariants for EVERY input.
//
// Two families of checks:
//
//   A. UNIVERSAL (`checkPlan`) — every plan, every target, every event the
//      special branch routes through:
//        · Σ rows.draws === drawsNeeded.draws === totals.draws
//          A plan must NEVER draw past its own target. This is the check whose
//          absence let an 800-crest skin ship a 56-draw card over a 99-draw
//          schedule (and Street Fighter 120 over 127).
//        · rows are contiguous from startDay and never run past the event
//        · prevLeft + diaAdd − diaSpent === diaLeft on every row
//        · the recharge table's BDT equals the BDT of the "Buy …" notes in the
//          schedule — a pack dated after the plan's last active day has no row
//          to land on and shows up here as a gap
//        · no negative balance / no unfunded warning on a canonical start
//
//   B. SPECIAL MECHANICS (`checkKaguraMechanics`) — 11.11 only: promo day, mega
//      draw, first-time 10x, rebate cap, streak tiers, early phase-token claims
//      (now `claimed <= tokens`, because a claim that would overshoot the target
//      is deliberately trimmed), pass cap.
//
// Every expectation that depends on the calendar is derived from the event's
// own data (its premium-supply phases, its duration) — never hardcoded to this
// edition's literal day numbers.
//
// Implemented as an ESM script + loader hook (scripts/next-alias-hook.mjs) so it
// runs on plain `node` against the raw sources and raw data/*.json — no build,
// no dev server, no network. Nothing is written.

import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

register(pathToFileURL(path.join(scriptDir, "next-alias-hook.mjs")).href, import.meta.url);

const events = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "events.json"), "utf8")).events;
const packsData = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "packs.json"), "utf8"));
const { buildPlan } = await import(pathToFileURL(path.join(repoRoot, "lib", "planOrchestrator.js")).href);

const QUICK = process.argv.includes("--quick");
const PASS_BDT = packsData.weekly_pass?.bdt ?? 0;
const SPECIAL_EVENTS = events.filter((e) => e.type === "special");
if (SPECIAL_EVENTS.length === 0) {
  throw new Error("verify-special: data/events.json contains no event with \"type\": \"special\"");
}
const E = SPECIAL_EVENTS[0];
const SKIN_ITEMS = (E.shop_items ?? []).filter((s) => s.is_skin);
const TARGET_ITEM = SKIN_ITEMS[0] ?? (E.shop_items ?? [])[0];
const TARGET = { itemId: TARGET_ITEM.id, mode: "specific", outfit1: false };
const OWNED = { groups: {}, skins: [] };

// Calendar anchors derived from the event's own premium-supply phases.
const phases = Array.isArray(E.premium_supply) ? E.premium_supply : [];
const phaseEnd = (p) => p.start_day + (p.duration_days ?? 1) - 1;
const lastPhaseEnd = phases.reduce((m, p) => Math.max(m, phaseEnd(p)), 0);
const firstPhaseStart = phases.reduce((m, p) => Math.min(m, p.start_day), Infinity);
const firstAccDay = Math.min(lastPhaseEnd + 1, E.duration_days);

const streak = E.special_mechanics?.streak_recharge ?? null;
const rebate = E.special_mechanics?.recharge_rebate ?? null;
const promo = E.special_mechanics?.promo_draw ?? null;
const megaDraw = E.special_mechanics?.mega_draw ?? null;
const firstTime10x = Boolean(E.special_mechanics?.first_time_10x);
const claimEarly = E.special_mechanics?.claim_tokens_early === true;

// The hand-built 11.11 reference schedule reaches Kagura (1,600 crests) in 119
// realistic draws. This is a DATA pin (a changed prize table or crest rate
// re-prices the event), separate from the schedule-consistency invariants.
const KAGURA_TARGET_DRAWS = 119;

const GRID_DIA = QUICK ? [0, 2025] : [0, 500, 1000, 1500, 2000, 2025, 2500, 3000, 4000];
const GRID_FP = QUICK ? [{}] : [{}, { fp_50: true, fp_150: true, fp_250: true, fp_500: true }];
const GRID_START = QUICK ? [1, firstPhaseStart, firstAccDay, E.duration_days]
  : [...new Set([
      1,
      firstPhaseStart + 1,
      firstPhaseStart + 2,
      phaseEnd(phases[0] ?? { start_day: 1, duration_days: 1 }),
      firstPhaseStart === Infinity ? 1 : firstPhaseStart,
      firstAccDay + 2,
      E.duration_days - 2,
      E.duration_days,
    ].filter((x) => x >= 1 && x <= E.duration_days))].sort((x, y) => x - y);

// Low-target grid: every 800-crest shop skin, including late starts where the
// phase windows and the promo day are gone.
const LOW_DIA = QUICK ? [0, 2000] : [0, 2000, 6000];
const LOW_START = QUICK ? [1, E.duration_days]
  : [...new Set([1, promo?.day ?? 9, firstAccDay, E.duration_days].filter((x) => x >= 1 && x <= E.duration_days))].sort((a, b) => a - b);

const failures = [];
let plans = 0;

function fail(key, msg) {
  failures.push(`${key} :: ${msg}`);
}

function fpKey(fp) {
  return Object.keys(fp ?? {}).length === 0 ? "none" : "all";
}

function buildPlanFor(key, event, targetItem, dia, fp, startDay) {
  try {
    plans += 1;
    return buildPlan(event, { diamonds: dia, weeklyPasses: 0, fpClaimed: fp }, targetItem, OWNED, "realistic", startDay);
  } catch (err) {
    fail(key, `buildPlan threw: ${err.message}`);
    return null;
  }
}

function sumTokens(rows, needle) {
  let total = 0;
  for (const row of rows) {
    for (const n of row.notes) {
      if (n.includes(needle)) {
        const m = n.match(/Claim (\d+) token/);
        if (m) total += Number(m[1]);
      }
    }
  }
  return total;
}

/**
 * BDT the schedule's own purchase notes account for, plus the number of weekly
 * passes they buy. Every note is written next to the row it funds, so comparing
 * this against the recharge table proves no purchase is billed without a day.
 */
function notedPurchases(rows) {
  let bdt = 0;
  let passes = 0;
  for (const row of rows) {
    for (const n of row.notes ?? []) {
      const m = /\((\d+) BDT\)/.exec(n);
      if (m) bdt += Number(m[1]);
      const p = /^Buy (\d+)\u00d7 weekly pass/.exec(n);
      if (p) passes += Number(p[1]);
    }
  }
  return { bdt: bdt + passes * PASS_BDT, passes };
}

// ---------------------------------------------------------------------------
// A. Universal invariants — every plan, whatever its target or event.
// ---------------------------------------------------------------------------
function checkPlan(key, plan, { startDay, event, strictFunding = true }) {
  const rows = plan.daySchedule?.rows ?? [];
  const totals = plan.daySchedule?.totals ?? { draws: 0, dia: 0 };
  const need = plan.drawsNeeded?.draws;

  if (rows.length === 0) {
    fail(key, "empty schedule");
    return;
  }

  // 1. THE invariant this harness was missing: the schedule stops at the crest
  //    target. A card reading "56 draws" over a 99-draw table (or Street
  //    Fighter's 120 vs 127) is a planner bug, not a UI one.
  const rowDraws = rows.reduce((s, r) => s + (r.draws ?? 0), 0);
  if (rowDraws !== need) fail(key, `\u03a3 rows.draws ${rowDraws} != drawsNeeded.draws ${need}`);
  if (totals.draws !== need) fail(key, `totals.draws ${totals.draws} != drawsNeeded.draws ${need}`);
  const rowDia = rows.reduce((s, r) => s + (r.diaSpent ?? 0), 0);
  if (totals.dia !== rowDia) fail(key, `totals.dia ${totals.dia} != \u03a3 rows.diaSpent ${rowDia}`);

  // 2. Calendar: contiguous rows from startDay, never past the event.
  if (rows[0].day !== startDay) fail(key, `first row is day ${rows[0].day}, expected ${startDay}`);
  rows.forEach((row, i) => {
    if (row.day !== startDay + i) fail(key, `row ${i} is day ${row.day}, expected ${startDay + i}`);
  });
  const lastDay = rows[rows.length - 1].day;
  if (lastDay > event.duration_days) fail(key, `schedule runs past the event (day ${lastDay} > ${event.duration_days})`);

  // 3. Balance identity — prevLeft + diaAdd − diaSpent === diaLeft. This is the
  //    invariant that caught the aspirants "211 dia of phantom consumption".
  rows.forEach((row, i) => {
    const prev = i === 0 ? 0 : rows[i - 1].diaLeft ?? 0;
    const expected = prev + (row.diaAdd ?? 0) - (row.diaSpent ?? 0);
    if ((row.diaLeft ?? 0) !== expected) {
      fail(key, `day ${row.day} balance ${prev} + ${row.diaAdd} - ${row.diaSpent} = ${expected}, row says ${row.diaLeft}`);
    }
  });

  // 4. Price honesty: the recharge table bills exactly what the schedule's
  //    purchase notes buy. A pack dated after the plan's last active day has no
  //    row to land on, so it surfaces here as a BDT gap (56-draw 11.11 plans
  //    used to be billed 1,275 BDT of day-15 phase-2 packs they never reached).
  const billedBdt = plan.recharge?.totalBdt ?? 0;
  const noted = notedPurchases(rows);
  if (noted.bdt !== billedBdt) fail(key, `recharge table ${billedBdt} BDT != schedule purchase notes ${noted.bdt} BDT`);
  const billedPasses = (plan.recharge?.packsUsed ?? []).find((p) => p.id === "weekly_pass")?.count ?? 0;
  if (noted.passes !== billedPasses) fail(key, `passes billed ${billedPasses} != passes in schedule ${noted.passes}`);

  // 5. Funding.
  if (strictFunding) {
    if (plan.warnings.some((w) => w.type === "recharge_needed")) fail(key, "recharge_needed warning (unfunded)");
    for (const row of rows) {
      if ((row.diaLeft ?? 0) < 0) fail(key, `day ${row.day} diaLeft ${row.diaLeft} < 0`);
    }
  }
}

// ---------------------------------------------------------------------------
// B. 11.11 special mechanics.
// ---------------------------------------------------------------------------
function checkKaguraMechanics(key, plan, startDay) {
  const rows = plan.daySchedule?.rows ?? [];
  const simDiag = plan.special ?? {};

  // Promo draws land on the promo day, capped at max_draws, and only when the
  // plan is still running on that day.
  if (promo && startDay <= (promo.day ?? 999) && rows.some((r) => r.day >= promo.day)) {
    const promoRow = rows.find((r) => r.day === promo.day);
    if (!promoRow) {
      fail(key, `no row for promo day ${promo.day}`);
    } else {
      const promoNotes = promoRow.notes.filter((n) => n.includes("Promo draws:"));
      if (promoNotes.length === 0) fail(key, `promo day ${promo.day} has no "Promo draws" note`);
      const m = /Promo draws: (\d+)x/.exec(promoNotes[0] ?? "");
      if (m && Number(m[1]) > (promo.max_draws ?? 0)) {
        fail(key, `promo day ${promo.day} draws ${m[1]}, cap ${promo.max_draws}`);
      }
    }
  }

  // Mega draw tokens (day-1 purchase).
  if (megaDraw && startDay <= (megaDraw.day ?? 1)) {
    const megaRow = rows.find((r) => r.day === (megaDraw.day ?? 1));
    const wantsMega = megaRow && megaRow.notes.some((n) => n.includes("mega draw"));
    if (!wantsMega) fail(key, `mega draw day ${megaDraw.day} has no mega-draw purchase`);
  }

  // First-time 10x fires exactly once.
  if (firstTime10x) {
    const tenxNotes = rows.flatMap((r) => r.notes.filter((n) => n.includes("1st-time 10x")));
    if (tenxNotes.length > 1) fail(key, `first-time 10x noted ${tenxNotes.length} times`);
    if (simDiag.firstTenxUsed && tenxNotes.length === 0) fail(key, "sim firstTenxUsed=true but no 1st-time 10x note");
  }

  // Recharge rebate: one token per qualifying recharge day, capped.
  if (rebate) {
    const rebateTotal = sumTokens(rows, "daily recharge rebate");
    const maxHits = rebate.max_hits ?? 3;
    if (rebateTotal > maxHits) fail(key, `rebate claimed ${rebateTotal} tokens, cap ${maxHits}`);
  }

  // Consecutive-recharge streak tiers, gated on the window being planable.
  if (streak && startDay <= (streak.consecutive_days ?? 8)) {
    const streakTotal = sumTokens(rows, "consecutive recharge");
    const tierClaimed = simDiag.streakTiers ?? [];
    const expectedTiers = (streak.tiers ?? [])
      .filter((t) => tierClaimed.includes(t.days))
      .reduce((s, t) => s + (t.tokens ?? 0), 0);
    if (tierClaimed.length > 0 && streakTotal !== expectedTiers) {
      fail(key, `streak claimed ${streakTotal} tokens, expected ${expectedTiers} (tiers: ${JSON.stringify(tierClaimed)})`);
    }
  }

  // Early phase-token claims. Claims are attributed to a phase by the DAY they
  // land on (the closing-day claim prints a bare "All tasks completed", so the
  // note's own label cannot be trusted for attribution). A claim may be TRIMMED
  // when it would overshoot the crest target — claiming 18 tokens for a plan
  // needing 6 more draws — so the floor is `<= tokens`, but a trimmed claim must
  // say so, or the player sees tokens vanish with no explanation.
  if (claimEarly) {
    const lastDay = rows[rows.length - 1].day;
    const phaseOfDay = (day) => phases.find((p) => day >= p.start_day && day <= p.start_day + (p.duration_days ?? 1) - 1);
    const claimedByPhase = new Map();
    let claimedTotal = 0;
    for (const row of rows) {
      for (const n of row.notes) {
        if (!/all tasks completed/i.test(n)) continue;
        const m = /Claim (\d+) token/.exec(n);
        if (!m) continue;
        const ph = phaseOfDay(row.day);
        const amount = Number(m[1]);
        claimedTotal += amount;
        if (!ph) {
          fail(key, `phase claim on day ${row.day} lands outside every premium-supply window: "${n}"`);
          continue;
        }
        claimedByPhase.set(ph.phase, (claimedByPhase.get(ph.phase) ?? 0) + amount);
      }
    }
    const totalTokens = phases.reduce((s, p) => s + (p.tasks ?? []).reduce((a, t) => a + (t.tokens ?? 0), 0), 0);
    if (claimedTotal > totalTokens) fail(key, `claimed ${claimedTotal} phase tokens in total, only ${totalTokens} exist`);

    for (const phase of phases) {
      const close = phase.start_day + (phase.duration_days ?? 1) - 1;
      if (startDay > close) continue;      // window closed before the plan starts
      if (lastDay < phase.start_day) continue; // plan completes before it opens
      const tokens = (phase.tasks ?? []).reduce((s, t) => s + (t.tokens ?? 0), 0);
      const claimed = claimedByPhase.get(phase.phase) ?? 0;
      if (claimed > tokens) fail(key, `phase ${phase.phase} claimed ${claimed} tokens, only ${tokens} available`);
      if (claimed < tokens && lastDay >= close) {
        const trimmed = rows.some((r) => r.day >= phase.start_day && r.day <= close
          && r.notes.some((n) => /all tasks completed/i.test(n) && n.includes("needed")));
        if (!trimmed) {
          fail(key, `phase ${phase.phase} claimed ${claimed} of ${tokens} tokens on a plan that ran through its window, without an "only N of M needed" note`);
        }
      }
    }
  }

  // Pass cap.
  const passDays = simDiag.passBuyDays ?? [];
  const maxPasses = E.special_mechanics?.max_passes ?? 10;
  if (passDays.length > maxPasses) fail(key, `bought ${passDays.length} passes, cap ${maxPasses}`);
}

// ---------------------------------------------------------------------------
// Grid 1 — Kagura Legend (1,600 crests) across dia × startDay × FP.
// ---------------------------------------------------------------------------
for (const dia of GRID_DIA) {
  for (const startDay of GRID_START) {
    for (const fp of GRID_FP) {
      const key = `${E.id}|kagura|dia${dia}|start${startDay}|fp${fpKey(fp)}`;
      const plan = buildPlanFor(key, E, TARGET, dia, fp, startDay);
      if (!plan) continue;

      // Data pin: the reference target still needs 119 realistic draws.
      if (plan.drawsNeeded.draws !== KAGURA_TARGET_DRAWS) {
        fail(key, `drawsNeeded ${plan.drawsNeeded.draws}, expected ${KAGURA_TARGET_DRAWS}`);
      }
      checkPlan(key, plan, { startDay, event: E, strictFunding: startDay === 1 });
      checkKaguraMechanics(key, plan, startDay);
    }
  }
}

// ---------------------------------------------------------------------------
// Grid 2 — low-target shop skins (800 crests each). These are the plans that
// used to finish around day 9 and still draw/ship packs through day 31.
// ---------------------------------------------------------------------------
let lowTargetSample = null;
for (const item of SKIN_ITEMS) {
  for (const dia of LOW_DIA) {
    for (const startDay of LOW_START) {
      const key = `${E.id}|${item.id}|dia${dia}|start${startDay}`;
      const plan = buildPlanFor(key, E, { itemId: item.id, mode: "specific", outfit1: false }, dia, {}, startDay);
      if (!plan) continue;
      checkPlan(key, plan, { startDay, event: E, strictFunding: startDay === 1 });
      if (item.id === TARGET_ITEM.id) continue;
      if (dia === 0 && startDay === 1) {
        const shape = {
          draws: plan.drawsNeeded.draws,
          rows: plan.daySchedule.rows.reduce((s, r) => s + r.draws, 0),
          bdt: plan.recharge.totalBdt,
          lastDay: plan.daySchedule.rows[plan.daySchedule.rows.length - 1]?.day,
        };
        if (!lowTargetSample) lowTargetSample = shape;
        if (JSON.stringify(shape) !== JSON.stringify(lowTargetSample)) {
          fail(key, `pricing/shape differs from ${TARGET_ITEM.id}: ${JSON.stringify(shape)} vs ${JSON.stringify(lowTargetSample)}`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`verify-special: ${plans} plans checked (${GRID_DIA.length} dia x ${GRID_START.length} starts x ${GRID_FP.length} fp on Kagura + ${SKIN_ITEMS.length} low-target skins x ${LOW_DIA.length} dia x ${LOW_START.length} starts)`);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} invariant violation(s)`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log("ALL INVARIANTS HOLD");
console.log(`  event: ${E.id} (${E.name}), draws(target realistic) = ${KAGURA_TARGET_DRAWS}`);
console.log(`  premium supply: ${phases.length} phases (${phases.map((p) => `p${p.phase} d${p.start_day}-${phaseEnd(p)}`).join(", ")})`);
console.log(`  streak: ${streak ? streak.consecutive_days + " days" : "none"}, rebate: ${rebate ? rebate.max_hits + " hits" : "none"}`);
console.log(`  promo: ${promo ? `${promo.max_draws} draws on day ${promo.day}` : "none"}, mega: ${megaDraw ? `day ${megaDraw.day}` : "none"}`);
if (lowTargetSample) {
  console.log(`  800-crest skin @ dia0/start1: ${lowTargetSample.rows}/${lowTargetSample.draws} draws, Tk ${lowTargetSample.bdt}, ends day ${lowTargetSample.lastDay}`);
}
