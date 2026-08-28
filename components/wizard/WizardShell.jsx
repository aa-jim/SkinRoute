"use client";

import { useWizard } from "@/lib/wizardContext";
import ProgressBar from "@/components/layout/ProgressBar";
import StepOne from "@/components/wizard/StepOne";
import StepTwo from "@/components/wizard/StepTwo";
import StepThree from "@/components/wizard/StepThree";
import StepFour from "@/components/wizard/StepFour";
import { deriveStatus } from "@/lib/eventHelpers";


const STEP_COMPONENTS = {
  1: StepOne,
  2: StepTwo,
  3: StepThree,
  4: StepFour,
};

export default function WizardShell() {
  const { event, currentStep } = useWizard();
  const isBingo = event.type === "bingo";
  const effectiveStep = isBingo && currentStep === 3 ? 4 : currentStep;
  const displayStep = isBingo && currentStep > 3 ? currentStep - 1 : isBingo && currentStep === 3 ? 3 : currentStep;
  const totalSteps = isBingo ? 3 : 4;
  const ActiveStep = STEP_COMPONENTS[effectiveStep];

  const isPreStart = deriveStatus(event) === "coming_soon";
  const startDateLabel =
    isPreStart && event.start_date
      ? new Date(event.start_date + "T06:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : null;
  const endDateLabel = !isPreStart && event.end_date
    ? new Date(event.end_date + "T06:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 sm:py-14">
      {/* The worksheet: raised paper card with an inverted ink header band */}
      <div className="rounded-xl border-2 border-ink bg-paper-raised shadow-hard-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 bg-ink">
          <h1 className="font-heading text-lg sm:text-2xl font-semibold text-paper-raised truncate">
            {event.name}
          </h1>
          {startDateLabel && (
            <span className="font-mono text-[11px] sm:text-xs uppercase tracking-wider text-[#CFA74E] shrink-0 hidden sm:block">
              Starts {startDateLabel}
            </span>
          )}
          {endDateLabel && (
            <span className="font-mono text-[11px] sm:text-xs uppercase tracking-wider text-paper/60 shrink-0 hidden sm:block">
              Ends {endDateLabel}
            </span>
          )}
        </div>

        <ProgressBar currentStep={currentStep} eventType={event.type} />

        <div className="px-5 sm:px-8 pb-6 sm:pb-8">
          {ActiveStep ? (
            <ActiveStep />
          ) : (
            <p className="text-ink-soft text-center py-12">
              Step {currentStep} isn&apos;t built yet.
            </p>
          )}
        </div>

        <div className="px-5 sm:px-8 pb-5 text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
            Step {displayStep} of {totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
}
