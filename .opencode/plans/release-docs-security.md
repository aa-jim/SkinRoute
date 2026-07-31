# Release Prep: Docs + Security + AGENTS.md Update

Plan for releasing SkinRoute. User confirmed: create docs/EVENTS.md, remove test_planner.mjs, deploy target = Vercel.

## 1. AGENTS.md — add new fixes + fix stale entries

**Add new section** after the "Report's Plan Start Day..." bullet (~line 40):

```
### Mobile nav dividers (`Navbar.jsx`)
- Hamburger menu items (Home/Help/Report a Bug) each get a full-width divider: `-mx-4 px-4 border-b border-white/10` (edge-to-edge line under each item, including the last)
- Container padding changed `py-2` → `pt-2 pb-0` so the last divider sits flush with the dropdown bottom
```

**Fix stale entries:**
- Line 49 Next Steps: "verify a test submission arrives with the separate input fields" → done; replace with: "Docs + security hardening (see plan), then deploy to Vercel"
- Lines 59-60 Relevant Files: `lib/reportBug.js — to create` and `components/ui/ReportModal.jsx — to create` → change to "— report builder (returns description/technical/fields)" and "— report modal (Web3Forms POST, botcheck honeypot)"
- Add to Relevant Files: `next.config.mjs`, `README.md`, `docs/EVENTS.md`, `data/packs.json`

## 2. README.md — full rewrite (replace create-next-app boilerplate)

Sections:
- **What is Skin Route** — plan the cheapest way to get an MLBB event skin: enter diamonds/CoA/passes/target → day-by-day draw + recharge schedule
- **Features** — 3 event types (themed crest, collector, bingo/aspirants), cheapest BDT pack combo optimizer, "Start Today vs Day 1" toggle, PDF export, bug report modal (Web3Forms)
- **Tech stack** — Next.js 15 (App Router), React 18, Tailwind 3, jspdf, lucide-react, framer-motion
- **Getting started**
  - `npm install`, `npm run dev` → http://localhost:3000
  - `.env.local` with `NEXT_PUBLIC_WEB3FORMS_KEY=...` (needed only for bug reports; key is public-safe per Web3Forms docs)
  - `npm run lint`, `npm run build`
- **Project structure** — app/ (pages), components/ (wizard + ui), lib/ (planners, simulator, PDF), data/ (events.json, packs.json), public/assets
- **Adding a new event** → point to docs/EVENTS.md
- **Deploy on Vercel** — push to GitHub (repo: aa-jim/SkinRoute) → import → add env var `NEXT_PUBLIC_WEB3FORMS_KEY` in Vercel project settings (NOT committed, must be re-added) → deploy, free HTTPS
- **Disclaimer** — plans are estimates based on published drop rates; cross-check in-game

## 3. docs/EVENTS.md — new data-format guide

Field-by-field reference using live entries as examples (documented from reading data/events.json + data/packs.json):

- **Event object** (top-level): `id`, `name`, `card_label?`, `type` (`collector` | `themed_crest` | `bingo`), `start_date`/`end_date` (YYYY-MM-DD; day resets 2PM BDT), `duration_days`, `status`, `banner_gradient` (tailwind classes), `text_panel_color`, `image` (public path), `draw_cost_1x`/`draw_cost_10x`, `discount_draw_cost` (`daily_1x`, `first_time_10x`, `tenx_diamond_only_pct_off`), `draw_currency` (`diamonds` | `coa_and_diamonds`), `has_pity_first_10`, `has_surprise_tasks?` + `surprise_tasks` (recharge thresholds → tokens, active_days)
- **`milestones`** — `{draws, reward_type: token|crests|other, tokens?|crests?|note?}` ("other" = ignore)
- **`premium_supply`** — phases `{phase, start_day, duration_days, tasks[]}`; task types: login, recharge_any, recharge_50/100/250, spend_100/250, starlight_activate; each `{type, tokens, threshold_dia?}`
- **`shop_items`** — `{id, name, hero, base_crest_cost, crest_cost, is_skin, limit?, image}` — crest cost = exchange price; `crest_cost < base_crest_cost` = discount
- **`prize_pool`** (themed crest) — gacha table: `skin_group` `{type, drop_rate, dup_value, skin_ids}`, effects `{type, count, drop_rate, crest_value, is_skin}`, `crest` pool `{type, drop_rate, crest_values[]}` — drop_rates must sum to 1.0
- **`bingo`** (bingo/aspirants) — `{type: "line_3x3", pool_size, skins: [{id, name, guaranteed_pity}], guaranteed_pity_skin_id, shared_pool_event_id, sub_event_id}` (nulls = standalone)
- **Assets** — banner + skin images under public/assets/events/{event_id}/...
- **packs.json** — weekly_pass (bdt, dia_instant, dia_daily, days, recharge_task_value, coa_box_daily + sequential-stacking notes), coa_packs (daily/monthly coa rates), first_purchase (fp_50/150/250/500: bdt, dia_base, dia_bonus, dia_extra, total), regular (r_*: bdt, total)
- **Checks** — validate JSON (`node -e "JSON.parse(require('fs').readFileSync('data/events.json','utf8'))"`), drop rates sum to 1, ids unique across shop_items + prize_pool

## 4. Remove unused xlsx dependency

- `xlsx@0.18.5` — zero imports in codebase (verified by grep), known critical CVEs (CVE-2023-30533 prototype pollution + ReDoS, no patched npm release)
- Run `npm uninstall xlsx` (updates package.json + package-lock.json)

## 5. Security headers — next.config.mjs

Replace empty config with production-gated headers (dev stays permissive so HMR/next dev isn't broken):

```js
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://api.web3forms.com https://fonts.googleapis.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.web3forms.com",
  ].join("; ") },
];

const nextConfig = process.env.NODE_ENV === "production"
  ? { async headers() { return [{ source: "/(.*)", headers: securityHeaders }]; } }
  : {};
```

Notes: Next 15 prod does not need unsafe-inline for scripts; next/font inlines styles (hence style-src 'unsafe-inline'); fonts.googleapis.com is needed at runtime by next/font; HSTS is redundant on Vercel but harmless for other hosts.

## 6. ReportModal honeypot — components/ui/ReportModal.jsx

Add to the POST body in handleSubmit (line ~37-45):

```js
botcheck: "",  // Web3Forms honeypot — server rejects submissions where bots fill this
```

(Web3Forms rejects requests where the botcheck field is non-empty; JSON API accepts it as a normal field.)

## 7. Remove test_planner.mjs (tracked stray dev script)

- Delete file from repo root (git status will show deletion; commit later)

## 8. Verify

- `npx next lint` (expect only pre-existing <img> warnings)
- `npm audit` (after xlsx removal — confirm clean or document remaining advisories)
- `node -e "JSON.parse(...)"` JSON validity check for data files
- `npm run build` — known to fail in this env on Google Fonts fetch (ETIMEDOUT) — retry; if it still fails, note for deploy-time verification
- Manual check: dev server — mobile hamburger dividers render, report modal sends with botcheck, Plan Start Day respects toggle

## Files touched
- AGENTS.md (edit)
- README.md (rewrite)
- docs/EVENTS.md (new)
- package.json + package-lock.json (xlsx removal)
- next.config.mjs (headers)
- components/ui/ReportModal.jsx (botcheck)
- test_planner.mjs (deleted)
- .opencode/plans/release-docs-security.md (this plan)
