# SkinRoute Documentation

SkinRoute plans the cheapest path to a Mobile Legends: Bang Bang (MLBB) event skin. Enter your resources, pick an event and target, and get a day-by-day draw schedule plus a BDT recharge plan — exportable as a PDF.

## Docs index

| File | What it covers |
|---|---|
| [features.md](features.md) | Everything users can do: home page, the wizard (all 4 steps), results page, schedule table, PDF export, bug reports |
| [architecture.md](architecture.md) | How the planning engine works: `buildPlan` pipeline, simulators, pack optimizer, plan object shape, key mechanics |
| [events.md](events.md) | **Baseline for adding a new event**: `events.json` / `packs.json` schema, what each field does, asset layout, step-by-step checklist |
| [development.md](development.md) | Developer setup, scripts, environment variables, test harness, deployment (Vercel), security posture |

## Quick facts

- **Stack**: Next.js 15 (App Router), React 18, Tailwind 3.4, jspdf (PDF), lucide-react icons
- **Event types supported**: themed crest, collector (CoA + diamonds), bingo / aspirants
- **Data**: all events live in `data/events.json`, packs in `data/packs.json` — see [events.md](events.md) to add the next MLBB event
- **In-game day reset**: 2:00 PM Bangladesh time = 08:00 UTC — the single source of truth is `eventDayNow()` in `lib/eventHelpers.js` (see [architecture.md](architecture.md))

## Related files

- `AGENTS.md` — session context / recent changes log (maintain while working)
- `.opencode/plans/` — planning docs for larger changes
