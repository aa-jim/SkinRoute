"use client";

import { useWizard } from "@/lib/wizardContext";
import ProgressBar from "@/components/layout/ProgressBar";
import StepOne from "@/components/wizard/StepOne";
import StepTwo from "@/components/wizard/StepTwo";
import { EVENT_TYPE_LABELS, EVENT_TYPE_BADGE } from "@/lib/eventHelpers";

const STEP_COMPONENTS = {
  1: StepOne,
  2: StepTwo,
  // 3: StepThree, ← Part 4 — same
  // 4: StepFour,  ← Part 7 — same
};

export default function WizardShell() {
  const { event, currentStep } = useWizard();
  const ActiveStep = STEP_COMPONENTS[currentStep];

  const endDateLabel = event.end_date
    ? new Date(event.end_date + "T06:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="rounded-2xl border border-border-subtle bg-navy-light overflow-hidden shadow-xl shadow-black/30">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 bg-navy border-b border-border-subtle">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${EVENT_TYPE_BADGE[event.type]}`}
            >
              {EVENT_TYPE_LABELS[event.type] ?? event.type}
            </span>
            <h1 className="font-heading text-lg sm:text-2xl font-bold text-text-primary uppercase tracking-wide truncate">
              {event.name}
            </h1>
          </div>
          {endDateLabel && (
            <span className="text-sm text-text-muted shrink-0 hidden sm:block">
              Ends {endDateLabel}
            </span>
          )}
        </div>

        <ProgressBar currentStep={currentStep} />

        <div className="px-5 sm:px-8 pb-6 sm:pb-8">
          {ActiveStep ? (
            <ActiveStep />
          ) : (
            <p className="text-text-muted text-center py-12">
              Step {currentStep} isn&apos;t built yet.
            </p>
          )}
        </div>

        <div className="px-5 sm:px-8 pb-6 text-center">
          <span className="text-xs text-text-muted">Step {currentStep} of 4</span>
        </div>
      </div>
    </div>
  );
}