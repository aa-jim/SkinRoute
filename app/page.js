import Navbar from "@/components/layout/Navbar";
import PageDecor from "@/components/layout/PageDecor";
import EventCarousel from "@/components/ui/EventCarousel";
import { getEvents } from "@/lib/eventRepo";
import { deriveStatus } from "@/lib/eventHelpers";

export const dynamic = "force-dynamic";

export default function Home() {
  const events = getEvents()
    .filter((e) => e.status !== "hidden" && deriveStatus(e) !== "ended")
    .sort((a, b) => {
      const aStatus = deriveStatus(a);
      const bStatus = deriveStatus(b);
      if (aStatus === "coming_soon" && bStatus !== "coming_soon") return 1;
      if (bStatus === "coming_soon" && aStatus !== "coming_soon") return -1;
      return (a.start_date ?? "").localeCompare(b.start_date ?? "");
    });

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Page-anchored decorative layer (zhuxin + butterfly) — absolute inset-0
          of this main, scrolls with the page exactly as originally designed. */}
      <PageDecor />

      {/* Main Content Layer */}
      <div className="relative z-10">
        <Navbar />

        {/* Hero */}
        <section className="max-w-[1200px] mx-auto text-center px-6 pt-14 pb-8">
          <h1 className="font-heading text-3xl sm:text-5xl md:text-[3.4rem] font-semibold text-ink leading-[1.1] tracking-tight text-balance">
            Plan the cheapest path to your favorite skin
          </h1>
          
          <p className="mt-6 text-sm sm:text-base text-ink-soft max-w-xxl mx-auto leading-relaxed">
            Pick a running event, enter your resources, get a day by day draw
            schedule + recharge plan.
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
              Built for MLBB Players, by MLBB Player. Data Verified against official rules.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}