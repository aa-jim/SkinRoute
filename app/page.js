import Navbar from "@/components/layout/Navbar";
import EventCard from "@/components/ui/EventCard";
import eventsData from "@/data/events.json";

export default function Home() {
  const events = (eventsData.events ?? []).filter((e) => e.status !== "ended");

  return (
    <main className="relative min-h-screen bg-[#1D2331] overflow-hidden">
      {/* Background image layer — 20% opacity, blurred, per design spec */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm"
        style={{ backgroundImage: "url('/assets/bg/bg_image2.jpg')" }}
      />
      {/* Overall layer opacity (85%) applied via a dark scrim on top of the image */}
      <div className="absolute inset-0 bg-[#1D2331]/15" />

      <div className="relative z-10">
        <Navbar />

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="relative max-w-[1100px] mx-auto text-center px-6 pt-10 pb-8">
            <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
              Plan the cheapest path to your event skin
            </h1>
            <p className="mt-5 text-base sm:text-lg font-medium text-white/80 max-w-3xl mx-auto whitespace-nowrap">
              Pick a running event, enter your resources, get a day-by-day draw schedule + recharge plan.
            </p>
          </div>
        </section>

        {/* Event selector */}
        <section className="relative px-6 sm:px-10 pb-20">
          <div className="max-w-[2400px] mx-auto overflow-x-auto">
            <div className="flex gap-8 w-max mx-auto px-6 py-6 justify-center">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 py-8 text-center">
          <p className="text-sm text-white/50">
            Built for MLBB Players, by MLBB Player. Data Verified against official rules.
          </p>
        </footer>
      </div>
    </main>
  );
}