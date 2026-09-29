// scripts/verify-aspirants.mjs
//
// Read-only verification harness for the Aspirants category (every event marked
// `"category": "aspirants"` in data/events.json — currently aspirants_2026 and
// aspirants_5.0), covering the bingo recharge planner. Run with:
//   npm run verify:aspirants   (add `--quick` for a small smoke run)
//
// Why this exists: the aspirants end-game funding loop used to exit with a plan
// that was still short by 47-734 diamonds ("Free draws don't cover the target.
// N extra diamonds needed.") because the tail branch's daily-savings heuristic
// could evaluate to 0 while a real residual remained. `next lint` / `next build`
// cannot see that — only the numbers can. This script asserts the invariants
// that must hold for EVERY input and EVERY Aspirants edition, and pins the
// non-aspirants plans by hash so a change to the shared bingo branch can never
// quietly move JJK / Street Fighter / Collector.
//
// Every expectation that depends on the calendar is derived from the event's own
// data (its premium-supply phases, its duration) — never from this edition's
// literal day numbers — so a future Aspirants is held to the same rules without
// the harness being edited alongside it.
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
const packsData = JSON.parse(fs.readFileSync(path.join(repoRoot, "data", "packs.json"), "utf8"));
const { buildPlan } = await import(pathToFileURL(path.join(repoRoot, "lib", "planOrchestrator.js")).href);
// The shared predicate the app itself branches on — imported (not re-inlined) so
// the harness proves the SAME function drives the planner and the tests.
const { isAspirantsEvent } = await import(pathToFileURL(path.join(repoRoot, "lib", "eventHelpers.js")).href);
// The drip model the planner uses to price a pass — imported (not re-implemented)
// so check 13 replays the SAME function, not a copy that can drift.
const { passPurchasesTotalDia } = await import(pathToFileURL(path.join(repoRoot, "lib", "idealSchedule.aspirants.js")).href);

const QUICK = process.argv.includes("--quick");
const ASPIRANTS_EVENTS = events.filter(isAspirantsEvent);
if (ASPIRANTS_EVENTS.length === 0) {
  throw new Error("verify-aspirants: data/events.json contains no event with \"category\": \"aspirants\"");
}
// The hand-validated reference edition — the one whose plan shape is byte-pinned.
const ASPIRANTS = ASPIRANTS_EVENTS.find((e) => e.id === "aspirants_2026") ?? ASPIRANTS_EVENTS[0];
const ALL_FP = { fp_50: true, fp_150: true, fp_250: true, fp_500: true };
const OWNED = { groups: {}, skins: [] };

// ---------------------------------------------------------------------------
// Event-relative calendar anchors. The simulator defines the accumulation day
// as `lastPhaseEnd + 1` (see planOrchestrator's firstAccDayOf), so the harness
// reads the same quantity off the same data instead of hardcoding "14"/"15".
// ---------------------------------------------------------------------------
function anchorsOf(event) {
  const phases = Array.isArray(event.premium_supply) ? event.premium_supply : [];
  const phaseEnd = (p) => p.start_day + (p.duration_days ?? 1) - 1;
  const lastPhaseEnd = phases.reduce((m, p) => Math.max(m, phaseEnd(p)), 0);
  const firstPhaseStart = phases.reduce((m, p) => Math.min(m, p.start_day), Infinity);
  const lastPhaseStart = phases.reduce((m, p) => Math.max(m, p.start_day), 0);
  return {
    phases,
    phaseEnd,
    firstPhaseStart: Number.isFinite(firstPhaseStart) ? firstPhaseStart : 0,
    lastPhaseStart,
    lastPhaseEnd,
    // First day the 1/day discounted-draw window opens.
    firstAccDay: Math.min(lastPhaseEnd + 1, event.duration_days),
  };
}

// Start-day grid for one edition. Chosen to reproduce the reference edition's
// proven coverage — day 1, three starts INSIDE the first phase window, the last
// phase start, and three late starts — while scaling to the event's own length.
function gridStartsFor(event) {
  const a = anchorsOf(event);
  const d = event.duration_days;
  const raw = a.phases.length === 0
    ? [1, 2, 3, 4, 5, 6, d - 2, d]
    : [
        1,
        a.firstPhaseStart + 1,
        a.firstPhaseStart + 2,
        a.phaseEnd(a.phases[0]),
        a.lastPhaseStart,
        a.firstAccDay + 2,
        d - 2,
        d,
      ];
  return [...new Set(raw.filter((x) => x >= 1 && x <= d))].sort((x, y) => x - y);
}

const GRID_DIA = QUICK ? [0, 2025] : [0, 500, 1000, 1500, 2000, 2025, 2500, 3000, 4000];
const GRID_FP = QUICK ? [{}] : [{}, ALL_FP];
// Start days are per-event (see gridStartsFor below), derived from that event's
// own premium-supply phases and duration. The reference edition resolves to
// 1/4/5/7/10/17/21/23, where 4/5/7 land inside phase 1 (days 3-7) and cover the
// open-phase recharge-claim path (tokens must be claimable on the first planable
// day).

// Captured on the pre-fix code (aspirants2026 @ 7ba2cdb) with the exact same
// inputs; the aspirants fix must not touch any other event type.
// Re-pinned Sep 28 2026 for the pack recharge-credit correction: recharge tasks
// now count each pack's BASE (the "234+23" split) and the weekly pass its
// recharge_task_value, not the wallet yield. Recharge containers therefore need
// more packs, which moves prices. Plus data corrections: r_14/r_28/r_42 added,
// and r_5/r_11/r_22 repriced to 14/28/55 per the in-game shop.
const REGRESSION_BASELINE = {
  "street_fighter_2026|dia0|start1": "b77cb45e54c975d2",
  "street_fighter_2026|dia1000|start1": "419318e45797c6e0",
  "jujutsu_kaisen_2026|dia0|start1": "284d079cb08d5cdb",
  "jujutsu_kaisen_2026|dia2000|start1": "38d4f14ace16dfc9",
  "exquisite_collection|dia0|start1": "b9dd6e79146006ad",
  "exquisite_collection|dia500|start5": "4307cf9cd5995c62",
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
// confidence), keyed by `<event id>|dia..|start..|fp ..`. The 0-dia day-1 plan
// of the reference edition is the hand-validated shape - balance-poor pacing
// must provably stay need-driven. Updated deliberately when a reviewed change
// improves the shape: the converge-on-checkpoint hold
// (Sep 2026) moved the checkpoint from 10/1 to 9/30 (d15, the first
// accumulation day) with one unbroken cadence, ৳3,700 → ৳3,415 (the starved
// d5/d15 holds now draw on d6/d14 instead, the d16 emergency pass and the
// 9/30 idle day are gone, and the final push shrank from 4 to 2 singles).
// Re-pinned (Sep 24 2026, token-guard scoping): the pre-checkpoint hold is now
// scoped to days with pending phase tokens, so the ladder no longer rests in
// front of the checkpoint. The reference plan keeps its ৳3,415 - the 40-checkpoint
// + same-day first-time 10x simply move to 9/29 (d14, the same pacing the rich
// plans get) and the 10x's funding packs ride along one day earlier.
// Re-pinned Sep 28 2026 for the pass-recharge agreement fix (injectPhasePacks read
// only the FIRST distributePassPurchases entry for a day, so a phase start that
// coincided with firstPassBuyDay under-counted its passes and bought packs the
// passes had already covered). Plus the pack recharge-credit correction and the
// in-game shop data fixes (r_14/r_28/r_42 added, r_5/r_11/r_22 repriced).
//
// IMPORTANT: the day-1 plan's BEHAVIOUR is unchanged by the pass fix — ৳3,610,
// 60 draws, 321 dia left, 0 warnings, checkpoint + same-day 10x on day 13 —
// because firstPassBuyDay=1 never coincides with a phase start here, so the bug
// could not fire. This hash moved only because the plan payload gained the two
// diagnostic fields `passRechargeAssumed` / `passRechargeBooked`. Mid-event
// starts (>= 8) DID change materially: a phase start with 3 passes on it now
// buys 0 packs instead of 3x r_55 (৳715 -> ৳600), which is the whole point.
// Re-pinned 1d6e11f317f6940d (2026-09-28, three coupled fixes to weekly-pass
// handling). Full plan hash, so this moves for all three.
//
// 1. No pre-phase (day-1) pass without a surprise window. The plan used to open
//    with a weekly pass on day 1 even though nothing could use it: this edition's
//    first premium-supply phase starts on day 3, and the day-1 pass's own drip
//    does not mature until day 8. That unit only ever existed to bank recharge
//    credit inside a surprise-task window, and Aspirants has no surprise_tasks —
//    so it is now dropped outright for any event in the category instead of
//    waiting for the +/-30 BDT price comparison to happen to agree.
//
// 2. The DP priced every pass at a flat 220 (80 instant + 20x7 drip). That is
//    only true of a pass bought EARLY with an empty drip queue: passes drip
//    sequentially and a drip past the event's final day is never received, so a
//    pass bought on day 15 of a 23-day event is worth 80, not 220. buildItemList
//    now takes the real in-window yield for the pass schedule in use.
//
// 3. `passQueueEndDay` disagreed with the drip model it claimed to mirror: it
//    treated every pass as dripping in parallel from its own purchase day
//    (`day + 6`) while buildPassDripSchedule chains a single sequential cursor.
//    A starved-day top-up pass appended to an already-overrunning queue was
//    therefore credited a full 7-day drip it could never receive. On the
//    dia=0 / start=15 cell that let a plan book 1,580 dia of passes it only ever
//    received 1,140 of. The queue helper is now sequential, and a top-up pass is
//    booked by the exact marginal yield the drip schedule delivers.
//
// Reference plan (this cell): 3,610 -> 3,487 BDT. It is now funded to the dia
// (recharge 3,150 = spend 3,150, 0 left over) instead of the previous 3,261 /
// 3,150 with 111 dia stranded. The reported over-recharge case
// (aspirants_5.0, dia 0, all first-purchase packs claimed) goes 5,535 -> 5,271
// BDT with the overshoot cut from 525 to 213 dia. Both are cheaper, not dearer —
// no day-1 pass is being paid for, and no pass is credited drip it cannot
// deliver. Still 60 draws, fully funded, 0 warnings.
const ASPIRANTS_BASELINE = {
  "aspirants_2026|dia0|start1|fp none": "1d6e11f317f6940d",
};

const failures = [];
function check(cond, label, detail) {
  if (!cond) failures.push(`${label} :: ${detail}`);
}

function notesOf(row) {
  return row.actionLines ?? row.notes ?? [];
}
const isTenxNote = (n) => /10-draw|10x/.test(n);
const isPassNote = (n) => /weekly pass/i.test(n);

// Day the running draw total first reaches the 40-draw bingo checkpoint (0 when
// the plan never gets there - only the 30/40-draw tier probes).
function cpRowOf(rows) {
  let cum = 0;
  for (const r of rows) { cum += r.draws; if (cum >= 40) return r.day; }
  return 0;
}

function planAspirants(event, dia, startDay, fp) {
  return buildPlan(event, { diamonds: dia, weeklyPasses: 0, fpClaimed: fp }, null, OWNED, "worst", startDay);
}

function verifyAspirants(event, plan, dia, startDay, fpLabel) {
  const a = anchorsOf(event);
  const label = `${event.id} dia=${dia} start=${startDay} fp=${fpLabel}`;
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

  // 6b. Pass-recharge accounting must AGREE between the two places that compute
  //     it. `injectPhasePacks` estimates the recharge credit a phase start already
  //     has from the passes bought that day (to size the container for the rest);
  //     the simulator books the same quantity from the real purchase schedule.
  //     They used to diverge whenever passes landed on a phase-start day, because
  //     distributePassPurchases emits TWO entries for that day and the estimate
  //     read only the first — so the phase believed it still owed a ~150-dia gap
  //     and bought packs (3× r_55, ৳315) that three passes on that day had
  //     already covered (৳600). This asserts the estimate is never below the
  //     truth and never above it, in both directions.
  {
    const assumed = plan.passRechargeAssumed ?? {};
    const booked = plan.passRechargeBooked ?? {};
    for (const [d, v] of Object.entries(assumed)) {
      const actual = booked[d] ?? 0;
      check(v === actual, label,
        `pass recharge on day ${d}: assumed ${v}, simulator booked ${actual}`);
    }
  }

  // 7. Pass cap (in-game max 10 in the sequential queue).
  check(passCount <= 10, label, `passes=${passCount}`);

  // 8. Integer diamond accounting: every recharge entry carries exact integers
  //    (80 instant + 20/day drip per pass — never a fractional per-pass
  //    average), so the displayed totals can never read "6,594.33 dia".
  for (const p of plan.recharge.packsUsed) {
    check(Number.isInteger(p.dia) && Number.isInteger(plan.recharge.totalDia), label,
      `fractional dia: ${p.id} dia=${p.dia} totalDia=${plan.recharge.totalDia}`);
  }

  // 9. Open-phase claims: a start INSIDE a phase window whose window still
  //    covers startDay must claim that phase's recharge tokens on the first
  //    planable day — 12 recharge + 1 login (spend tokens may add more). The old
  //    exact-phase-start-day check silently dropped all of them. Derived from the
  //    event's own phase days, not a hardcoded 3-7.
  {
    const openPhase = a.phases.find((p) => startDay >= a.firstPhaseStart && startDay <= a.phaseEnd(p));
    if (openPhase && openPhase.tasks?.some((t) => t.type?.startsWith("recharge_"))) {
      const rechargeTokens = openPhase.tasks
        .filter((t) => t.type?.startsWith("recharge_"))
        .reduce((s, t) => s + (t.tokens ?? 0), 0);
      const loginTokens = openPhase.tasks.find((t) => t.type === "login")?.tokens ?? 0;
      check(rows[0].draws >= rechargeTokens + loginTokens, label,
        `open-phase tokens not claimed on day 1: draws=${rows[0].draws} notes=${JSON.stringify(notesOf(rows[0]))}`);
    }
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
      check(tenxRow === 0 || cpRow >= event.duration_days || tenxRow >= cpRow,
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

  // 12. Lazy cadence + no-gap ladder (surplus day-1 plans): with a rich starting
  //     balance the pacing is calendar-driven - the days before the last phase
  //     rest while the pending phase tokens carry the ladder, then every day
  //     from the 30-draw tier on draws without a gap. The 40-checkpoint lands on
  //     the last phase's closing day (lastPhaseEnd) with the first-time 10x
  //     firing the SAME day (the user's rule: 40 reached, no bingo -> buy for 50
  //     and 10x that same day), and 60 lands on the final day - so there is no
  //     stockpiled mid-phase checkpoint and no idle tail days at the end.
  //     Anchors are read off the event's own phases/duration (d14/d23 on the
  //     reference edition), never hardcoded.
  if (startDay === 1 && dia >= 2000) {
    check(cpRowOf(rows) === a.lastPhaseEnd, label,
      `rich-start checkpoint on day ${cpRowOf(rows)} (expected ${a.lastPhaseEnd} - the last phase's closing day)`);
    check(plan.tenxDay === a.lastPhaseEnd, label,
      `rich-start 10x on day ${plan.tenxDay} (expected ${a.lastPhaseEnd} - same-day 10x on the checkpoint)`);
    const lastDrawDay = rows.filter((r) => (r.draws ?? 0) > 0).pop()?.day ?? 0;
    if (event.id === ASPIRANTS.id) {
      // The reference edition's calendar is exactly sized for the 60-draw worst
      // case, so it must spend every day to the end — the shape its byte pin was
      // taken from. A longer edition is not calendar-bound (60 draws can land
      // before the final day), so this property is asserted for the reference
      // edition only; every edition is held to "never draws past the event".
      check(lastDrawDay === event.duration_days, label,
        `last draw on day ${lastDrawDay} != ${event.duration_days} - idle tail days at the end`);
    }
    check(lastDrawDay <= event.duration_days, label,
      `last draw on day ${lastDrawDay} is past the event's final day (${event.duration_days})`);
    // No zero-draw day between the 30-draw tier and REACHING THE TARGET. Days
    // after the 60th draw are not a gap — the plan is done and must not keep
    // spending. (On a long edition a rich player can reach 60 well before the
    // final day; only the pre-target stretch has to be unbroken.)
    let cum = 0;
    let firstPast30 = 0;
    const zeroAfter30 = [];
    for (const r of rows) {
      const before = cum;
      cum += r.draws ?? 0;
      if (!firstPast30 && cum >= 30) firstPast30 = r.day;
      const stillClimbing = before < 60;
      if (firstPast30 && stillClimbing && (r.draws ?? 0) === 0) zeroAfter30.push(r.day);
    }
    check(zeroAfter30.length === 0, label,
      `zero-draw day(s) [${zeroAfter30.join(",")}] after cum >= 30 (day ${firstPast30})`);
  }

  // 12b. No pre-phase (day-1) pass without a surprise window. The day-1 unit only
  //     exists to bank recharge credit INSIDE the surprise-task window, because
  //     that credit is only claimable in the first few days. With no surprise
  //     tasks there is nothing to bank it for, so the plan must not buy one —
  //     regardless of what the price search concluded. Aspirants has no
  //     surprise_tasks; an event that DOES have them keeps the price-based
  //     decision, so this check is scoped to the no-surprise case.
  {
    const early = startDay < a.firstPhaseStart; // the pre-phase run the rule targets
    if (early && !event.has_surprise_tasks) {
      const day1Passes = notesOf(rows[0]).filter(isPassNote)
        .reduce((s, n) => s + (parseInt((n.match(/(\d+)/) || [])[1] ?? "0", 10) || 0), 0);
      check(day1Passes === 0, label,
        `pre-phase (day ${startDay}) row buys ${day1Passes} weekly pass(es) but the event has no surprise tasks: ${JSON.stringify(notesOf(rows[0]))}`);
    }
  }

  // 13. Weekly-pass in-window yield. The plan aggregates every pass it buys into
  //     ONE `weekly_pass` row, so that row's `dia` is the true wallet yield of
  //     the whole pipeline — not 220 x count. Passes drip sequentially and any
  //     drip past the event's final day is never received, so the row must never
  //     exceed the full yield, and must MATCH what the schedule's own purchase
  //     notes actually deliver. This is the assertion that the DP and the
  //     displayed schedule cannot disagree about what a pass is worth.
  {
    const wp = packsData.weekly_pass;
    const wpFull = wp.dia_instant + wp.dia_daily * wp.days;
    const passRows = (plan.recharge.packsUsed ?? []).filter((p) => p.id === "weekly_pass");
    for (const p of passRows) {
      check(Number.isInteger(p.dia), label, `pass row carries fractional dia: ${p.dia}`);
      check(p.dia <= wpFull * p.count, label,
        `pass row credited ${p.dia} dia > ${p.count} x ${wpFull} — a drip is double-counted`);
      // Per-unit: the game credits recharge_task_value on the purchase day, not
      // the wallet yield. (The row carries the per-unit value; the orchestrator
      // multiplies by count when summing.)
      check(p.rechargeDia === wp.recharge_task_value, label,
        `pass recharge credit ${p.rechargeDia} != recharge_task_value ${wp.recharge_task_value}`);
    }
    // Strong form: replay the drip from the purchase notes themselves.
    const receipts = [];
    for (const r of rows) {
      for (const n of notesOf(r)) {
        if (!isPassNote(n)) continue;
        receipts.push({ day: r.day, count: parseInt((n.match(/(\d+)/) || [])[1] ?? "1", 10) || 1 });
      }
    }
    const booked = passRows.reduce((s, p) => s + p.dia, 0);
    if (receipts.length > 0 && booked > 0) {
      const replayed = passPurchasesTotalDia(receipts, wp, event.duration_days);
      check(booked === replayed, label,
        `pass wallet yield ${booked} != ${replayed} replayed from the schedule's own purchases ${JSON.stringify(receipts)}`);
    }
  }

  // 14. Balance arithmetic holds on every row. The schedule's "Diamonds left"
  //     column must equal `previous + added - spent` all the way down. The
  //     draw-cap that trims the plan back to the bingo target used to reduce
  //     diaSpent without returning the diamonds to diaLeft, so every row from
  //     the first trimmed draw onward was short by the removed cost and a plan
  //     that really ended with 211 dia displayed "1 dia left" — while the
  //     recharge table implied 211 of unused purchase. Rows carrying the
  //     main/sub-row split are excluded: that row's aggregate is republished by
  //     attachAspirantsSubrowSplit and is covered by the split checks above.
  {
    let prevLeft = 0;
    for (const r of rows) {
      if (!r.subrow) {
        const expected = prevLeft + (r.diaAdd ?? 0) - (r.diaSpent ?? 0);
        check(r.diaLeft === expected, label,
          `day ${r.day}: diaLeft ${r.diaLeft} != prev ${prevLeft} + add ${r.diaAdd ?? 0} - spent ${r.diaSpent ?? 0} = ${expected}`);
      }
      prevLeft = r.diaLeft ?? 0;
    }
    // And the plan-wide total must agree with the schedule's own spend, so the
    // recharge summary and the day table cannot tell different stories.
    const rowSpend = rows.reduce((s, r) => s + (r.diaSpent ?? 0), 0);
    check(rowSpend === totals.dia, label,
      `rows spend ${rowSpend} != daySchedule.totals.dia ${totals.dia}`);
  }

  return {
    eventId: event.id,
    dia, startDay, fp: fpLabel,
    bdt: plan.recharge.totalBdt,
    rechargeDia: plan.recharge.totalDia,
    spent: totals.dia,
    endLeft: last?.diaLeft ?? 0,
    // Diamonds bought that the plan never spends: the balance the user is left
    // holding. Reported (not asserted) because some waste is unavoidable — a
    // purchase is a whole pack — but it is the number that exposed the
    // per-day container fragmentation, and it is invisible in a BDT total.
    waste: last?.diaLeft ?? 0,
    passes: passCount,
    checkpoint: plan.checkpointDay,
    tenx: plan.tenxDay,
    packs: plan.recharge.packsUsed.map((p) => `${p.id}x${p.count}`).join("+"),
    // Full pack rows, so the pack-semantics check can assert every pack a plan
    // actually bought exposes both its wallet yield and its recharge credit.
    packRows: plan.recharge.packsUsed.map((p) => ({ id: p.id, dia: p.dia, rechargeDia: p.rechargeDia })),
  };
}

// ---------------------------------------------------------------------------
// Aspirants grid — every edition in the category, each on its own start-day
// grid (gridStartsFor) and its own calendar anchors (anchorsOf).
// ---------------------------------------------------------------------------
const results = [];
const startedAt = Date.now();
for (const event of ASPIRANTS_EVENTS) {
  const starts = QUICK ? gridStartsFor(event).slice(0, 1) : gridStartsFor(event);
  const an = anchorsOf(event);
  console.log(
    `\nAspirants grid [${event.id}]: ${GRID_DIA.length} dia x ${starts.length} startDay x ${GRID_FP.length} fp ` +
    `= ${GRID_DIA.length * starts.length * GRID_FP.length} plans ` +
    `(duration ${event.duration_days}d, phases ${an.phases.map((p) => `${p.start_day}-${an.phaseEnd(p)}`).join("/") || "none"}, lastPhaseEnd ${an.lastPhaseEnd})`
  );
  for (const fp of GRID_FP) {
    for (const startDay of starts) {
      for (const dia of GRID_DIA) {
        const fpLabel = fp === ALL_FP ? "claimed" : "none";
        const plan = planAspirants(event, dia, startDay, fp);
        // Byte pin: hand-validated aspirants plans must never drift.
        const baselineKey = `${event.id}|dia${dia}|start${startDay}|fp ${fpLabel}`;
        if (ASPIRANTS_BASELINE[baselineKey]) {
          const bHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
          check(bHash === ASPIRANTS_BASELINE[baselineKey], `pin ${baselineKey}`,
            `plan hash ${bHash} != baseline ${ASPIRANTS_BASELINE[baselineKey]}`);
        }
        results.push(verifyAspirants(event, plan, dia, startDay, fpLabel));
        // DEBUG: print the reference edition's dia=0 start=1 fp=none schedule.
        if (QUICK === false && event.id === ASPIRANTS.id && dia === 0 && startDay === 1 && fpLabel === "none") {
          console.log(`\n[DEBUG] ${event.id} dia=0 start=1 fp=none schedule (first 20 rows):`);
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
}
console.log(`  ${results.length} plans in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

// Waste summary. `waste` = startingDia + bought - spent = the diamonds the plan
// buys and never uses. It is a REPORT, not an invariant: a purchase is a whole
// pack, so some waste is unavoidable. It is here because it is the only figure
// that showed up the per-day container fragmentation (a 1,000-dia start bought
// 2,466 for a 1,940 need) while every BDT total looked plausible.
{
  // Only plans that genuinely had to BUY are meaningful here. When the user's own
  // balance already covers the spend (dia >= spent), `waste` is mostly their
  // unspent starting diamonds, which says nothing about the purchase logic.
  const buyers = results.filter((r) => r.dia < r.spent);
  const wasted = buyers.map((r) => r.waste).filter((w) => w > 0).sort((a, b) => a - b);
  const median = wasted.length ? wasted[Math.floor(wasted.length / 2)] : 0;
  const worst = buyers.slice().sort((a, b) => b.waste - a.waste)[0];
  const totalWasted = buyers.reduce((s, r) => s + Math.max(0, r.waste), 0);
  console.log(`\nDiamond waste over plans that had to buy (${buyers.length}/${results.length} cells;`
    + ` ${results.length - buyers.length} had a sufficient balance already):`);
  console.log(`  median ${median} dia, worst ${worst ? worst.waste : 0} dia`
    + (worst && worst.waste > 0 ? ` (${worst.eventId} dia=${worst.dia} start=${worst.startDay} fp=${worst.fp})` : "")
    + `, total ${totalWasted.toLocaleString("en-US")} dia`);
}

function printTable(event, fpLabel) {
  const starts = gridStartsFor(event);
  const rowsFor = results.filter((r) => r.eventId === event.id && r.fp === fpLabel);
  console.log(`\nRecommended Recharge BDT (${event.id}, fp=${fpLabel})`);
  console.log("  dia\\start " + starts.map((s) => String(s).padStart(8)).join(""));
  for (const dia of GRID_DIA) {
    const cells = starts.map((s) => {
      const r = rowsFor.find((x) => x.dia === dia && x.startDay === s);
      return String(r ? r.bdt : "-").padStart(8);
    });
    console.log("  " + String(dia).padStart(8) + " " + cells.join(""));
  }
}
for (const event of ASPIRANTS_EVENTS) {
  for (const fp of GRID_FP) printTable(event, fp === ALL_FP ? "claimed" : "none");
}

console.log("\nKey scenarios (60 draws each; left = diamonds left after the last draw)");
// Day-1 scenarios (the worst-case pacing) across every edition.
for (const r of results.filter((x) => (x.dia === 0 || x.dia === 2025) && x.startDay === 1)) {
  console.log(`  ${r.eventId.padEnd(15)} dia=${String(r.dia).padEnd(5)} start=${String(r.startDay).padEnd(3)} fp=${r.fp.padEnd(7)} BDT=${String(r.bdt).padEnd(6)} rechargeDia=${String(r.rechargeDia).padEnd(6)} spent=${String(r.spent).padEnd(6)} left=${String(r.endLeft).padEnd(5)} waste=${String(r.waste).padEnd(5)} passes=${r.passes} cp=${r.checkpoint} tenx=${r.tenx}  ${r.packs}`);
}

// ---------------------------------------------------------------------------
// Pack recharge semantics (packs.json base+bonus split)
// ---------------------------------------------------------------------------
// MLBB sells packs as "234+23 Diamonds": the FIRST number is what counts toward
// a recharge TASK, the "+n" is a wallet bonus that does not. Two things must
// hold, and neither is visible from a plan's totals:
//
//   a) the data itself is internally consistent (base + bonus = total), and
//   b) every pack the optimizer reports carries BOTH numbers, with the wallet
//      yield (total) >= the recharge credit (base). A pack where these collapse
//      is how the bug returns: a caller sizing a recharge container off `dia`
//      would silently over-credit the player.
console.log("\nPack recharge semantics (packs.json)");
{
  const all = [
    ...packsData.regular.map((p) => ({ ...p, kind: "regular" })),
    ...packsData.first_purchase.map((p) => ({ ...p, kind: "first_purchase" })),
  ];
  for (const p of all) {
    if (p.dia_base == null || p.dia_bonus == null) {
      failures.push(`packs ${p.id} :: missing dia_base/dia_bonus split`);
      continue;
    }
    check(p.dia_base + (p.dia_bonus ?? 0) + (p.dia_extra ?? 0) === p.total,
      `packs ${p.id}`,
      `base ${p.dia_base} + bonus ${p.dia_bonus} + extra ${p.dia_extra ?? 0} != total ${p.total}`);
    check(p.dia_base <= p.total, `packs ${p.id}`,
      `dia_base ${p.dia_base} > total ${p.total} (recharge credit exceeds the wallet yield)`);
  }
  const pass = packsData.weekly_pass;
  const passYield = pass.dia_instant + pass.dia_daily * pass.days;
  check(pass.recharge_task_value < passYield, "weekly_pass",
    `recharge_task_value ${pass.recharge_task_value} is not below the ${passYield} wallet yield`);
  // Every pack a plan actually bought must expose the split.
  for (const r of results) {
    for (const p of r.packRows ?? []) {
      check(p.rechargeDia != null && p.rechargeDia <= p.dia, `${r.eventId} pack ${p.id}`,
        `rechargeDia ${p.rechargeDia} not <= wallet dia ${p.dia}`);
    }
  }
  const withBonus = all.filter((p) => p.dia_bonus > 0).length;
  console.log(`  ${all.length} packs OK (${withBonus} carry a bonus excluded from recharge credit; pass credits ${pass.recharge_task_value} of ${passYield})`);
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
  let plan = null;
  try {
    plan = buildPlan(event, { diamonds: dia, weeklyPasses: 0, fpClaimed: {} }, target, OWNED, "realistic", startDay);
    hash = createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 16);
    info = `bdt=${plan.recharge.totalBdt} draws=${plan.daySchedule.totals.draws}`;
  } catch (err) {
    info = `threw: ${err.message}`;
  }
  const expected = REGRESSION_BASELINE[key];
  const ok = hash === expected;
  if (!ok) failures.push(`regression ${key} :: hash ${hash} != baseline ${expected}`);
  console.log(`  ${ok ? "OK  " : "FAIL"} ${key.padEnd(42)} ${hash} (baseline ${expected}) ${info}`);

  // The "no pre-phase pass" rule must be gated on the event ACTUALLY having a
  // surprise window. Street Fighter and Jujutsu Kaisen both do (active_days 3),
  // so the day-1 pass there is banking credit that is only claimable early and
  // must still be decided on price. If the rule ever leaked out of the
  // `!has_surprise_tasks` guard, these plans would silently lose their day-1
  // pass and the byte hash above would move — this assertion names the
  // dependency explicitly so the failure reads as the cause, not the symptom.
  if (event.has_surprise_tasks && ok && dia === 0) {
    const day1 = (plan.daySchedule.rows.find((r) => r.day === startDay) ?? {}).notes ?? [];
    const passNotes = day1.filter(isPassNote);
    console.log(`       ${id} keeps its pre-phase pass (surprise_tasks active_days=${event.surprise_tasks?.active_days}): ${JSON.stringify(passNotes)}`);
  }
}

// ---------------------------------------------------------------------------
console.log("");
if (failures.length > 0) {
  console.error(`FAILED: ${failures.length} invariant violation(s)`);
  for (const f of failures.slice(0, 40)) console.error("  - " + f);
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log(`PASS: ${results.length} aspirants plans across ${ASPIRANTS_EVENTS.length} edition(s) [${ASPIRANTS_EVENTS.map((e) => e.id).join(", ")}] (60 draws, 0 warnings, funded, monotonic tiers) + ${REGRESSION_CASES.length} unchanged non-aspirants plans`);
