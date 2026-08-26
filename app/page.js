import Navbar from "@/components/layout/Navbar";
import EventCarousel from "@/components/ui/EventCarousel";
import { getEvents } from "@/lib/eventRepo";
import { deriveStatus } from "@/lib/eventHelpers";

// Dynamic on purpose: (1) the CSP nonce comes from a per-request header
// (middleware.js) and only exists at request time, so static prerenders
// can't carry it; (2) event statuses depend on "today" (deriveStatus) and
// would go stale between deploys if the HTML were baked at build time.
export const dynamic = "force-dynamic";

export default function Home() {
  const events = getEvents()
    .filter((e) => e.status !== "hidden" && deriveStatus(e) !== "ended")
    .sort((a, b) => {
      const aStatus = deriveStatus(a);
      const bStatus = deriveStatus(b);
      // coming_soon always after active
      if (aStatus === "coming_soon" && bStatus !== "coming_soon") return 1;
      if (bStatus === "coming_soon" && aStatus !== "coming_soon") return -1;
      // same status: sort by start_date ascending
      return (a.start_date ?? "").localeCompare(b.start_date ?? "");
    });

  return (
    <main className="relative min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="max-w-[900px] mx-auto text-center px-6 pt-14 pb-8">
        <h1 className="font-heading text-4xl sm:text-5xl md:text-[3.4rem] font-semibold text-ink leading-[1.1] tracking-tight text-balance">
          Plan the cheapest path to your event skin
        </h1>
        <div className="mx-auto mt-6 flex items-center justify-center gap-3" aria-hidden="true">
          <span className="h-px w-12 bg-line-strong" />
          <span className="w-1.5 h-1.5 rotate-45 bg-brick" />
          <span className="h-px w-12 bg-line-strong" />
        </div>
        <p className="mt-6 text-sm sm:text-base text-ink-soft max-w-xl mx-auto leading-relaxed">
          Pick a running event, enter your resources, and get a day-by-day draw
          schedule plus the cheapest recharge plan.
        </p>
      </section>

      {/* Event selector */}
      <section className="px-6 sm:px-10 pb-16">
        <EventCarousel events={events} />
      </section>

      {/* Footer */}
      <footer className="mt-8 bg-ink text-paper/80">
        <div className="max-w-[900px] mx-auto px-6 py-8">
          <p className="text-xs text-center text-paper/80">
            Built for MLBB players, by an MLBB player. Data verified against official rules.
          </p>
        </div>
      </footer>
    </main>
  );
}
