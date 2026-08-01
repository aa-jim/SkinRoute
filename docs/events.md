# Adding a New Event — Baseline

Every MLBB event is data-driven. Adding the next event = adding one JSON object + images. **No code changes are needed for a standard event** — the planners branch on `event.type` automatically.

- Events: `data/events.json` (`{ "events": [ ... ] }`)
- Packs/prices: `data/packs.json`
- Images: `public/assets/events/{event_id}/...` and `public/assets/skins/...`

## 1. `events.json` — event object schema

### Top-level fields

| Field | Type | Required | What it does |
|---|---|---|---|
| `id` | string | ✅ | URL slug (`/plan/{id}`) + asset path. Unique. |
| `name` | string | ✅ | Display name (nav, wizard header, PDF). |
| `card_label` | string | optional | Short badge label (e.g. "Aspirants"). Falls back to `name`. |
| `type` | string | ✅ | `"collector"`, `"themed_crest"`, `"bingo"` (also accepted: `"legend"`, `"special"` → treated as themed crest). **Drives everything.** |
| `start_date` / `end_date` | string | see note | `YYYY-MM-DD`. Day resets at 2 PM BDT (08:00 UTC); an event ending on `end_date` is live until 2 PM BDT the next day. **Not needed for recurring events** (see below). |
| `recurring` | object | optional | `{ "pattern": "monthly" }` — the event's window is **computed at request time** from the current in-game month (2 PM BDT boundary), so it rolls over automatically with zero edits. Explicit `start_date`/`end_date` in the JSON always override the pattern. |
| `duration_days` | number | ✅ | Event length in days. Must equal the calendar span. For recurring events this is resolved automatically (28–31); the JSON value is only a fallback. |
| `status` | string | ✅ | Only `"hidden"` and `"ended"` matter to code (kill-switches). `"active"` / `"coming soon"` are informational. |
| `banner_gradient` | string | ✅ | Tailwind gradient classes for the card tint (e.g. `"from-[#0a1a3a] via-[#1a2a5a] to-[#3a1a5a]"`). |
| `text_panel_color` | string | ✅ | Hex color for the card text panel tint. |
| `image` | string | ✅ | Banner path, e.g. `/assets/events/{id}/banner.jpg`. |
| `draw_cost_1x` / `draw_cost_10x` | number | ✅ | Base draw prices in diamonds. |
| `discount_draw_cost` | object | ✅ | `daily_1x` (discounted single, usually 50%), `first_time_10x` (collector/bingo), `tenx_diamond_only_pct_off` (themed crest: % off the 10x). |
| `draw_currency` | string | optional | `"diamonds"` or `"coa_and_diamonds"` — informational only (code doesn't branch on it; collector behavior is keyed on `type`). |
| `has_pity_first_10` | boolean | optional | Informational (bingo pity uses `bingo.guaranteed_pity_skin_id` instead). |
| `card_label` | string | optional | See above. |

### `milestones` — draw-count bonuses

```json
{ "draws": 20, "reward_type": "token", "tokens": 1 },
{ "draws": 60, "reward_type": "other", "note": "magic wheel potion - ignore" },
{ "draws": 130, "reward_type": "token", "tokens": 10 },
{ "draws": 160, "reward_type": "crests", "crests": 100 }
```

- `reward_type: "token"` → free draws (claimed by simulators, counted as real draws).
- `reward_type: "crests"` → subtracted in `drawsNeeded` when the draw threshold is reachable.
- `reward_type: "other"` → ignored in math, surfaced as non-calculable in the milestones view.
- ⚠️ Must be an **array**. If unconfirmed, use `"PLACEHOLDER_NEEDS_CONFIRMATION"` (bingo still plans; non-bingo won't render milestones cleanly).

### `premium_supply` — token windows

```json
{ "phase": 1, "start_day": 8, "duration_days": 5, "tasks": [ ... ] }
```

Task types (all with `tokens`): `login`, `recharge_any`, `recharge_50`, `recharge_100`, `recharge_250`, `spend_100`, `spend_250`, `starlight_activate` (collector). Recharge/spend tasks take `threshold_dia`. Phase `start_day` is event-relative.

- Themed crest uses **all phases**; the collector simulator uses only `premium_supply[0]`.
- ⚠️ Must be an array; a string placeholder throws in `premiumSupplyWindowPlan` (bingo branch is guarded).

### `surprise_tasks` — optional

```json
"has_surprise_tasks": true,
"surprise_tasks": {
  "active_days": 3,
  "tasks": [
    { "type": "recharge", "threshold_dia": 10, "tokens": 0 },
    { "type": "recharge", "threshold_dia": 50,  "tokens": 1 },
    { "type": "recharge", "threshold_dia": 250, "tokens": 2 },
    { "type": "recharge", "threshold_dia": 750, "tokens": 0 }
  ]
}
```

- Cumulative recharge within the first `active_days` unlocks tiers; `tokens > 0` tiers are claimed as free draws by the simulator. Zero-token tiers are skipped.
- The planner never recommends extra recharge purely for the ladder — it only sizes up to the 750-dia point when that tier is crossed incidentally.

### `shop_items` — exchange / target skins

```json
{
  "id": "yin_yuji", "name": "Itadori Yuji", "hero": "Yin",
  "base_crest_cost": 1200, "crest_cost": 1200,
  "is_skin": true, "limit": 1,
  "image": "/assets/events/jujutsu_kaisen_2026/target/yin_yuji.png",
  "outfit1_variant": { "name": "...", "hero": "...", "image": "...", "crest_cost": 600 }
}
```

- `crest_cost` = real exchange price; `base_crest_cost` = original (UI shows strikethrough when they differ).
- `outfit1_variant` (optional) enables the "Painted Skin" toggle in Step 2; its `crest_cost` is added to the target.
- `tier` (optional) shows on the target card ribbon (e.g. "COLLECTOR"/"LUCKYBOX"). `limit`/`is_skin` are informational.
- **IDs in `shop_items` are referenced by `prize_pool.skin_group.skin_ids`** and owned-skin tracking — keep them stable.

### `prize_pool` — the gacha table (themed crest / collector)

```json
{ "id": "collab_skin_group", "name": "Collab Skins", "type": "skin_group",
  "drop_rate": 0.0008, "dup_value": 360,
  "skin_ids": ["yin_yuji", "julian_megumi", "melissa_nobara", "xavier_gojo"] },
{ "id": "battle_emote", "name": "...", "type": "emote", "count": 3,
  "drop_rate": 0.071, "crest_value": 9, "is_skin": false },
{ "id": "crest_pool", "name": "Crests", "type": "crest",
  "drop_rate": 0.9022, "crest_values": [20, 15, 12, 10, 8, 5] }
```

- Entry types: `skin_group` (shared drop rate across `skin_ids`, `dup_value` on duplicates), named effects/rewards (`count` of distinct items, `crest_value` per duplicate), and the `crest` pool (`crest_values` averaged).
- **`drop_rate` is a decimal fraction — all rates in the pool MUST sum to 1.0.** This drives the expected crests/draw math, so it's the single most important validation step.
- Step 3 shows non-`skin_group`/`crest`/`items` entries as "Other Rewards" counters.

### `bingo` — bingo/aspirants config

```json
"bingo": {
  "type": "line_3x3", "pool_size": 4,
  "skins": [ { "id": "floryn_fluffydream", "name": "Fluffy Dream (Floryn)", "guaranteed_pity": true } ],
  "guaranteed_pity_skin_id": "floryn_fluffydream",
  "shared_pool_event_id": null, "sub_event_id": null
}
```

- `guaranteed_pity_skin_id` (or null) drives the "Guaranteed in 10x" label + pity logic. `pool_size`, per-skin `guaranteed_pity`, `shared_pool_event_id`, `sub_event_id` are informational for now.
- Bingo events don't need `prize_pool` or `crest_cost` in `shop_items`.

### Template

```json
{
  "id": "my_event_2026", "name": "My Event", "card_label": "My Event",
  "type": "themed_crest",
  "start_date": "2026-09-01", "end_date": "2026-09-30", "duration_days": 30,
  "status": "coming soon",
  "banner_gradient": "from-[#0a1a3a] via-[#1a2a5a] to-[#3a1a5a]",
  "text_panel_color": "#1b3b50",
  "image": "/assets/events/my_event_2026/banner.jpg",
  "draw_cost_1x": 50, "draw_cost_10x": 500,
  "discount_draw_cost": { "daily_1x": 25, "tenx_diamond_only_pct_off": 10 },
  "draw_currency": "diamonds",
  "has_pity_first_10": false,
  "has_surprise_tasks": false,
  "milestones": [ { "draws": 20, "reward_type": "token", "tokens": 1 } ],
  "premium_supply": [
    { "phase": 1, "start_day": 8, "duration_days": 5, "tasks": [
      { "type": "login", "tokens": 1 },
      { "type": "recharge_250", "tokens": 8, "threshold_dia": 250 },
      { "type": "spend_250", "tokens": 4, "threshold_dia": 250 } ] }
  ],
  "shop_items": [ { "id": "hero_skin", "name": "Skin", "hero": "Hero",
    "base_crest_cost": 1200, "crest_cost": 1200, "is_skin": true, "limit": 1,
    "image": "/assets/events/my_event_2026/target/hero_skin.png" } ],
  "prize_pool": [
    { "id": "skin_group", "name": "Skins", "type": "skin_group", "drop_rate": 0.004,
      "dup_value": 360, "skin_ids": ["hero_skin"] },
    { "id": "crest_pool", "name": "Crests", "type": "crest",
      "drop_rate": 0.996, "crest_values": [20, 15, 12, 10, 8, 5] }
  ]
}
```

## 1b. Recurring (monthly) events — the collector cycle

The collector ("Exquisite Collection") runs every calendar month (1st → last day) and must **never carry static dates**. Use:

```json
"recurring": { "pattern": "monthly" }
```

with **no** `start_date`/`end_date`. `lib/eventHelpers.js` → `resolveEventDates()` computes the window at request time from the current in-game month (2 PM BDT / 08:00 UTC boundary — the site flips the moment the game does), and `lib/eventRepo.js` re-resolves on every call so long-lived Workers isolates never serve a stale month. `deriveStatus`, `daysLeft`, `eventDayNow` (wizard's "Start Today"), PDF/table date labels, and `/api/plan` all pick up the resolved dates automatically.

- **Monthly edits still needed**: only the rotating content — `shop_items` (target skins + `outfit1_variant`s) and `prize_pool` (skin group ids, dup values). Quantities/rules (`milestones`, `premium_supply` phases, draw costs, `surprise_tasks`) stay constant and must not be touched.
- **Escape hatch**: if a month ever deviates from the 1st→last-day pattern, add explicit `start_date`/`end_date` temporarily — they override the recurring pattern (remove them after the month ends).
- StepFour's plan cache keys include the resolved `start_date`, so a cached plan never crosses a month boundary.

## 2. `packs.json` — packs & passes

Shared across all events; only change when Moonton changes BDT prices or the pass itself.

| Block | Fields | Notes |
|---|---|---|
| `weekly_pass` | `bdt`, `dia_instant`, `dia_daily`, `days`, `recharge_task_value`, `coa_box_daily` | Passes are **sequential** (queued), not simultaneous: instant diamonds on purchase day, then one pass's drip at a time. `recharge_task_value` (100) is what a pass counts as recharge on its purchase day (surprise tasks + supply windows). |
| `first_purchase` | `fp_50/150/250/500`: `bdt`, `dia_base`, `dia_bonus`, `dia_extra`, `total` | The 2× diamond bonus packs. Code uses `bdt`, `dia_base` (recharge mode), `total`. Claimed state comes from the wizard. |
| `regular` | `r_*`: `bdt`, `total` | Normal diamond packs (unbounded in the knapsack). |
| `coa_packs` | daily/monthly rates | Unused by code (kept for reference). |

## 3. Assets

- Banner: `public/assets/events/{event_id}/banner.jpg|jpeg|png`
- Target skins: `public/assets/events/{event_id}/target/{skin_id}.png` (or reuse `public/assets/skins/...` paths)
- Reference live example: `public/assets/events/jujutsu_kaisen_2026/`
- ⚠️ **Case-sensitive on Vercel (Linux)**: the filename must match the `events.json` path **byte-for-byte** (e.g. `banner.jpeg` ≠ `banner.JPEG`). Windows dev is case-insensitive so mismatches only surface after deploy as a 400/404 on the `/_next/image` request — use `git mv` for case-only renames so git tracks them.

## 4. New-event checklist

1. Copy the template above into `data/events.json` (append to `events` array).
2. Fill `id`, dates, `duration_days`, costs, `status`.
3. Fill `milestones` (array; use the string placeholder only if truly unknown).
4. Fill `premium_supply` phases + tasks (array; themed crest = all phases, collector = phase 1 matters).
5. Fill `shop_items` (target skins, outfit1 variants if any).
6. Fill `prize_pool` — **sum of all `drop_rate` values must be exactly 1.0**.
7. Bingo: fill `bingo` block; skip `prize_pool`.
8. Add images under `public/assets/events/{id}/` (banner + target/).
9. Validate JSON:
   ```powershell
   node -e "JSON.parse(require('fs').readFileSync('data/events.json','utf8')); JSON.parse(require('fs').readFileSync('data/packs.json','utf8')); console.log('valid')"
   ```
10. Smoke-test the planner (see `development.md` — node harness): run `buildPlan` for the new event at all 3 confidence levels; check `drawsNeeded`, `recharge`, `daySchedule` totals, no `warnings` explosion.
11. Check the home page + wizard renders (dev server), status shows correctly, target selectable, PDF downloads.
12. Run `npm run lint`.

## Field-usage cheat sheet

- **Planner**: `type`, `duration_days`, `premium_supply`, `milestones`, `discount_draw_cost`, `draw_cost_1x/10x`, `shop_items[].crest_cost`/`outfit1_variant.crest_cost`, `prize_pool` (calculator), `bingo.guaranteed_pity_skin_id`, `has_surprise_tasks`/`surprise_tasks`
- **UI only**: `name`, `card_label`, `banner_gradient`, `text_panel_color`, `image`, `tier`, `base_crest_cost` (strikethrough), `end_date` (countdown)
- **Ignored entirely**: `draw_currency`, `has_pity_first_10`, `bingo.pool_size`, `shop_items[].limit`/`is_skin`, `prize_pool[].is_skin`, `surprise_rewards_ladder`
