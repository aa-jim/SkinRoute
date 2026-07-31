# Documentation Project: docs/ Folder + Release Cleanup

User request: navigate whole repo (done — two explore agents), document inner workings, the future-events mechanism / baseline for adding an event, and ALL features — everything in a new `docs/` folder.

## Phase 1 — docs/ folder (5 files)

```
docs/
├── README.md         — index + what SkinRoute is
├── features.md       — all user-facing features (wizard, event types, schedule table, PDF, bug reports)
├── architecture.md   — inner workings of the planning engine
├── events.md         — baseline for adding a new event (schema, packs, assets, checklist)
└── development.md    — setup, scripts, env, deploy (Vercel), test harness, known issues
```

### docs/features.md (user-facing)
- Home: event cards (status via deriveStatus, days-left urgency bar, gradient/banner), carousel + mobile dots
- Wizard flow: Step 1 Resources (diamonds, CoA — collector only, weekly passes 0–10 stepper, days remaining validation, first-purchase bonus chips) → Step 2 Target (discounts strikethrough, Painted Skin/Outfit 1 toggle, bingo view-only cards with pity/box labels) → Step 3 Owned prize pool (skin grid + "Other Rewards" counters, skipped for bingo) → Step 4 Results
- Step 4: Start Today (Day N) vs Day 1 toggle, optimistic/realistic/worst draws, warnings, bingo panel (lucky/realistic/worst + pity note), summary cards (BDT/Dia/CoA/Draws/Target), PackRecommendation table (pack naming, BDT ৳), ScheduleTable (desktop table vs mobile day cards, icon legend, final/supply/gap tags, expandable rows), Download PDF, Adjust plan
- Bingo vs non-bingo differences (3 vs 4 steps, ProgressBar renumbering)
- Bug report modal (Web3Forms, 6 summary fields + technical block, honeypot)
- Buy-me-a-coffee SupportButton (note: phone numbers TODO before launch)
- Help page, Navbar (desktop buttons, mobile hamburger w/ dividers)

### docs/architecture.md (inner workings)
- Pipeline: inputs (event, resources, target, ownedItems, confidence, overrideStartDay) → buildPlan (planOrchestrator.js:38) → branch by event.type (bingo/collector/else themed-crest) → simulators → knapsack → normalized plan object
- Module map with roles: planOrchestrator (entry, pass search, pack injection), calculator (EV formulas 1/2/3, multipliers 0.95/0.85, bingo win condition BINGO_DRAWS_PER_LINE {30–40/50/60}), optimizer (3D knapsack C++ port, unbounded regular/pass, 0-1 FP), scheduler (LEGACY — only 4 live: premiumSupplyWindowPlan, dailyDrawSchedule, milestoneTokenSchedule, surpriseTaskProgress), idealSchedule.collector/themedCrest/aspirants (day sims; aspirants ESM, others CJS interop), coaSufficiency (NOT called by buildPlan), eventHelpers (eventDayNow/daysLeft/deriveStatus/urgencyStyle — 08:00 UTC = 2PM BDT), exporter (jspdf, bingo vs standard PDF), reportBug, wizardContext
- Full plan object shape per type (drawsNeeded/drawsNeededAll, recharge{packsUsed,totalBdt,totalDia,completionDay,impossible}, daySchedule rows+totals, winCondition, target:null for bingo, supplyWindows, milestones, warnings, surpriseLadder, startDay)
- Key mechanisms: EV math + milestone subtraction rule, premium supply phase timing, surprise tasks → free draws (sim claims tokens; orchestrator 750 sizing only when incidentally reached), Starlight timing (300 dia rule, starlightExtra), pass search loop + firstPassBuyDay formula (today - (passes*7 - daysRemaining)), per-phase pack injection + usedFpClaimed tracking, collector day-1 + final-day injection, aspirants specifics (pass distribution across phase starts, daily_1x final pricing, 257 minimum bump, day-20 10x case), bingo worst-case draw target + excess-draw cap
- Data field usage: READ vs informational/unused (draw_currency, has_pity_first_10, bingo.pool_size, shop limit/is_skin, coa_packs, dia_bonus/dia_extra, etc.)
- Known quirks: string placeholders ("PLACEHOLDER_NEEDS_CONFIRMATION") and where they throw vs get guarded; CJS/ESM interop; bingo has no daySchedule; coaSufficiency/scheduler legacy dead code

### docs/events.md (future-events baseline — the monthly workflow)
- Where data lives (data/events.json, data/packs.json, public/assets)
- Full events.json schema: every top-level field, type, required/optional, example values from live entries (collector: exquisite_collection; themed: jujutsu_kaisen_2026; bingo: aspirants_2026)
- Nested blocks: discount_draw_cost (daily_1x, first_time_10x, tenx_diamond_only_pct_off), milestones (reward_type token/crests/other — "other" ignored), premium_supply (phases, task types login/recharge_*/spend_*/starlight_activate, threshold_dia, tokens), shop_items (crest_cost vs base_crest_cost discount, outfit1_variant), prize_pool (skin_group drop_rate/dup_value/skin_ids, effect types crest_value/count, crest pool crest_values[]; drop rates MUST sum to 1.0), surprise_tasks (active_days, threshold→tokens; zero-token tiers skipped), bingo (type line_3x3, skins, guaranteed_pity_skin_id, shared_pool_event_id/sub_event_id null)
- packs.json: weekly_pass (dia_instant/dia_daily/days/recharge_task_value/coa_box_daily; sequential drip mechanics), first_purchase (fp_50..500: bdt/dia_base/total), regular (r_*: bdt/total)
- New event checklist (step-by-step): copy template → fill → assets (banner + target skins under /assets/events/{id}/) → status field ("active"/"coming soon"/"hidden" kill-switch) → validate JSON → drop rates sum → smoke-test buildPlan via node harness → lint
- Placeholder convention + what breaks (premiumSupplyWindowPlan/milestoneTokenSchedule throw on strings; bingo branch guards)
- Unused-but-required-for-UI fields (card_label, tier, image paths)

### docs/development.md
- Stack (Next 15 App Router, React 18, Tailwind 3.4, jspdf, lucide, framer-motion), scripts (dev/build/start/lint)
- Env: NEXT_PUBLIC_WEB3FORMS_KEY (public-safe), .env.local git-ignored, Web3Forms dashboard (delete submissions, 30-day retention)
- Project structure tree
- Test harness pattern: node --experimental-loader register.mjs (resolves @/ alias + JSON) + wrapper.mjs dynamic import via pathToFileURL — node ESM notes (extensionless imports fail)
- Lint status (only <img> warnings), build caveat (Google Fonts fetch fails offline — retry at deploy)
- Deploy: Vercel import from GitHub (aa-jim/SkinRoute), re-add env var in project settings, auto HTTPS
- Security posture: security headers/CSP (next.config.mjs), Web3Forms botcheck honeypot, no secrets committed

## Phase 2 — README.md
- Replace create-next-app boilerplate: 1-paragraph intro, feature bullets, links to docs/ (docs/README.md), quick start, deploy note

## Phase 3 — AGENTS.md updates (from earlier approved plan)
- Add: mobile nav dividers bullet, reportBug 6-cell fields + Plan Start Day toggle (partially there), docs/ pointer
- Fix stale: Next Steps, "to create" markers, Relevant Files (+ docs/)

## Phase 4 — Security + cleanup (previously approved, pending)
- Remove unused xlsx (CVE-2023-30533, zero imports — verified)
- next.config.mjs: production-gated security headers + CSP (Next 15 / Google Fonts / Web3Forms compatible)
- ReportModal: botcheck honeypot field
- Delete tracked test_planner.mjs
- Verify: lint, npm audit, JSON validity, node harness smoke test

## Verification
- node harness smoke test of buildPlan for all 3 event types (collector/themed/bingo)
- npx next lint (only pre-existing <img> warnings)
- npm audit after xlsx removal
- JSON.parse validity of data files

## Files touched
- docs/README.md, docs/features.md, docs/architecture.md, docs/events.md, docs/development.md (new)
- README.md (rewrite), AGENTS.md (edit)
- package.json/package-lock (xlsx removal), next.config.mjs (headers), components/ui/ReportModal.jsx (botcheck)
- test_planner.mjs (delete)
