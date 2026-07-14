const STEPS = [
  { n: 1, label: "Resources" },
  { n: 2, label: "Target" },
  { n: 3, label: "Prize Pool" },
  { n: 4, label: "Result" },
];

export default function ProgressBar({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 py-6 px-4 flex-wrap">
      {STEPS.map((step, i) => {
        const isActive = step.n === currentStep;
        const isDone = step.n < currentStep;

        return (
          <div key={step.n} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm font-heading font-bold shrink-0 ${
                  isDone
                    ? "bg-accent-green text-navy"
                    : isActive
                      ? "bg-accent-gold text-navy"
                      : "bg-navy text-text-muted border border-border-subtle"
                }`}
              >
                {/* Conditionally show a checkmark icon if done, otherwise show the step number */}
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
                  step.n
                )}
              </span>
              <span
                className={`text-sm sm:text-base font-medium hidden xs:inline ${
                  isActive ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="w-6 sm:w-10 h-px bg-border-subtle shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}