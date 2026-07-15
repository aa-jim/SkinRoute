/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Gem, Ticket, Check } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";

const FP_OPTIONS = [
  { id: "fp_50", label: "50 + 50" },
  { id: "fp_150", label: "150 + 150" },
  { id: "fp_250", label: "250 + 250" },
  { id: "fp_500", label: "500 + 500" },
];

const inputClass =
  "w-full bg-navy border border-border-subtle rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-gold transition-colors";

export default function StepOne() {
  const { event, resources, updateResources, toggleFpClaimed, goNext } =
    useWizard();
  const [showDateError, setShowDateError] = useState(false);

  const showCoa = event.type === "collector";

  const setPasses = (delta) => {
    const next = Math.max(0, Math.min(10, resources.weeklyPasses + delta));
    updateResources({ weeklyPasses: next });
    if (next === 0) setShowDateError(false);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg bg-navy flex items-center justify-center shrink-0">
          <Gem size={18} className="text-accent-gold" />
        </span>
        <h2 className="font-heading text-xl sm:text-2xl font-bold text-accent-gold">
          Your current resources
        </h2>
      </div>
      <p className="text-sm text-text-muted mb-6 ml-12">
        Enter what you already have
      </p>

      <div
        className={`grid grid-cols-1 ${showCoa ? "sm:grid-cols-2" : ""} gap-5 mb-6`}
      >
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-text-primary mb-2">
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
            <label className="flex items-center gap-1.5 text-sm font-medium text-text-primary mb-2">
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
          <label className="flex items-center gap-1.5 text-sm font-medium text-text-primary mb-2">
            Weekly Passes <Ticket size={14} className="text-accent-coral" />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPasses(-1)}
              className="w-9 h-9 rounded-lg bg-accent-gold text-navy font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              −
            </button>
            <span className="w-12 text-center bg-navy border border-border-subtle rounded-lg py-2 text-text-primary font-heading font-bold">
              {resources.weeklyPasses}
            </span>
            <button
              type="button"
              onClick={() => setPasses(1)}
              className="w-9 h-9 rounded-lg bg-accent-gold text-navy font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              +
            </button>
            <span className="text-xs text-text-muted">Max 10</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            First weekly bought on
          </label>
          <div className="relative max-w-[240px]">
            <input
              type="date"
              disabled={resources.weeklyPasses === 0}
              value={resources.firstPassDate}
              onChange={(e) => {
                updateResources({ firstPassDate: e.target.value });
                if (e.target.value) setShowDateError(false);
              }}
              className={`${inputClass} [color-scheme:dark] disabled:opacity-40 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:hover:bg-accent-gold/20 [&::-webkit-calendar-picker-indicator]:transition-colors ${
                !resources.firstPassDate ? "[&::-webkit-datetime-edit]:text-transparent" : ""
              } ${showDateError ? "border-accent-coral" : ""}`}
            />
            {!resources.firstPassDate && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none text-sm">
                dd/mm/yyyy
              </span>
            )}
          </div>
          {showDateError && (
            <p className="text-xs text-accent-coral mt-1.5">
              Enter the date of your first weekly pass purchase to continue
            </p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-text-primary mb-1">
          First-purchase bonuses
        </label>
        <p className="text-xs text-text-muted mb-3">
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
                    ? "bg-accent-gold text-navy"
                    : "bg-navy border border-accent-gold text-accent-gold hover:bg-navy-light"
                }`}
              >
                {claimed && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-navy border border-accent-gold flex items-center justify-center">
                    <Check size={12} className="text-accent-gold" />
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
            if (resources.weeklyPasses > 0 && !resources.firstPassDate) {
              setShowDateError(true);
              return;
            }
            const patch = {};
            if (resources.diamonds === "") patch.diamonds = "0";
            if (showCoa && resources.coa === "") patch.coa = "0";
            if (Object.keys(patch).length > 0) updateResources(patch);
            goNext();
          }}
          className="px-6 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity"
        >
          Next Step →
        </button>
      </div>
    </div>
  );
}