import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import PageDecor from "@/components/layout/PageDecor";
import { Layers, Wallet, Download, Gem, Grid3x3, Sparkles } from "lucide-react";

// Dynamic on purpose: the CSP nonce (middleware.js) only exists at request
// time, so static prerenders can't carry it on their inline scripts.
export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Layers, title: "Day-by-day schedule", desc: "Exactly what to draw, and when, for every day of the event." },
  { icon: Wallet, title: "Recharge plan", desc: "The cheapest BDT pack combo to close your diamond/CoA gap." },
  { icon: Download, title: "PDF export", desc: "Download your full plan to check off as you go." },
];

const EVENT_TYPES = [
  {
    icon: Gem,
    name: "Themed Crest",
    color: "text-fern",
    desc: "Draw to earn crests, then exchange crests for the target skin in the event shop. Includes premium supply windows and milestone bonuses.",
  },
  {
    icon: Sparkles,
    name: "Collector",
    color: "text-gold-dark",
    desc: "Draws cost Crystal of Aurora (CoA) and diamonds. Includes Starlight membership, spend-task keys, and first-10-draw pity.",
  },
  {
    icon: Grid3x3,
    name: "Bingo",
    color: "text-plum",
    desc: "Complete a line (or hit 3 boxes) to win a random unowned skin from the pool. Some variants guarantee a specific skin on your first 10x draw.",
  },
];

export default function HelpPage() {
  return (
    <main className="relative min-h-screen">
      <PageDecor fixed />
      <Navbar />
      <div className="max-w-[800px] mx-auto px-6 py-12 sm:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brick text-center mb-4">
          Field guide
        </p>
        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-ink text-center mb-3 tracking-tight">
          How Skin Route Works
        </h1>
        <p className="text-ink-soft text-center max-w-lg mx-auto mb-12 text-sm sm:text-base leading-relaxed">
          Enter your resources, pick an event and target skin, and get the cheapest
          possible path to it day by day.
        </p>

        {/* What you get */}
        <section className="mb-14">
          <h2 className="inline-block bg-paper/85 rounded-md px-2 py-0.5 font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft mb-4">
            What you get
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border-2 border-ink bg-paper-raised shadow-hard-sm px-5 py-4">
                <f.icon size={20} className="text-brick mb-2" />
                <p className="font-heading font-semibold text-ink text-sm mb-1">{f.title}</p>
                <p className="text-xs text-ink-soft leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Event types */}
        <section className="mb-14">
          <h2 className="inline-block bg-paper/85 rounded-md px-2 py-0.5 font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft mb-4">
            Supported event types
          </h2>
          <div className="flex flex-col gap-3">
            {EVENT_TYPES.map((e) => (
              <div key={e.name} className="rounded-xl border border-line-strong bg-paper-raised px-5 py-4 flex gap-4">
                <e.icon size={22} className={`shrink-0 mt-0.5 ${e.color}`} />
                <div>
                  <p className={`font-heading font-semibold text-base mb-1 ${e.color}`}>{e.name}</p>
                  <p className="text-xs text-ink-soft leading-relaxed">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="text-center">
          <Link
            href="/"
            className="inline-block px-6 py-2.5 rounded-md border-2 border-ink text-ink font-heading font-semibold hover:bg-ink hover:text-paper-raised transition-colors"
          >
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
