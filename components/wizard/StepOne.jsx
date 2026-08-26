/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Gem, Ticket, Check, Clock, Info, AlertTriangle } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";

const FP_OPTIONS = [
  { id: "fp_50", label: "50 + 50" },
  { id: "fp_150", label: "150 + 150" },
  { id: "fp_250", label: "250 + 250" },
  { id: "fp_500", label: "500 + 500" },
];

const inputClass =
  "w-full bg-white/70 border border-line-strong rounded-md px-4 py-2.5 text-ink placeholder:text-ink-faint focus:outline-none focus:border-brick focus:ring-1 focus:ring-brick transition-colors";

export default function StepOne() {
  const { event, resources, updateResources, toggleFpClaimed, goNext } =
    useWizard();
  const [dayError, setDayError] = useState(null);

  const showCoa = event.type === "collector";

  const diamondsNum = Number(resources.diamonds);
  const showPassDiaWarning =
    resources.weeklyPasses > 0 &&
    !Number.isNaN(diamondsNum) &&
    diamondsNum < resources.weeklyPasses * 80;

  const setPasses = (delta) => {
    const next = Math.max(0, Math.min(10, resources.weeklyPasses + delta));
    updateResources({ weeklyPasses: next });
    if (next === 0) setDayError(null);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-md bg-ink flex items-center justify-center shrink-0">
          <Gem size={18} className="text-[#CFA74E]" />
        </span>
        <h2 className="font-heading text-xl sm:text-2xl font-semibold text-ink">
          Your current resources
        </h2>
      </div>
      <p className="text-sm text-ink-soft mb-6 ml-12">
        Enter what you already have
      </p>

      <div
        className={`grid grid-cols-1 ${showCoa ? "sm:grid-cols-2" : ""} gap-5 mb-6`}
      >
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-2">
            Diamonds
            <img src="/assets/icons/diamond.webp" alt="" className="w-4 h-4 object-contain" />
          </label>
          <div className="relative max-w-[240px]">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              placeholder="e.g. 500"
              value={resources.diamonds}
              onChange={(e) => updateResources({ diamonds: e.target.value })}
              className={`${inputClass} pr-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
            />
            <img
              src="/assets/icons/diamond.webp"
              alt=""
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 object-contain pointer-events-none"
            />
          </div>
        </div>

        {showCoa && (
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-2">
              Crystal of Aurora (CoA)
              <img src="/assets/icons/coa.webp" alt="" className="w-4 h-4 object-contain" />
            </label>
            <div className="relative max-w-[240px]">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="e.g. 200"
                value={resources.coa}
                onChange={(e) => updateResources({ coa: e.target.value })}
                className={`${inputClass} pr-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
              />
              <img
                src="/assets/icons/coa.webp"
                alt=""
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 object-contain pointer-events-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-7">
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-2">
            Weekly Passes <Ticket size={14} className="text-brick" />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPasses(-1)}
              className="w-9 h-9 rounded-md bg-ink text-paper-raised font-bold flex items-center justify-center hover:bg-brick transition-colors"
            >
              −
            </button>
            <span className="w-12 text-center bg-white/60 border border-line-strong rounded-md py-2 text-ink font-mono font-semibold">
              {resources.weeklyPasses}
            </span>
            <button
              type="button"
              onClick={() => setPasses(1)}
              className="w-9 h-9 rounded-md bg-ink text-paper-raised font-bold flex items-center justify-center hover:bg-brick transition-colors"
            >
              +
            </button>
            <span className="text-xs text-ink-soft">Max 10</span>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-ink mb-2">
            Days remaining <Clock size={14} className="text-brick" />
          </label>
          <div className="relative max-w-[240px]">
            <input
              type="number"
              min="0"
              max={resources.weeklyPasses * 7 || 0}
              inputMode="numeric"
              disabled={resources.weeklyPasses === 0}
              placeholder="e.g. 17"
              value={resources.passDaysRemaining}
              onChange={(e) => {
                updateResources({ passDaysRemaining: e.target.value });
                if (e.target.value) setDayError(null);
              }}
              className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed ${dayError ? "border-brick" : ""}`}
            />
          </div>
          {resources.weeklyPasses > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-ink-soft flex items-start gap-1.5">
                <Info size={14} className="text-gold-dark shrink-0 mt-0.5" />
                <span>
                  Check in-game: Passes → {resources.weeklyPasses} pass{resources.weeklyPasses > 1 ? "es" : ""},{" "}
                  {resources.weeklyPasses * 7} total days. Days remaining = total days left across all passes.
                </span>
              </p>
              {showPassDiaWarning && (
                <p className="text-xs text-brick flex items-start gap-1.5">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    {resources.weeklyPasses} pass{resources.weeklyPasses > 1 ? "es" : ""} already gave you{" "}
                    {resources.weeklyPasses * 80} dia (80 × {resources.weeklyPasses}) instantly, include them
                    in your Diamonds if you haven&apos;t spent them already.
                  </span>
                </p>
              )}
            </div>
          )}
          {dayError && (
            <p className="text-xs text-brick mt-1.5">{dayError}</p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-ink mb-1">
          First-purchase bonuses
        </label>
        <p className="text-xs text-ink-soft mb-3">
          Tap the ones you&apos;ve already claimed
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FP_OPTIONS.map((fp) => {
            const claimed = resources.fpClaimed[fp.id];
            return (
              <button
                key={fp.id}
                type="button"
                onClick={() => toggleFpClaimed(fp.id)}
                className={`relative px-3 py-3 rounded-lg text-sm font-heading font-bold transition-colors ${
                  claimed
                    ? "bg-ink text-paper-raised border-2 border-ink"
                    : "bg-transparent border-2 border-dashed border-ink/50 text-ink hover:border-ink"
                }`}
              >
                {claimed && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brick border-2 border-paper-raised flex items-center justify-center">
                    <Check size={12} className="text-paper-raised" />
                  </span>
                )}
                <span className="flex items-center justify-center gap-1.5">
                  {fp.label}
                  <img
                    src="/assets/icons/diamond-pair.png"
                    alt=""
                    className="w-4 h-4 object-contain shrink-0"
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (resources.weeklyPasses > 0) {
              if (!resources.passDaysRemaining) {
                setDayError("Enter the days remaining on your weekly passes to continue");
                return;
              }
              const maxDays = resources.weeklyPasses * 7;
              if (Number(resources.passDaysRemaining) > maxDays) {
                setDayError(`Days remaining can't exceed ${maxDays} for ${resources.weeklyPasses} ${resources.weeklyPasses > 1 ? "passes" : "pass"}`);
                return;
              }
            }
            const patch = {};
            if (resources.diamonds === "") patch.diamonds = "0";
            if (showCoa && resources.coa === "") patch.coa = "0";
            if (Object.keys(patch).length > 0) updateResources(patch);
            goNext();
          }}
          className="px-6 py-2.5 rounded-md bg-brick text-[#FFFBF2] font-heading font-semibold shadow-hard-sm hover:bg-brick-dark transition-colors"
        >
          Next Step →
        </button>
      </div>
    </div>
  );
}
