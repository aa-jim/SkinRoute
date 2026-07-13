import Navbar from "@/components/layout/Navbar";
import eventsData from "@/data/events.json";
import { notFound } from "next/navigation";
import { WizardProvider } from "@/lib/wizardContext";
import WizardShell from "@/components/wizard/WizardShell";

export default function PlanPage({ params }) {
  const event = eventsData.events.find((e) => e.id === params.eventId);

  if (!event) {
    notFound();
  }

  return (
    <main className="relative min-h-screen bg-navy overflow-hidden">
      {/* Background image layer — same treatment as landing page */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm md:hidden"
        style={{ backgroundImage: "url('/assets/bg/bg_image_mobile.png')" }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm hidden md:block xl:hidden"
        style={{ backgroundImage: "url('/assets/bg/bg_image_tablet.png')" }}
      />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-20 blur-sm hidden xl:block"
        style={{ backgroundImage: "url('/assets/bg/bg_image2.jpg')" }}
      />
      <div className="absolute inset-0 bg-navy/15" />

      <div className="relative z-10">
        <Navbar />
        <WizardProvider event={event}>
          <WizardShell />
        </WizardProvider>
      </div>
    </main>
  );
}