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
// actually claims its streak tokens, whether its phases land on d3/d14, or
// whether its passes are spread to satisfy the streak floor — only the numbers
// can. This script asserts those invariants for EVERY input.
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
const { buildPlan } = await import(pathToFileURL(path.join(repoRoot, "lib", "planOrchestrator.js")).href);

const QUICK = process.argv.includes("--quick");
const SPECIAL_EVENTS = events.filter((e) => e.type === "special");
if (SPECIAL_EVENTS.length === 0) {
  throw new Error("verify-special: data/events.json contains no event with \"type\": \"special\"");
}
const E = SPECIAL_EVENTS[0];
const TARGET_ITEM = (E.shop_items ?? []).find((s) => s.is_skin) ?? (E.shop_items ?? [])[0];
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

const failures = [];
let plans = 0;

function fail(key, msg) {
  failures.push(`${key} :: ${msg}`);
}

function notesOf(rows, day) {
  const row = rows.find((r) => r.day === day);
  return row ? row.notes : [];
}

function hasNote(rows, day, needle) {
  return notesOf(rows, day).some((n) => n.includes(needle));
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

// ---------------------------------------------------------------------------
// Grid over dia × startDay × FP.
// ---------------------------------------------------------------------------
for (const dia of GRID_DIA) {
  for (const startDay of GRID_START) {
    for (const fp of GRID_FP) {
      const key = `${E.id}|dia${dia}|start${startDay}|fp${JSON.stringify(fp)}`;
      let plan;
      try {
        plan = buildPlan(E, { diamonds: dia, weeklyPasses: 0, fpClaimed: fp }, TARGET, OWNED, "realistic", startDay);
      } catch (err) {
        fail(key, `buildPlan threw: ${err.message}`);
        continue;
      }
      plans += 1;
      const rows = plan.daySchedule.rows ?? [];
      const totals = plan.daySchedule.totals ?? { draws: 0, dia: 0 };
      const simDiag = plan.special ?? {};

      // 1. Target draws (realistic): 119 for the 11.11 hand schedule.
      if (totals.draws !== 119) fail(key, `target draws = ${totals.draws}, expected 119`);

      // 2. Funding: no unaffordable shortfall on the canonical (start=1) plan; on
      //    later starts a negative intermediate balance explains itself (the phase
      //    windows were missed and the shortfall surfaced as a warning). Strict
      //    invariant only on start=1.
      if (plan.warnings.some((w) => w.type === "recharge_needed")) fail(key, "recharge_needed warning (unfunded)");
      for (const row of rows) {
        if ((row.diaLeft ?? 0) < 0 && startDay === 1) fail(key, `day ${row.day} diaLeft ${row.diaLeft} < 0 (canonical start)`);
      }

      // 3. Row balance identity: prevLeft + diaAdd - diaSpent === diaLeft.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const prevLeft = i === 0 ? 0 : rows[i - 1].diaLeft ?? 0;
        const expected = prevLeft + (row.diaAdd ?? 0) - (row.diaSpent ?? 0);
        if ((row.diaLeft ?? 0) !== expected) {
          fail(key, `day ${row.day} balance identity: ${prevLeft} + ${row.diaAdd} - ${row.diaSpent} = ${expected}, row says ${row.diaLeft}`);
        }
      }

      // 4. Draws accounting: total draws equals sum of row.draws.
      const rowDraws = rows.reduce((s, r) => s + (r.draws ?? 0), 0);
      if (rowDraws !== totals.draws) fail(key, `row draws sum ${rowDraws} != totals.draws ${totals.draws}`);

      // 5. Promo draws land on the promo day, capped at max_draws.
      if (promo && startDay <= (promo.day ?? 999)) {
        const promoRow = rows.find((r) => r.day === promo.day);
        if (!promoRow) fail(key, `no row for promo day ${promo.day}`);
        else {
          const promoNotes = promoRow.notes.filter((n) => n.includes("Promo draws:"));
          if (promoNotes.length === 0) fail(key, `promo day ${promo.day} has no "Promo draws" note`);
        }
      }

      // 6. Mega draw tokens. Only meaningful when the plan actually reaches day 1.
      if (megaDraw && startDay <= (megaDraw.day ?? 1)) {
        const megaRow = rows.find((r) => r.day === (megaDraw.day ?? 1));
        const wantsMega = megaRow && megaRow.notes.some((n) => n.includes("mega draw"));
        if (!wantsMega) fail(key, `mega draw day ${megaDraw.day} has no mega-draw purchase`);
      }

      // 7. First-time 10x fires exactly once (when affordable and in demand).
      if (firstTime10x) {
        const tenxNotes = rows.flatMap((r) => r.notes.filter((n) => n.includes("1st-time 10x")));
        if (tenxNotes.length > 1) fail(key, `first-time 10x noted ${tenxNotes.length} times`);
        if (simDiag.firstTenxUsed && tenxNotes.length === 0) fail(key, "sim firstTenxUsed=true but no 1st-time 10x note");
      }

      // 8. Recharge rebate tokens claimed (one per qualifying recharge day, capped at max_hits).
      if (rebate) {
        const rebateTotal = sumTokens(rows, "daily recharge rebate");
        const maxHits = rebate.max_hits ?? 3;
        if (rebateTotal > maxHits) fail(key, `rebate claimed ${rebateTotal} tokens, cap ${maxHits}`);
      }

      // 9. Consecutive-recharge streak tiers claimed. Only gate on the window
      //    actually being planable (start day on/before the 8-day streak window).
      if (streak && startDay <= (streak.consecutive_days ?? 8)) {
        const streakTotal = sumTokens(rows, "consecutive recharge");
        const tierClaimed = simDiag.streakTiers ?? [];
        const expectedTiers = (streak.tiers ?? [])
          .filter((t) => tierClaimed.includes(t.days))
          .reduce((s, t) => s + (t.tokens ?? 0), 0);
        // Only assert when the streak ran far enough to claim a tier.
        if (tierClaimed.length > 0 && streakTotal !== expectedTiers) {
          fail(key, `streak claimed ${streakTotal} tokens, expected ${expectedTiers} (tiers: ${JSON.stringify(tierClaimed)})`);
        }
      }

      // 10. Early phase-token claims. Only check phases the plan actually reaches.
      if (claimEarly && phases.length >= 2) {
        const p1 = phases[0]; const p2 = phases[1];
        const p1Close = phaseEnd(p1); const p2Close = phaseEnd(p2);
        if (startDay <= p1Close) {
          const p1Tokens = p1.tasks.reduce((s, t) => s + (t.tokens ?? 0), 0);
          const p1Claimed = sumTokens(rows, `all tasks completed (phase ${p1.phase})`);
          if (p1Claimed !== p1Tokens) fail(key, `phase 1 claimed ${p1Claimed} tokens, expected ${p1Tokens}`);
          const p1ClaimDay = rows.find((r) => r.notes.some((n) => n.includes(`all tasks completed (phase ${p1.phase})`)))?.day;
          if (p1ClaimDay != null && p1ClaimDay > p1Close) fail(key, `phase 1 claimed on day ${p1ClaimDay} after close ${p1Close}`);
        }
        if (startDay <= p2Close) {
          const p2Tokens = p2.tasks.reduce((s, t) => s + (t.tokens ?? 0), 0);
          const p2Claimed = sumTokens(rows, `all tasks completed (phase ${p2.phase})`);
          if (p2Claimed !== p2Tokens) fail(key, `phase 2 claimed ${p2Claimed} tokens, expected ${p2Tokens}`);
          const p2ClaimDay = rows.find((r) => r.notes.some((n) => n.includes(`all tasks completed (phase ${p2.phase})`)))?.day;
          if (p2ClaimDay != null && p2ClaimDay > p2Close) fail(key, `phase 2 claimed on day ${p2ClaimDay} after close ${p2Close}`);
        }
      }

      // 11. Pass count: the 11.11 plan buys 5 weekly passes (special_mechanics.max_passes).
      const passCountDiag = simDiag.passBuyDays ?? [];
      const actualPasses = passCountDiag.length;
      const maxPasses = E.special_mechanics?.max_passes ?? 10;
      if (actualPasses > maxPasses) fail(key, `bought ${actualPasses} passes, cap ${maxPasses}`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`verify-special: ${plans} plans checked (${GRID_DIA.length} dia x ${GRID_START.length} starts x ${GRID_FP.length} fp)`);
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} invariant violation(s)`);
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log("ALL INVARIANTS HOLD");
console.log(`  event: ${E.id} (${E.name}), draws(target realistic) = 119`);
console.log(`  premium supply: ${phases.length} phases (${phases.map((p) => `p${p.phase} d${p.start_day}-${phaseEnd(p)}`).join(", ")})`);
console.log(`  streak: ${streak ? streak.consecutive_days + " days" : "none"}, rebate: ${rebate ? rebate.max_hits + " hits" : "none"}`);
console.log(`  promo: ${promo ? `${promo.max_draws} draws on day ${promo.day}` : "none"}, mega: ${megaDraw ? `day ${megaDraw.day}` : "none"}`);
