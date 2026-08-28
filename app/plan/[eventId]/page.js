import Navbar from "@/components/layout/Navbar";
import PageDecor from "@/components/layout/PageDecor";
import { getEvent } from "@/lib/eventRepo";
import { notFound } from "next/navigation";
import { WizardProvider } from "@/lib/wizardContext";
import WizardShell from "@/components/wizard/WizardShell";

export default async function PlanPage({ params }) {
  const { eventId } = await params;
  const event = getEvent(eventId);

  if (!event) {
    notFound();
  }

  // Background comes from the body: warm paper with a faint grain.
  return (
    <main className="relative min-h-screen">
      <PageDecor fixed />
      <div className="relative z-10">
        <WizardProvider event={event}>
          <Navbar />
          <WizardShell />
        </WizardProvider>
      </div>
    </main>
  );
}
