# Skin Route

Plan the cheapest path to your Mobile Legends: Bang Bang event skin. Enter your diamonds, passes and target — get a day-by-day draw schedule plus the cheapest BDT recharge plan, exportable as a PDF.

Built for MLBB players. Algorithmic estimates — always cross-check against in-game values.

## Features

- **3 event types**: Themed Crest, Collector (CoA + diamonds), Bingo / Aspirants
- **Day-by-day schedule** — exactly what to draw and when, with premium-supply windows, milestone tokens and surprise tasks counted as real draws
- **Cheapest recharge plan** — 3D-knapsack optimizer finds the minimum-BDT pack combo (diamond packs, weekly passes, first-purchase bonuses)
- **Start Today vs Day 1** toggle for mid-event planners
- **PDF export** of the full plan
- **Bug reports** with auto-attached technical details (Web3Forms)
- Dark MLBB-themed UI, mobile-friendly

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Bug reports need one env var (optional, key is public-safe):

```
# .env.local
NEXT_PUBLIC_WEB3FORMS_KEY=your_web3forms_access_key
```

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.

## Documentation

Everything lives in [`docs/`](docs/README.md):

| Doc | Contents |
|---|---|
| [docs/features.md](docs/features.md) | All user-facing features (wizard, results, schedule table, PDF, bug reports) |
| [docs/architecture.md](docs/architecture.md) | Inner workings of the planning engine |
| [docs/events.md](docs/events.md) | **How to add the next MLBB event** — schema, checklist, validation |
| [docs/development.md](docs/development.md) | Setup, test harness, deployment, security |

## Stack

Next.js 15 (App Router) · React 18 · Tailwind CSS 3.4 · jsPDF · lucide-react

## Deploy

Hosted on Vercel: import the repo, add `NEXT_PUBLIC_WEB3FORMS_KEY` in project settings, deploy. HTTPS is automatic. See [docs/development.md](docs/development.md#deployment-vercel).

## Disclaimer

Plans are estimates based on published drop rates and may contain errors. Cross-check against in-game values before spending.
