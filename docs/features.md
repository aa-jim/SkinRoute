# Features

Everything a user can do in SkinRoute, page by page. Event-type differences (collector / themed crest / bingo) are called out where they matter.

## Home page (`/`)

- Hero + event carousel built from `data/events.json`.
- Events with `status: "hidden"` are filtered out, and anything whose date range has ended is excluded.
- Sorting: `coming_soon` events always come after `active` ones; within a status, by `start_date` ascending.
- **Event card**: banner image (falls back to hidden image if it fails to load), name, type badge, gradient + tinted text panel from the event's `banner_gradient` / `text_panel_color`, and a status strip:
  - `coming_soon` → dimmed card, not clickable, "Coming soon"
  - `active` → clickable, links to `/plan/{eventId}`, shows "N days left" with an urgency color bar (≤3 days orange, ≤7 lime, ≤14 green, else green), and "Ends on {Month Day}".
- Mobile dot indicators under the carousel (one per event, scrolls the card into view).
- Day statuses are computed with the 2 PM BDT reset boundary (08:00 UTC) — an event shown as ending on day X stays live until 2 PM BDT of day X+1.

## Plan wizard (`/plan/{eventId}`)

Wizard steps: non-bingo events have **4 steps** (Resources → Target → Prize Pool → Result); bingo events have **3** (Target step is view-only, Prize Pool is skipped, and the step bar renumbers).

Shared state lives in `WizardProvider` (`lib/wizardContext.js`): `resources`, `target`, `ownedItems`, `startFromToday`.

### Step 1 — Your current resources

- **Diamonds** (number).
- **Crystal of Aurora (CoA)** — collector events only.
- **Weekly Passes** — stepper, 0–10 ("Max 10").
- **Days remaining** — how many total days are left on your owned passes; must be ≤ `passes × 7`. Checked against the in-game Passes screen.
- **First-purchase bonuses** — chips for the four 2× diamond packs: "50 + 50", "150 + 150", "250 + 250", "500 + 500". Tap the ones already claimed; claimed chips turn gold.
- Validation: days remaining is required when passes > 0, and can't exceed `passes × 7`.

### Step 2 — Target skin

- **Non-bingo**: card per `shop_items` entry — image, name, hero, crest price. Discounted skins show the old price struck through (`base_crest_cost`) and the real price in gold (`crest_cost`). Corner ribbon shows the tier (`tier.toUpperCase()` or `event.card_label`).
- **Painted Skin (Outfit 1) toggle** — appears when the selected skin has an `outfit1_variant`: "Also get Painted Skin variant?" with a cost breakdown (skin / Painted Skin / Total). Extra `crest_cost` is added to the target.
- **Bingo**: cards are view-only (no selection). The pity skin (`event.bingo.guaranteed_pity_skin_id`) is labeled "Guaranteed in 10x"; others show "Line completion" (regular bingo) or "Box completion" (aspirants — first completed box wins). Aspirants-specific wording keys off `event.id === "aspirants_2026"`.
- "Next" is disabled until a target is selected (bingo always enabled).

### Step 3 — Prize pool owned (skipped for bingo)

- **Target-tier skins** — grid of `shop_items`; click to mark owned (green border + OWNED pill). The selected target is locked with a TARGET pill.
- **Other Rewards** — rows from `prize_pool` excluding `skin_group` / `crest` / `items` entries: name, "Dupe = {crest_value} crests", and a 0..count stepper for how many of each you already own (e.g. emotes, effects, borders).
- Owned items raise the expected crest value of future pulls, so they speed up reaching the target.

### Step 4 — Result

- **Start-day toggle** (only shown when today is past day 1): "Start Today (Day N)" vs "Start from Day 1". The plan is rebuilt from the chosen day; the schedule table and PDF only show from that day.
- **Draws overview** (non-bingo): Optimistic / Realistic / Worst-case draws.
- **Warnings** — coral rows with an alert icon when the plan is tight or the math had to bend somewhere.
- **Bingo summary panel**: lucky draw range, realistic, worst-case, plus BDT / diamonds for each scenario, and a "Guaranteed: {skin} on first 10x draw if unowned" note when applicable. Header says "The Aspirants" for aspirants, "Bingo — first line completion" otherwise.
- **Summary cards**: Total BDT (৳), Diamonds Needed (collector also gets a compact CoA Needed card), Total Draws, Target Skin (+ outfit 1 variant line).
- **Recommended Recharge** (`PackRecommendation`):
  - Impossible state when no pack combo fits the window: "No pack combination reaches the target within the event window with current inputs."
  - Table: Pack | Type | Qty | Diamonds | BDT, with a total row. Pack names: `fp_*` → "First Purchase Bonus {n} dias", `r_*` → "{n} dias", weekly passes get a pass icon.
  - Footer: "Plan completes by day {completionDay} of {duration_days}."
- **Day-by-day schedule** (`ScheduleTable`) — see below.
- **Actions**: "← Adjust plan" (back to Step 3, or Step 2 for bingo) and "Download PDF" (client-side generation via jsPDF; shows "Preparing..." while generating).
- Footer reminders: claim free-draw tokens in-game daily; algorithmic estimates disclaimer.

#### Schedule table

- **Desktop** — columns: collector = Date | Action | Draws | Total | Dia | CoA; other types = Date | Action | Draws | Cumulative | Dia. Expandable ("Show all N days" / "Show less") when more than 10 rows.
- **Mobile** — stacked day cards: date, draws chip, action lines, spent-today / total-spent mini columns.
- **Date labels** are anchored at 08:00 UTC (= 2 PM BDT in-game reset) so they match in-game days.
- **Action lines** come from the plan's per-day notes, each rendered with an icon: weekly-pass purchases (ticket), Starlight claims (key/sparkles), recharges and pack purchases (wallet), token claims (scroll/key), "Don't claim" (clock), completed recharge/spend tasks (coins), insufficient balance (alert), CoA draws (CoA star), regular draws (gem).
- **Tags**: rows are tinted by kind — final push (green), premium-supply / Starlight days (purple), balance gaps (coral). A legend explains icons per event type.

## Bug reports

- Available from the navbar on every page (desktop button; mobile hamburger → "Report a Bug").
- The modal pre-fills a technical block (event info, all wizard inputs, plan summary, full day schedule) and lets the user describe what went wrong.
- Submits to **Web3Forms** (`api.web3forms.com/submit`) using `NEXT_PUBLIC_WEB3FORMS_KEY`; the key is public-safe by design.
- Six summary fields are sent as separate form fields (Event, Plan Start Day, Target, Draws Needed, Recharge BDT, Plan Error) plus a `botcheck` honeypot; the full readable detail stays in the message body.
- `Plan Start Day` respects the Step 4 "Start Today vs Day 1" toggle; the true current day is recorded as "Event day at report" in the technical block.
- On the plan page the report is built with wizard context; on other pages it works context-free.
- Reports are collected in the Web3Forms dashboard (free plan keeps submissions 30 days).

## Support / misc

- **Buy me a coffee** (`SupportButton`, fixed bottom-right, all pages): auto-expands on desktop and briefly on mobile; opens a modal with bKash and Nagad numbers to copy. ⚠️ The phone numbers still carry "replace before launch" TODO comments — confirm them before release.
- **Help page** (`/help`): explains the three event types and what you get.
- **Navbar**: sticky, logo → home; desktop shows Home icon, Help icon, Report Bug button; mobile shows a hamburger menu whose items (Home / Help / Report a Bug) are separated by full-width divider lines.

## Event types

| Type | Inputs | Flow |
|---|---|---|
| Themed Crest (also `legend` / `special`) | Diamonds, passes | Draw for crests → exchange crests for the target in the event shop. Premium supply phases (2 windows) + milestone bonuses + optional surprise tasks add free tokens. |
| Collector | Diamonds **and** CoA | First phase: spend diamonds (daily 1x + first-10x discount, Starlight when affordable, spend-task keys). Then CoA phase: draws paid from CoA first. Milestone tokens + final push. |
| Bingo / Aspirants | Diamonds, passes | Win condition from a fixed draw distribution (lucky 30–40 / realistic 50 / worst 60); the plan simulates the worst case and stops at the target. Aspirants = box completion, others = line completion. |
