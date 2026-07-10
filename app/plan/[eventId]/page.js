import Navbar from "@/components/layout/Navbar";
import eventsData from "@/data/events.json";
import { notFound } from "next/navigation";

export default function PlanPage({ params }) {
  const event = eventsData.events.find((e) => e.id === params.eventId);

  if (!event) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-navy">
      <Navbar />
      <div className="max-w-[900px] mx-auto px-6 py-24 text-center">
        <h1 className="font-heading text-3xl font-bold text-white mb-3">
          {event.name}
        </h1>
        <p className="text-white/60">
          The 4-step planner wizard (Resources → Target → Prize Pool → Result)
          isn&apos;t built yet — coming in Part 2.
        </p>
      </div>
    </main>
  );
}