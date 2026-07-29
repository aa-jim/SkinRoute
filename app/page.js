import Navbar from "@/components/layout/Navbar";
import EventCarousel from "@/components/ui/EventCarousel";
import eventsData from "@/data/events.json";
import { deriveStatus } from "@/lib/eventHelpers";

export default function Home() {
  const events = (eventsData.events ?? [])
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
    <main className="relative min-h-screen bg-[#1D2331] overflow-hidden">
      {/* Background image layer — 20% opacity, blurred, per design spec */}
      {/* Mobile: portrait-cropped image, only below md: — bg-top-ish position keeps
          the character's face/torso in frame on short, wide phone viewports */}
      <div
        className="absolute inset-0 bg-cover opacity-20 blur-sm md:hidden bg-fixed"
        style={{ backgroundImage: "url('/assets/bg/bg_image_mobile.png')", backgroundPosition: "50% 20%" }}
      />
      {/* Tablet: shown only between md: and xl: (covers iPad Pro at exactly 1024px) */}
      <div
        className="absolute inset-0 bg-cover opacity-20 blur-sm hidden md:block xl:hidden bg-fixed"
        style={{ backgroundImage: "url('/assets/bg/bg_image_tablet.png')", backgroundPosition: "50% 20%" }}
      />
      {/* Desktop: landscape image, only from xl: up (1280px+) — subject sits right-of-center,
          upper third, so shift position right/up to avoid cropping her out on ultra-wide screens */}
      <div
        className="absolute inset-0 bg-cover opacity-20 blur-sm hidden xl:block bg-fixed"
        style={{ backgroundImage: "url('/assets/bg/bg_image2.jpg')", backgroundPosition: "75% 30%" }}
      />
      {/* Overall layer opacity (85%) applied via a dark scrim on top of the image */}
      <div className="absolute inset-0 bg-[#1D2331]/15" />

      <div className="relative z-10">
        <Navbar />

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="relative max-w-[1100px] mx-auto text-center px-6 pt-10 pb-6">
            <h1 className="font-heading text-3xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
              Plan the cheapest path to your event skin
            </h1>
            <p className="mt-5 text-xs sm:text-base md:text-lg font-medium text-white/80 max-w-4xl mx-auto">
              Pick a running event, enter your resources, get a day-by-day draw schedule + recharge plan.
            </p>
          </div>
        </section>

        {/* Event selector */}
        <section className="relative px-6 sm:px-10 pb-18">
          <EventCarousel events={events} />
        </section>

        {/* Footer */}
        <footer className="mt-8 border-t border-white/10 py-6 text-center">
          <p className="text-xs sm:text-sm text-white/50 max-w-2xl mx-auto px-6">
            Built for MLBB Players, by MLBB Player. Data Verified against official rules.
          </p>
        </footer>
      </div>
    </main>
  );
}