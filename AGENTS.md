# SkinRoute — Session Context

## Git identity (Vercel deploy gate)
- Commit author email **must** be a valid GitHub account email (`aa-jim <abdullahaljim2@gmail.com>`). Vercel blocks deployments whose commit author email doesn't match a GitHub account — history was rewritten (filter-branch) on 2026-07-31 to fix commits authored by `builder@skinroute.local`, which silently blocked all deploys.

## Documentation
- All docs live in `docs/` (`README.md` index, `features.md`, `architecture.md`, `events.md` — adding a new event baseline, `development.md`)
- When making user-facing or planner changes, update the relevant docs + this file

## Recent Changes
### Aspirants 40/50 bingo-checkpoint staging + recharge dated to the draws it funds (Sep 2026)
- **Problem (user report)**: the schedule blew through the win tiers — the first-time 10x fired on the first affordable post-phase day at whatever the running total was (39 draws + 10x = 49, then a lone daily landed on 50 with no checkpoint in between), and on late starts it fired at 0 draws leaving a ~48-single dump on the last day. The end-game packs were also dated on fixed days (day-20 tenx funding, day-21/31 shortfall), so recharge suggestions appeared on the checkpoint day instead of on the day of the draws they funded.
- **Fix (1) — sim 10x gate** (`lib/idealSchedule.aspirants.js`): `simulateAspirantsFixedShape` gains `targetDraws` and its accumulation-mode 10x is gated `totalDraws >= 40 && totalDraws + 10 <= targetDraws` — the first-time 10x is reserved for the 40→50 hop (cost-neutral: 1,050 dia = 10 × the 105 discounted single). The sim returns `firstTenxUsed`.
- **Fix (2) — staged final push** (`buildAspirantsPlanWithPacks`): the last row's push is written in tier order — singles → exactly 40 ("bingo checkpoint — stop here if the box is complete"), the reserved 10x → exactly 50, singles → 60 — same total cost/shortfall economics as the old single-block push.
- **Fix (3) — checkpoint-staged funding** (`lib/planOrchestrator.js`): the fixed day-20/21/31 injection blocks are replaced by a bounded loop (≤6 iters, re-sim each time): an accumulation day that starved (dia < daily cost) gets a **small top-up on that day** (keeps the 1/day cadence alive so 40 lands as early as the calendar allows), and everything else (the 10x + remaining tail) is injected on **`tenxDay` = the day AFTER the organic 40-checkpoint**, recomputed each iteration (a top-up can pull the checkpoint earlier); late starts with no organic checkpoint fund from `firstAccDay`. Each day's purchase suggestions therefore fund that day's draws — never the checkpoint day itself.
- **Report (startDay 1, dia 0 + passes)**: 39 organic by 9/29 → small pack + daily → **40 on 9/30**, packs + 10x → **50 on 10/1**, dailies to 10/8, push 3 → 60; worst ৳3,042 (unchanged), dia 2,025 → worst ৳1,070 (unchanged), no dead days, no warnings. Late starts (17/21) collapse the staged push onto their final day (honest for a 3-day window) and are now fully funded instead of warning-shortfall — startDay-21 plans no longer carry the short-window shortfall warning.
- **Regression**: 9-scenario non-aspirants set (SF/JJK/collector × dia × startDay) byte-identical (sha256 over the full plan); aspirants grid startDay 1/10/17/21 × dia 0/1000/2000/2025/4000: 60 draws, 0 negative rows, 0 warnings, tier BDT monotonic, 10x never before the 40 row, checkpoint-day pack notes ≤ 250 BDT (small top-up only), 10x 1–2 rows after the 40 row for day-1 starts. `next lint` + `next build` pass.
- Docs: `docs/features.md` (Recommended Recharge aspirants bullet), `docs/architecture.md` (aspirants funding paragraph).

### Aspirants: unnecessary day-1 weekly pass dropped when diamonds suffice (Sep 2026)
- **Problem (user report)**: planning The Aspirants with enough diamonds (max need for 60 draws = 2,940 dia) still suggested "Buy 1× weekly pass" on day 1 — the pass search's trial sims never claimed the phase-recharge tokens (no recharge on day 8/15), so the shortfall looked real and the search escalated to the 4-pass cap even with 4,000 dia in hand.
- **Fix (aspirants-only, bingo branch of `lib/planOrchestrator.js`)**: after the pass search, a **candidate search** replaces the day-1 unit. `addPacksToDay`/`injectPhasePacks` gained scratch-sink + pass-count/drop override params so trials never touch real state; candidates = keep / drop-same-count (passes redistributed onto remaining phase starts) / drop-one-fewer, each priced as passes + phase packs + a shortfall top-up via `optimizeRecharge`; the cheapest drop candidate is adopted when it costs at most **30 BDT (~15% of a pass)** more than keeping. Why a top-up is ever needed: passes bought the same day drip SEQUENTIALLY, so the user's "2,025 dia + 3 passes + r_257 = 2,942 ≥ 2,940" arithmetic is really 2,842 in-window (3 same-day passes = 560 dia, not 660) — the plan now honestly completes that structure with a small pack instead of keeping the day-1 pass.
- **Report (final +30 gate, dia 2,025)**: 3× pass d3 (first phase start) + r_257 = **1,070 BDT, no day-1 pass** — the redistribution lands all 3 passes on the first phase start, whose sequential drip (d3–23, 660 dia) stays fully in-window, so no top-up is needed (2,025 + 917 = 2,942 ≥ 2,940; 60 draws, 0 negative rows, 212 dia left over). 4,000 dia → 1,070; dia 2,000–2,020 → 1,570 (fp_250 timing top-up); dia 0 → 3,042 (drop structure re-plans all packs and undercuts the keep-plan).
- `lib/idealSchedule.aspirants.js` — `distributePassPurchases` gains `skipFirstBatch` (day-1 unit not created); sim reads `resources.dropFirstPass` + `resources.passPhaseStarts` (drop mode distributes across **remaining** phase starts only — past phase days are unbuyable); new exported `passPurchasesTotalDia` (sequential-queue dia total incl. instant dia when drip falls outside the event) keeps the recharge entry's per-pass dia exact in drop mode.
- Regression grid (83 scenarios: dia 0–4000 × startDay 1/10/17/21 × owned-pass/fp variants + JJK/collector): 45 byte-identical (incl. startDay 17/21, owned-pass, JJK, collector), 38 changed = aspirants startDay 1/10 cases only — 0 errors/negative rows/warnings, 60 draws everywhere, most adopted plans cheaper, worst +197 BDT (dia 0 fp-claimed, within the one-pass guard), `diamondCost.worst` and `bdtCost.worst` invariants intact. `next lint` + `next build` pass.
- Docs: `docs/features.md` (Recommended Recharge aspirants bullet), `docs/architecture.md` (order-of-operations note).
- **Per-tier card BDT now plans for each tier** (`buildBingoPlan` wrapper + `buildBingoPlanForTarget` probes 30/40/50): at 0 dia a 50-draw plan reads Tk 2,938 (was Tk 4,934 = a prefix of the 60-draw schedule carrying the day-20/21 top-ups that only fund draws 51-60). The day-20 first-time 10x funding only applies to targets > 40, and tiers are capped monotonic so cards always read 30 <= 40 <= 50 <= 60.
- **Adoption gate finalized at +30 BDT** (supersedes the intermediate one-pass-price (+200) and residual-top-up (≤ wp.bdt + 10) gates): the drop candidate is adopted only when `best.bdt <= keep.bdt + 30` — a pure price comparison, since the candidate's re-planned pack set is priced end-to-end (passes + phase packs + top-up) against the keep-plan. Verified grid (dia 0/500/1000/1500/1900/2000/2020/2025/2500/3000/4000 × fp variants × startDay 1/10/17/21): all 60 draws, 0 negative rows, 0 warnings; aspirants day-1 starts read 3,042 / 3,029 / 2,162 / 2,090 / 1,675 / 1,570 / 1,570 / **1,070** / 1,070 / 1,070 / 1,070 — the drop candidate now also wins at dia-poor inputs because its full re-plan undercuts the keep-plan (dia 0: 3,042 vs the old 4-pass keep ~4,737), so the day-1 pass disappears at every dia level for startDay 1; mid-event starts (10/17/21) keep the previous structure (startDay 21 warns about the short window). `next lint` + `next build` pass.

### Bingo UX pass: Event Skins step, money-first summary, draw-tier highlight, aspirants window fix (Aug 2026)
- **"Target" → "Event Skins"** for bingo: `ProgressBar.jsx` remaps step 2's label for bingo (renders EVENT SKINS, CSS-uppercased); `StepTwo.jsx` heading casing aligned.
- **Summary cards** (`StepFour.jsx`): the redundant "Total BDT" box is removed (3-card row); each diamond card's BDT line now carries the old total-box styling (gold + `<Wallet>` icon, `৳X–৳Y per plan`). Equal range endpoints collapse to one figure (e.g. lucky 30/40 covered by the same purchase reads `৳1,270 per plan`, not `৳1,270–৳1,270`).
- **Schedule table** (`ScheduleTable.jsx`): for bingo, the Cumulative cell (desktop) and total chip (mobile day cards) get a **gold circle background** only on the exact day the running total *first crosses* a win-condition tier (30, then 40, 50, 60) — subsequent days return to the plain brick number. The "Show all" expander is replaced with a **staged Continue reveal** for bingo: the schedule is shown up to the 30-draw day first with a "Didn't hit the bingo? – Continue" footer; tapping Continue extends to 40, then 50; stage 2 reads "sigh…this time for sure — Continue", after which the full 60-draw schedule shows. Non-bingo events keep the plain expand-all.
- **Aspirants window fix**: `data/events.json` `duration_days` 25 → **23** (Sep 16 → Oct 8 is 23 days). Previously the schedule ran to Day 25 → dates dragged to 10/10; now the last row lands on 10/08. Same date math feeds the PDF.
- Docs: `docs/features.md` (wizard steps, bingo step, summary-cards, schedule table).
### Bingo summary: per-tier plan BDT in the diamond cards (Aug 2026)
- The 3 bingo diamond boxes (lucky 30–40 / realistic / worst) each now show the **BDT the plan spends for that tier** on a second line (`৳X–৳Y per plan`), read off the one day-by-day schedule — not a per-box dia→money conversion.
- `lib/planOrchestrator.js` (`buildBingoPlan`, all bingo) — new `winCondition.bdtCost = { lucky:[..], realistic, worst }`: a prefix sum of the actual purchases (`packsByDay` + a new `passReceipts` list captured where the "Buy N× weekly pass" notes are written; pass days before `startDay` pinned to `startDay`) over the days up to when each draw tier is reached. `worst` always equals `recharge.totalBdt` (the full-event money is still computed once in the recharge plan); tiers covered by owned diamonds alone read 0.
- `components/wizard/StepFour.jsx` — diamond cards gain a `sublabel` line; guarded so stale cached plans (no `bdtCost`) render without it.
- `lib/exporter.js` — bingo PDF table gains a "Plan Cost (BDT)" column (`Tk …` ASCII-safe).
- Docs: `docs/features.md` (bingo summary), `docs/architecture.md` (plan shape + bingo section).
### `status: "early"` manual plan unlock (Aug 2026)
- `lib/eventHelpers.js` — `isEarlyPlanable()` now also returns true when `event.status === "early"`: a data-driven override that opens a coming-soon card for planning immediately, even more than 7 days out or with no `start_date` at all. `deriveStatus` untouched (`"early"` is a plan-availability flag, not a lifecycle state); `"ended"` kill-switch + real start-date logic still win.
- `components/ui/EventCard.jsx` — "Plan early" cards guard their labels when `start_date` is missing ("Coming soon" instead of "Invalid Date" / "Starts in null days") — required because a manually-early event may not have a date yet.
- `data/events.json` — `aspirants_2026` flipped `"coming soon"` → `"early"` (home-card unlocks ~17 days before its Sep 16 start; revert to `"coming soon"` to hide it again).
- Docs: `docs/events.md` (status field row + §1c), `docs/features.md` (card status bullets).

### "Game-plan ledger" redesign fix-up (Aug 2026): mangled quotes, CSS-only deck carousel, self-hosted fonts
- **Problem 1 (mangled quotes)**: an edit tool escaped `'` → `''` across the redesign — `app/globals.css` grain SVG data URI had `xmlns=''http://…` (invalid XML → texture silently never rendered), plus doubled quotes in comments of `tailwind.config.js`, `app/error.js`, `app/global-error.js`, `app/help/page.js`, `ScheduleTable.jsx`. All fixed; ~19 touched files also gained missing EOF newlines.
- **Problem 2 (`EventCarousel.jsx` stacked deck)**: JS `isMobile` state meant phones rendered flat on first paint then jumped when transforms applied post-mount; desktop lost ALL card spacing (old `gap-8` removed); non-active cards were `aria-hidden` while remaining focusable links. Fix: deck transforms are now pure CSS — full literal `max-md:[transform:translateX(±92px)_scale(...)] max-md:opacity-* max-md:z-*` classes per distance (Tailwind can't see dynamically-assembled class names), active card `z-50`; desktop renders a spaced row via `md:gap-8`; `aria-hidden` dropped; no media-query JS left. Scroll-snap + dots logic unchanged. `EventCarousel.jsx.bak` deleted.
- **Problem 3 (build hard-fail)**: redesign swapped Rajdhani/Inter for Fraunces + IBM Plex Mono via `next/font/google` — this network can't reach `fonts.googleapis.com` (ETIMEDOUT) and Next has no font cache, so every local `next build` died fetching fonts (deploys from CI would have worked). Fix: all three fonts **self-hosted** in `app/fonts/` (Fraunces variable `[SOFT,WONK,opsz,wght]`, Inter variable `[opsz,wght]`, IBM Plex Mono 400/500/600 static TTFs + OFL license files, downloaded from google/fonts GitHub since only fonts.googleapis.com was blocked) and loaded via `next/font/local` with the same `--font-*` CSS variables — zero component changes.
- Palette drift fixed: `docs/features.md` hexes synced to real config values (#59513F/#6E654F/#9E3E24/#4E6B38/#395671); `global-error.js` hardcoded colors updated to match (it must stay hardcoded — layout may not render there).
- Verified: `next lint` clean (3 pre-existing `<img>` warnings only), `next build` passes, built CSS contains the deck transforms + clean single-quoted SVG URI.
- Docs: `docs/features.md` (design-system section: palette hexes, self-hosted typography note, carousel line).

### Global pack reconciliation (themed crest): post-hoc regular-pack re-optimization
- **Problem**: every `addPacksToDay`/`optimizeRecharge` call is DP-optimal for its exact container, but the partition as a whole isn't — after the supply-task-first restructure, Street Fighter went 3580 → 3605 BDT (+25tk of small-pack overhead: B1 split the old exact-fit 706-dia chunk into 250+191, final-day residual grew to 597) while JJK dropped 2745 → 2596.
- `lib/planOrchestrator.js` — `buildThemedCrestPlan` gains **Step D (global pack reconciliation)** after the surprise-750 sizing: re-optimize the TOTAL regular-pack dia in one `optimizeRecharge` call — **all FP packs marked claimed** (FP purchases are decided by the earlier steps; without this the candidate re-introduced unclaimed fp_250/fp_150, a bug caught in the probe sweep) — enumerate re-assignments of the candidate packs onto the existing purchase days (phase-start days keep ≥ their current recharge credit, so task/surprise claims are preserved), and adopt only when **strictly cheaper** AND an oracle re-sim validates: no final-day shortfall, every `row.diaLeft ≥ 0`, `surpriseCumRecharge` not reduced. Weekly passes and FP packs never move. Accepted trade-off: reported "Recharge: X dia" may tick up 1–3 dia (knapsack overshoot; exact-dia candidates save ~nothing on JJK).
- **Report (216-scenario probe sweep, 2 events × dia/pass/fp/confidence/start grid)**: 0 violations (BDT non-increasing, draws + warnings identical); 27 cases cheaper (454tk total saved). JJK (0 dia, Gojo, all FP, day 1, realistic): 2596 → **2557** (regular 1596 → 1557tk; 2×r_257 + smalls → r_565+r_275+r_11+r_5; recharge 1954 → 1956 dia). SF (0 dia, Chun-Li + painted): 3605 → **3578** (regular 2405 → 2378tk; → 2×r_565+r_172+r_5; 2626 → 2627 dia) — both better than the old live prices (2745/3580). Mid-event starts, surplus-balance and FP-heavy cases unchanged; collector/bingo branches byte-identical.
- Docs: `docs/features.md` (Recommended Recharge), `docs/architecture.md` (Step D note).

### Themed-crest over-recharge fix: supply tasks first, informed pass search, surprise floor
- **Problem (user report, Aug 13)**: planning JJK with 1800 dia (more than the plan's ~1950 dia spend need — only ~200 of the initial balance was used) still recommended **5 weekly passes + 2× 257 packs** (1940 BDT / 1614 dia recharge), leaving 1614 dia unspent. Root cause: the pass search's trial sims ran WITHOUT the supply-task packs, so they missed the ~40 free draws those packs unlock (20 tokens × 2 phases) — the trial shortfall stayed large for every pass count, the loop never broke early, and `optimalPassCount` ran to the cap (5–6 passes). Same flaw on Street Fighter (2000 dia → 6 passes / 2140 BDT).
- `lib/planOrchestrator.js` — `buildThemedCrestPlan` restructured: (1) **Step B1** injects each phase's recharge-task minimum with the cheapest pack (`addPacksToDay(phase.start_day, threshold − existingRecharge, true)`) BEFORE any balance decision — those ~20 free tokens/phase are always worth completing; (2) the pass search now uses **informed trials** (`buildThemedCrestPlanWithPacks` with the B1 packs in `extraDiaByDay`/`rechargeDiaByDay`) so the shortfall reflects the real free-draw loadout — passes only cover the true residual gap; (3) a **surprise-window pass floor** forces at least `ceil(highestClaimableTier / recharge_task_value)` day-1 passes (3 on JJK/SF = 300 recharge → 50 & 250 tiers) whenever the window is reachable (`effectivePassStart` within `active_days`, not `passesInBalance`) — surprise tiers are claimed even in surplus-balance cases (user preference: passes stay the cheapest dia-per-BDT). Dead initial plain sim removed; collector/bingo branches untouched.
- **Report (JJK, 1800 dia, day 1, realistic)**: 5 pass + 2×257 (1940 BDT) → **3 pass + 2×257 (1540 BDT)** — exactly the user's suggested plan; both surprise tiers claimed, 120 draws, no warnings. 1000 dia → same 1540. 0 dia → 5 pass + 2×257 + small packs (2503 BDT, was 2745). Mid-event start (day ≥ 4, window gone) → **2×257 (940 BDT)**. **Street Fighter**: 2000 dia → 6 pass (2140) → **3 pass + 2×257 (1540)**; 4000 dia → 2×257 (940) → 3 pass + 2×257 (1540) per the user's surplus-choice. Owned-passes cases unchanged in spirit (in-balance → 2×257 only; dia-poor → passes for the real gap).
- Docs: `docs/features.md` (Recommended Recharge), `docs/architecture.md` (order-of-operations note).

### Surprise-window pass recharge credit + honest surprise ladder (themed crest)
- **Problem (user report, Aug 6)**: planning JJK with 2387 dia + 3 running passes showed no surprise-task claims even though the plan buys a weekly pass on Day 1. In-game a pass purchase = `recharge_task_value` (100) dia recharge on purchase day → the 50-dia surprise tier's free draw is legitimately earned. The sim only credited that value for user-owned passes (`passRechargeDay` path); orchestrator-added passes (`extraPasses`) were never injected into `rechargeDiaByDay`, so the surprise window saw 0 recharge. The surprise ladder ALSO misled: `surpriseTaskProgress(event, recharge.totalDia)` used whole-event recharge → reported tiers "crossed" while the schedule claimed nothing.
- `lib/planOrchestrator.js` — after `rechargeDiaByDay` is declared, credit `extraPasses × weekly_pass.recharge_task_value` (100) on `firstPassBuyDay` (guarded to `[1, duration_days]`). Bonus: a pass bought on a supply-window start day now also counts toward that window's recharge tasks (Step B's `existingRecharge` shrinks the required pack) — matches in-game.
- `lib/idealSchedule.themedCrest.js` — sim returns `surpriseCumRecharge`/`surpriseClaimed`; `buildThemedCrestPlanWithPacks` threads them through.
- `lib/planOrchestrator.js` — `surpriseLadder` now uses `sim.surpriseCumRecharge` (window-claimable) instead of whole-event `recharge.totalDia`.
- **Report (2387 dia, 3 passes/18d left, JJK)**: Day 1 gains "Claim 1 token (surprise recharge 50 dia) → 1 free draw"; spend 2200 → **2150** (−50); final push 12 → 11 draws; recharge unchanged (734 dia / 1,140 BDT); ladder honestly lists only the 50 tier. **0-dia JJK reference**: day-1 4× passes → 400 recharge → 50 & 250 tiers both claimed (2 free draws), spend −100. **Street Fighter**: unchanged (passes bought at startDay ≈ day 35, outside the 3-day window); ladder now `[]` instead of falsely-crossed tiers.
- Docs: `docs/features.md` (themed-crest row), `docs/architecture.md` (simulator + surprise-task sections).

### Themed-crest spend-task clears: discounted 10x on premium-supply close days
- **Problem**: the simulator bought full-price singles (`ceil(gap/50)`) on a premium-supply window's last day to clear spend tasks, and left ALL bulk 10x to the event's final day. Since 10x carries a permanent 10% discount (45/draw vs 50/draw singles), the final-day residual singles were the most expensive draws in the plan.
- `lib/idealSchedule.themedCrest.js` — `simulateThemedCrestFixedShape` gains optional `targetDraws` (passed by `buildThemedCrestPlanWithPacks`; all orchestrator call sites inherit). New `tenxCost` = `draw_cost_10x × (1 − tenx_diamond_only_pct_off/100)`. At a window-close day with unsatisfied spend tasks, if remaining demand ≥ 10 (`target − totalDraws − future daily 1x`), the day isn't the event's last, and one 10x clears the highest threshold → buy **1×10x** ("1x 10x draw (clears spend tasks)") instead of the singles; otherwise the old singles fallback runs.
- **Report (JJK, 0 dia, 121 draws)**: 4050 → **4000 dia** (−50); day 12 & 19 spend 475 with 10x+token claims instead of 175 with 3 singles; final push 6×10x+6 singles → **5×10x+2 singles**. Street Fighter (121): same close-day 10x pattern. Recharge lands earlier (per-phase injection already handles it); total draws unchanged.
- `EventCard.jsx` — early coming-soon cards no longer get a gold card border (normal white/40 → white/50 hover); the "Plan early" pill is restyled like the other tag badges (solid gold + dark-gold 2px border).
- Docs: `docs/architecture.md` (themed-crest simulator line).

### Trust notice (one-time modal) + early coming-soon plans + live day/hour countdown
- **First-visit notice** (`components/ui/FirstVisitNotice.jsx`, mounted in `app/layout.js`): one-time modal (per browser, localStorage `skinroute.notice.v1`) clarifying SkinRoute is a **free guide** that does NOT sell skins/currency/accounts, will never ask for credentials or payment, and warning about phishing copies — only `skinroute.events-mlbb.workers.dev` + `skin-route.vercel.app` are official. "Got it"/X persists dismissal; refresh/navigation never re-shows. Versioned key for future copy updates.
- **Early coming-soon plans**: `lib/eventHelpers.js` gains `EARLY_PLAN_DAYS = 7`, `eventStartDate()`, `daysUntilStart()`, `isEarlyPlanable()` — events unlock for planning 7 days before `start_date` (card-level only; direct URL always allowed). `EventCard.jsx`: within-window cards become clickable links with gold ring + "Plan early" pill, "Coming {Month Day}" + "Starts in N days" ("Starting today" at 0); far-future cards stay dimmed/locked. `WizardShell.jsx` header shows "Starts {Month Day}" (gold) for pre-start events. `StepFour.jsx` shows a pre-start notice ("plan starts from Day 1, updates automatically once live") — the Start Today toggle already auto-hides (todayEventDay clamps to 1), so **no planner changes were needed**. ⚠️ Data dependency: coming-soon entries need full draw data (`shop_items`, `prize_pool`, costs, milestones, supply) to actually plan — `exorcists_2026` currently has banner-only data (see `docs/events.md` §1c).
- **Live countdown on running events**: `timeLeft(endDateStr)` → `{days, hours}` at the 2PM BDT close anchor, `timeLeftLabel()` → in-game style "3d 5h left" (hours-only below a day). EventCard's status line uses it for active events (fallback `urgencyLabel` when null); `daysLeft`/`deriveStatus` untouched.
- Docs updated: `docs/features.md` (global notice, card statuses, Step 4 pre-start note), `docs/architecture.md` (module map), `docs/events.md` (§1c early-plan window).

### Step 1 pass explainer + pass/diamond consistency warning
- Bug reporter had "25 dia + 5 weekly passes (35 days remaining)" — impossible-looking because owning 5 passes already paid 5×80 = 400 instant dia into their wallet. The wizard never explained pass payouts, so users mis-enter Diamonds vs owned passes.
- `components/wizard/StepOne.jsx` — when `weeklyPasses > 0`: pass explainer under the stepper (each pass = 80 dia instantly + 20 dia/day for 7 days, queued sequentially, max 10; days remaining = total across all passes, per in-game Passes screen) + non-blocking `accent-coral` warning when a Diamonds value is entered below `passes × 80` — **or left blank** (blank is treated as 0, matching the auto-set-to-0 on Next): "N passes already gave you N×80 dia (80 × N) instantly — include them in your Diamonds."
- Non-blocking by design: both readings are valid (user spent those 400 dia, or is planning a future purchase — the plan then adds 80/pass on the purchase day itself).
- Docs updated: `docs/features.md` (Step 1).

### Collector first-post-window day fix + summary "Diamonds Needed" semantics
- **Bug (user report, Aug 3)**: collector plan showed "No draw (insufficient balance)" on the day right after the premium-supply window closed even with plenty of dia/CoA (repro: 336 dia + 1065 CoA → D8 had 301 dia/1125 CoA left). Cause: `simulateCollectorFixedShape` set `transitionedToday = true` in the `day > windowEnd` branch, so the post-window draw block was skipped that day and an empty note list defaulted to the misleading "insufficient balance" line. The day also lost its draw (Starlight shifted a day later). Fix: drop `transitionedToday` there — the first post-window day now runs the normal CoA `1x daily` draw (+ Starlight as soon as affordable).
- **Summary card** ("Diamonds Needed", themed crest): was `totalDiamondsForPlan` = starting dia + recharge dia, which overstates when the user already holds a large balance (test: 1000 dia input, start Day 1 → card 2,834 vs schedule total 1,775; pass overshoot made recharge huge). Now shows `daySchedule.totals.dia` = the **total dia the plan actually spends** — always equals the schedule's "Total from Day X" footer. Applies in `StepFour.jsx` and PDF `exporter.js` (collector already used totals.dia; bingo keeps `totalDiamondsForPlan`).
- **API robustness**: StepFour's `/api/plan` fetch now checks `res.ok` + `Content-Type: application/json` before `res.json()` and maps parse failures to friendly copy — a Cloudflare/edge HTML error page can no longer surface as raw `Unexpected token '<' ... is not valid JSON`. Error screen gains a "Try again" button (`retryKey` re-runs the effect). `ReportModal` gets the same content-type guard around the Web3Forms response.
- Docs updated: `docs/features.md` (Step 4 error/retry + summary-card semantics).

### Site-down message: branded error pages (`error.js` + `global-error.js`)
- `app/error.js` — client error boundary for `/`, `/help`, `/plan/*`: page render/SSR failures now show a branded "flood of players" message with a **Try again** button (`reset()`) and a link to the Vercel mirror (`skin-route.vercel.app`) instead of Next's default error page. Dev-only echo of `error.message`.
- `app/global-error.js` — root-layout boundary for the blank-screen worst case; supplies its own `<html>/<body>` (layout font CSS vars not guaranteed, so no `font-heading`/`font-body` there), same copy/actions.
- **Scope limit**: on `*.workers.dev` free, a *fully* over-quota Worker (edge 429/1027/1102 before any code runs) still shows Cloudflare's default error page — not custom in the app; full-down custom pages need a custom domain later. `/api/plan` keeps its own client-side error states (unchanged).
- Docs: `docs/features.md` (error page), updated deployment docs reference this too.

### Viral-day hardening: bots + capacity (free Workers plan)
- **Symptom**: FB group post (71k members, 130+ shares) → 138k requests/24h vs ~385 the prior day; brief outages + 664 worker errors during peaks. Diagnosis: mostly **legit viral traffic**, not an attack — free Workers caps at 100k requests/day, so the day blew the budget (throttle/error windows). Old `skinroute.abdullahaljim2.workers.dev` URL in docs was WRONG (NXDOMAIN, caused a false "site down" scare) — real hostname is `skinroute.events-mlbb.workers.dev` (account subdomain `events-mlbb`)
- `next.config.mjs` — HTML CDN cache on `/`, `/help`, `/plan/*`: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` (repeat visitors get an edge copy; cached response carries its own baked CSP nonce — safe, no POST forms on those pages)
- `app/api/plan/route.js` — in-worker per-IP rate limit (sliding window 30 req/60s, keyed by `cf-connecting-ip` → 429 + Retry-After; size-capped Map). Edge rate limiting isn't viable on free (10k req/month budget); buildPlan is the only compute-heavy unauthenticated route
- `public/robots.txt` — disallow AI crawlers (GPTBot, ClaudeBot, CCBot, Amazonbot, Bytespider, PerplexityBot, meta-externalagent, Google-Extended, SEO bots, …); search engines + FB preview crawler allowed
- `middleware.js` — `BLOCKED_BOT_UA` list returns 403 before render (same UA families as robots.txt; cheap substring scan, short list)
- `public/_headers` — `/assets/*` now `Cache-Control: public,max-age=604800` (non-hashed assets; 7 days so banner swaps propagate) alongside the immutable `/_next/static` rule
- Dashboard to-do (free): Bot Fight Mode + Browser Integrity Check ON, usage alert before the 100k/day cap
- Docs updated: `docs/development.md` (correct URL, free-plan 100k/day cap note, new "Traffic management" section, API rate limit)


### JJK Step 4 "reading 'notes'" fix: empty-window crash + sticky error cache
- **Symptom**: planning a skin showed "Can't calculate a plan yet — Cannot read properties of undefined (reading 'notes')" with **no `/api/plan` network request** (Network tab empty)
- **Root cause 1 (crash)**: all three simulators did unguarded `finalRow.notes.push(...)` where `finalRow = sim.rows[sim.rows.length - 1]`; when `startDay > duration_days` (event window already over — stale/broken `start_date` in a long-running dev server's compiled JSON) the day loop never runs → empty rows → `finalRow` undefined → the exact error above
- **Root cause 2 (sticky)**: `StepFour.jsx` module-level `planCache` cached **error responses** too (`planCache.set(cacheKey, result)` unconditionally), so a transient server error re-rendered forever with no refetch — looked target-specific (Gojo) purely because that cache key was poisoned first
- **Fix**:
  - `lib/idealSchedule.themedCrest.js` / `lib/idealSchedule.collector.js` / `lib/idealSchedule.aspirants.js` — every `finalRow.notes/draws/diaSpent` mutation block now guarded with `finalRow &&` (empty rows → empty schedule + zero shortfall, no crash; all math identical when rows exist)
  - `lib/planOrchestrator.js` — `buildPlan` throws a clear error (`Event window has already ended — no planable days left`) when `startDay > duration_days`; note-injection spots (`day1Row`, `lastRow`, themed-crest `row`) guarded (`if (row)`) — bingo branch already had `if (!row) continue`
  - `components/wizard/StepFour.jsx` — `planCache.set` only when `result.data` exists, so failed responses never stick across visits
- **User-side remedy**: restart the dev server (it predates the `events.json` edit — stale compiled JSON) + hard-refresh the browser to clear the in-memory cached error
- Verified: all 4 JJK skins → identical plans (121 draws, 30/29 rows) to pre-fix; 300-iteration fuzz 0 fails; edge case returns the clear error; `next lint` clean

### Event card progress bar: linear time progress (all events)
- `lib/eventHelpers.js` — `urgencyStyle(days)` (stepped 20/40/70/92% fills keyed to days-left buckets, so any event ≤14 days from ending looked ~halfway full and identical to a just-started one) replaced by:
  - `eventProgress(event)` — true linear fill: elapsed / total window (08:00 UTC anchors, closes 2PM BDT day after `end_date`), clamped 0–100, `null` when dates missing (coming-soon cards keep the gray 100% look)
  - `progressColor(pct)` — smooth green→red `hsl` sweep keyed to elapsed time (inline style, no Tailwind dynamic classes)
  - `urgencyLabel(days)` — countdown text only ("N days left" / "Coming soon")
- `components/ui/EventCard.jsx` — bar width = `progress ?? 100`, `backgroundColor = progressColor(progress)`, label from `urgencyLabel`
- Docs updated: `docs/features.md` (card status strip), `docs/architecture.md` (module map row)

### Collector event: recurring monthly dates (auto-rollover)
- `data/events.json` — collector (`exquisite_collection`) now `"recurring": { "pattern": "monthly" }`, no static dates; `lib/eventHelpers.js` `resolveEventDates()` computes the window from the current in-game month at the 2PM BDT (08:00 UTC) boundary; `lib/eventRepo.js` (`getEvents`/`getEvent`) re-resolves **per call** so long-lived Workers isolates never serve a stale month; 3 import sites swapped (`app/page.js`, `app/api/plan/route.js`, `app/plan/[eventId]/page.js`)
- Explicit `start_date`/`end_date` in JSON always override the pattern (escape hatch for deviant months); StepFour planCache key now includes the resolved `start_date` (no cross-month cached plans)
- Monthly manual work is now **content only**: `shop_items` targets + `prize_pool` (quantities/rules constant) — see `docs/events.md` §1b

### Cloudflare deployment (primary host, free plan)
- `@opennextjs/cloudflare` adapter + `wrangler.jsonc` + `open-next.config.ts` + `build:cf` script — site live at `https://skinroute.events-mlbb.workers.dev/`; Vercel (`skin-route.vercel.app`) kept as parallel fallback (both auto-deploy on push)
- `next.config.mjs` — `images: { unoptimized: true }` (Cloudflare's optimizer is paid; assets served raw)
- `public/_headers` — immutable caching for `/_next/static/*` (ignored by Vercel)
- **Traps hit during setup** (see `docs/development.md` → Cloudflare section): wrangler needs Workers-style `main` + `assets` (Pages-style `pages_build_output_dir` alone fails with "Missing entry-point"); the `WORKER_SELF_REFERENCE` service binding must reference the exact project name `skinroute` (CI overrides config `name` but not the binding → `[10143]`)
- Verified on Workers runtime: CSP nonce middleware works unmodified (edge-only APIs), all routes/banners/API parity with Vercel; worker ~1.3 MiB gzip (3 MiB free limit)

### Street Fighter banner case fix (`public/assets/events/street_fighter_2026/`)
- `banner.JPEG` → `banner.jpeg` (via two-step `git mv` — Windows FS is case-insensitive so direct rename failed) — `events.json` referenced lowercase, Vercel/Linux is case-sensitive → `/_next/image` 400, banner hidden on every deployed profile
- `docs/events.md` — asset section now warns: filenames must match `events.json` byte-for-byte (case-sensitive on Vercel); use `git mv` for case-only renames

### CSP nonce middleware (`middleware.js`) — production black screen fix
- **Symptom**: deployed site (Vercel) showed black screen; landing page flashed for a split second on refresh. Console: `Executing inline script violates ... script-src 'self'` + `Uncaught Error: Connection closed`
- **Cause**: `next.config.mjs` production CSP had `script-src 'self'` with no nonce/hash — Next.js renders its RSC bootstrap as inline scripts, so hydration never ran and the client error boundary blanked the page. Dev was unaffected (headers production-gated)
- **Fix**: new `middleware.js` — per-request nonce (`crypto.randomUUID().replaceAll("-", "")`, edge-safe, no Buffer), CSP set on **request + response headers** (Next extracts the nonce from the request CSP header at render time — `getScriptNonceFromHeader`; the `x-nonce` header is NOT read by Next 15.5); production-only (dev passes through); matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `assets/`
- **Static pages can't carry nonces** — prerenders are baked at build time with no request, so `/` and `/help` now have `export const dynamic = "force-dynamic"` (bonus: event statuses no longer go stale between deploys); `/plan/[eventId]` was already dynamic; `/_not-found` stays static (non-interactive error page)
- `next.config.mjs` — CSP removed from `securityHeaders` (two CSP headers = intersection; old one would still block); X-Frame-Options/nosniff/HSTS/Referrer-Policy/Permissions-Policy stay
- Docs updated: `docs/development.md` security section
- **Verify on Vercel after deploy**: home page stays visible, no CSP violations in console, CSP header present with `nonce-…`, rest of headers intact, wizard + PDF + report modal

### Step 4 plan loading: cache + stale-while-revalidate (`StepFour.jsx`)
- Previously every toggle of "Start Today vs Day 1" (and every return to Step 4 after navigating steps — steps unmount) re-ran the effect with `setPlanLoading(true)` → full-screen "Calculating your plan..." flash each time
- Now: module-level `planCache` Map keyed by `JSON.stringify([event.id, resources, target, ownedItems, activeStartDay])`; lazy `useState` initializers read it → already-computed day renders instantly, zero refetch; cache-miss toggles keep the previous plan visible ("Updating…" spinner next to the toggle) while refetching; refresh failure keeps the last plan + inline "Couldn't refresh" note (error screen only when no plan exists yet)
- `hasPlanRef` tracks "a plan has been shown" (set on successful fetch) so full-screen loading only ever shows before the first plan
- `ScheduleTable` now gets `startDay={p.startDay ?? activeStartDay}` so the visible table matches the plan shown during a refresh

### API plan route + async Step Four
- `app/api/plan/route.js` — new server-side `POST /api/plan`: validates body (`confidence` whitelist `optimistic|realistic|worst`, numeric `overrideStartDay` — both 400 otherwise, unknown `eventId` 400), calls `buildPlan`, returns `{data, error}` (buildPlan runtime errors → 200 with error field, matching the client contract)
- `StepFour.jsx` — switched from direct `buildPlan` call to `fetch("/api/plan")` in `useEffect` (with `cancelled` flag, deps `[event.id, resources, target, ownedItems, activeStartDay]`); new `planLoading` state + "Calculating your plan..." loading screen; plan error state unchanged
- **Security effect**: planning engine (simulators/EV/optimizer) no longer ships in the client bundle via StepFour — but `lib/reportBug.js` still calls `buildPlan` client-side for the report technical block, so the engine is only partially hidden. CSP already allowed it (`connect-src 'self'`), no `next.config.mjs` change
- **Stray `+` fix**: `StepFour.jsx:67-68` had pasted diff markers (`+` chars rendering as JSX text) — removed
- `SupportButton.js:101` — mobile offset `bottom-8` → `bottom-12` (cosmetic)
- Docs updated: `docs/architecture.md` (invocation note + module map row), `docs/features.md` (Step 4 loading state), `docs/development.md` (security posture + project structure + stale SupportButton TODO line removed)
- `lib/test_write.txt` deleted (stray "hello" debug artifact; deletion still uncommitted)

### Collector (`planOrchestrator.js`)
- **Starlight for expired window**: `starlightExtra` now triggers when `startDay > windowEnd`, using `Math.max(0, 300 - startingDia)` — no longer gated by `hasPasses`
- **Dump all packs on day 1 when totalSpan ≤ 2**: Sequential two-step injection (Starlight first, then remaining shortfall) both on `startDay`, no final-day split
- `day1PackDia` accumulates correctly across both steps

### Starlight buying timing (`idealSchedule.collector.js`)
- No changes needed — post-phase block already checks Starlight daily when `diamondPhaseActive = false`

### Bingo/StepFour labels
- `StepFour.jsx:128` — header shows "The Aspirants" for aspirants, "Bingo — first line completion" for regular bingo
- `exporter.js:475` — same conditional in PDF header
- `StepTwo.jsx:34` — description: "First completed box wins..." for aspirants, "First completed bingo line wins..." for regular
- `StepTwo.jsx:99` — card label: "Box completion" for aspirants, "Line completion" for regular

### Fake target removed (`planOrchestrator.js:994`)
- `target: null` replaces `{ skin: { name: "Bingo", hero: "" } }` for bingo plans
- `exporter.js:228` — guarded with `hasTarget && !isBingo` to prevent "Target: Bingo ()"

### Step display fix (`WizardShell.jsx`)
- Added `displayStep` and `totalSteps` variables — bingo shows "Step X of 3" (steps 1,2,3), non-bingo shows "Step X of 4"
- `effectiveStep` still maps to correct component index (4 for StepFour)

### Surprise tasks now count as free draws (`idealSchedule.themedCrest.js`)
- Sim claims surprise-window tokens as real draws: cumulative recharge (packs + pass purchase recharge value, `recharge_task_value`) within the first `active_days` days, `claimKeys` adds row.draws/totalDraws — affects milestones + final push cost
- Tiers with 0 tokens (750) are skipped; claims only fire while recharge lands inside the window
- `planOrchestrator.js` — removed the informational-only day-1 surprise note block (previously said "→ X free draw" without drawing)

### Bug report feature — IMPLEMENTED
- `lib/reportBug.js` — `buildReport(context)` returns `{ description, technical }`; technical includes event info, all wizard inputs, plan summary (draws/recharge/packs) + full day schedule; builds the plan itself (bingo works without target, errors captured instead of thrown)
- `components/ui/ReportModal.jsx` — user textarea + auto technical block, POSTs to Web3Forms (`NEXT_PUBLIC_WEB3FORMS_KEY`), idle/sending/success/error states, works without wizard context (home/help pages)
- `components/layout/Navbar.jsx` — now client component: hamburger menu on mobile (Home/Help/Report Bug), Report Bug button on desktop (sm+), modal rendered outside `<header>` to avoid backdrop-filter containing-block issues
- `lib/wizardContext.js` — added `useWizardOptional()` (returns null instead of throwing) so Navbar works on non-wizard pages
- `app/plan/[eventId]/page.js` — `<Navbar />` moved inside `<WizardProvider>` so the report can include plan context
- `.env.local` — created with empty `NEXT_PUBLIC_WEB3FORMS_KEY` placeholder (git-ignored); submit disabled until key added
- `buildReport` also returns `fields` (6 quick-scan summary cells: Event, Plan Start Day, Target, Draws Needed, Recharge BDT, Plan Error) — `ReportModal` spreads them into the Web3Forms POST body; the full readable detail (all inputs, packs, day schedule) stays in the message's technical block
- Report's `Plan Start Day` respects the StepFour "Start Today vs Day 1" toggle: `startFromToday` state lives in the wizard context (lifted from StepFour local state); `buildReport` defaults it to `true` outside the wizard; true current day still recorded as "Event day at report" inside the technical block

### Mobile nav dividers (`Navbar.jsx`)
- Hamburger menu items (Home/Help/Report a Bug) each get a full-width divider: `-mx-4 px-4 border-b border-white/10` (edge-to-edge line under each item, including the last)
- Container padding changed `py-2` → `pt-2 pb-0` so the last divider sits flush with the dropdown bottom

### Release hardening
- `xlsx` removed from dependencies (unused; known critical CVEs)
- `next.config.mjs` — production-gated security headers + CSP (Next 15 / Google Fonts / Web3Forms compatible)
- `ReportModal.jsx` — `botcheck: ""` honeypot field in the Web3Forms POST (bots rejected server-side)
- `test_planner.mjs` removed from repo root
- `docs/` folder created — features/architecture/events/development (see index `docs/README.md`)

### 2PM BDT day-reset alignment (`eventHelpers.js`, `planOrchestrator.js`)
- MLBB resets at 2PM BDT (08:00 UTC). Event cards (`daysLeft`/`deriveStatus`) already used it; `todayEventDay` was midnight-UTC based → schedule ran 1 day ahead between 06:00–14:00 BDT
- `eventHelpers.js` — added `eventDayNow(event)` (canonical current in-game day, 08:00 UTC boundary)
- `planOrchestrator.js` — `todayEventDay` delegates to `eventDayNow` (StepFour, passFirstBuyDay, reportBug all inherit)
- `ScheduleTable.jsx` + `exporter.js` — `dayToDate` now UTC-anchored (Date.UTC + getUTC*) so date labels match in-game days in any timezone

## Next Steps (planned)
- Final QA before launch: one test bug report with the new 6-field format, verify deploy env var on Vercel (`NEXT_PUBLIC_WEB3FORMS_KEY` — the "Import .env" flow), confirm SupportButton donation numbers in production

## Relevant Files
- `lib/planOrchestrator.js` — collector/bingo/themed crest planners
- `lib/idealSchedule.collector.js` — collector simulator
- `lib/exporter.js` — PDF generation
- `components/wizard/StepFour.jsx` — results page
- `components/wizard/StepTwo.jsx` — target selection
- `components/wizard/WizardShell.jsx` — step layout + header
- `components/layout/Navbar.jsx` — hamburger + report bug
- `lib/reportBug.js` — report builder (description/technical/6 summary fields)
- `components/ui/ReportModal.jsx` — report modal (Web3Forms POST, botcheck honeypot)
- `app/api/plan/route.js` — server-side POST /api/plan (buildPlan, confidence whitelist)
- `components/ui/SupportButton.js` — buy-me-a-coffee (donation numbers)
- `data/events.json` — event data (see `docs/events.md` to add a new event)
- `data/packs.json` — pack/pass data
- `next.config.mjs` — security headers (production-gated); CSP now lives in `middleware.js`
- `middleware.js` — per-request CSP nonce (production; fixes inline-script blocking)
- `docs/` — features/architecture/events/development docs
