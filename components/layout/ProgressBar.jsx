const STEPS = [
  { n: 1, label: "Resources" },
  { n: 2, label: "Target" },
  { n: 3, label: "Prize Pool" },
  { n: 4, label: "Result" },
];

// Route-style stepper: dashed connectors between stops (done = fern), stamp
// circles for each stop. Labels only from sm: up (mobile shows circles only).
export default function ProgressBar({ currentStep, eventType }) {
  const visibleSteps = eventType === "bingo"
    ? STEPS.filter((s) => s.n !== 3).map((s, i) => ({
        ...s,
        displayN: i + 1,
        label: s.n === 2 ? "Event Skins" : s.label,
      }))
    : STEPS.map((s) => ({ ...s, displayN: s.n }));

  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-6 px-4 flex-wrap">
      {visibleSteps.map((step, i) => {
        const isActive = step.n === currentStep;
        const isDone = step.n < currentStep;

        return (
          <div key={step.n} className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-mono text-xs sm:text-sm font-semibold shrink-0 border-2 ${
                  isDone
                    ? "bg-fern border-fern text-paper-raised"
                    : isActive
                      ? "bg-brick border-brick text-paper-raised shadow-hard-sm"
                      : "bg-paper-raised border-line-strong text-ink-faint"
                }`}
              >
                {isDone ? (
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3.5]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                ) : (
                  step.displayN
                )}
              </span>
              <span
                className={`hidden sm:inline text-[11px] uppercase tracking-[0.14em] font-medium ${
                  isActive
                    ? "text-ink"
                    : isDone
                      ? "text-ink-soft"
                      : "text-ink-faint"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < visibleSteps.length - 1 && (
              <span
                className={`w-5 sm:w-10 border-t-2 border-dashed shrink-0 ${
                  step.n < currentStep ? "border-fern" : "border-line-strong"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
