import Navbar from "@/components/layout/Navbar";
import eventsData from "@/data/events.json";
import { notFound } from "next/navigation";
import { WizardProvider } from "@/lib/wizardContext";
import WizardShell from "@/components/wizard/WizardShell";

export default async function PlanPage({ params }) {
  const { eventId } = await params;
  const event = eventsData.events.find((e) => e.id === eventId);

  if (!event) {
    notFound();
  }

  return (
    <main className="relative min-h-screen bg-navy">
      {/* Background image layer — same treatment as landing page */}
      <div
        className="absolute inset-0 bg-cover opacity-20 blur-sm md:hidden bg-fixed"
        style={{ backgroundImage: "url('/assets/bg/bg_image_mobile.png')", backgroundPosition: "50% 20%" }}
      />
      <div
        className="absolute inset-0 bg-cover opacity-20 blur-sm hidden md:block xl:hidden bg-fixed"
        style={{ backgroundImage: "url('/assets/bg/bg_image_tablet.png')", backgroundPosition: "50% 20%" }}
      />
      <div
        className="absolute inset-0 bg-cover opacity-20 blur-sm hidden xl:block bg-fixed"
        style={{ backgroundImage: "url('/assets/bg/bg_image2.jpg')", backgroundPosition: "75% 30%" }}
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