import Navbar from "@/components/layout/Navbar";
import EventCard from "@/components/ui/EventCard";
import eventsData from "@/data/events.json";

export default function Home() {
  const events = eventsData.events ?? [];

  return (
    <main className="min-h-screen bg-navy">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-navy via-[#0d1330] to-navy" />
        <div className="relative max-w-[1000px] mx-auto text-center px-6 pt-20 pb-14">
          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
            Plan the cheapest path to your event skin
          </h1>
          <p className="mt-5 text-base sm:text-lg font-medium text-white/80 max-w-2xl mx-auto">
            Pick a running event, enter your resources, get a day-by-day draw schedule + recharge plan.
          </p>
        </div>
      </section>

      {/* Event selector */}
      <section className="relative px-6 sm:px-10 pb-24">
        <div className="max-w-[1400px] mx-auto overflow-x-auto">
          <div className="flex gap-6 w-max px-1 pb-2">
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
    </main>
  );
}
