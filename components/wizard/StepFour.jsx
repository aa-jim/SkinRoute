"use client";

import { useMemo, useState } from "react";
import { Gem, Layers, Target, Wallet, AlertTriangle } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";
import { buildPlan } from "@/lib/planOrchestrator";
import SummaryCard from "@/components/ui/SummaryCard";
import ScheduleTable from "@/components/ui/ScheduleTable";
import PackRecommendation from "@/components/ui/PackRecommendation";

const CONFIDENCE_OPTIONS = [
  { id: "optimistic", label: "Optimistic" },
  { id: "realistic", label: "Realistic" },
  { id: "worst", label: "Worst Case" },
];

export default function StepFour() {
  const { event, resources, target, ownedItems, goBack, setCurrentStep } = useWizard();
  const [confidence, setConfidence] = useState("realistic");

  const plan = useMemo(() => {
    try {
      return { data: buildPlan(event, resources, target, ownedItems, confidence), error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  }, [event, resources, target, ownedItems, confidence]);

  if (plan.error) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle className="mx-auto mb-3 text-accent-coral" size={28} />
        <p className="text-text-primary font-medium mb-1">Can&apos;t calculate a plan yet</p>
        <p className="text-sm text-text-muted mb-6">{plan.error}</p>
        <button
          type="button"
          onClick={() => setCurrentStep(2)}
          className="px-5 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity"
        >
          ← Adjust plan
        </button>
      </div>
    );
  }

  const p = plan.data;
  const isBingo = p.eventType === "bingo";
  const isCollector = p.eventType === "collector";

  return (
    <div>
      {/* Confidence toggle */}
      {!isBingo && (
        <div className="flex items-center gap-2 mb-6">
          {CONFIDENCE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setConfidence(opt.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-heading font-bold transition-colors ${
                confidence === opt.id
                  ? "bg-accent-gold text-navy"
                  : "bg-navy border border-border-subtle text-text-muted hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Warnings */}
      {p.warnings?.length > 0 && (
        <div className="mb-6 space-y-2">
          {p.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-4 py-3 rounded-lg bg-accent-coral/10 border border-accent-coral/40 text-sm text-text-primary"
            >
              <AlertTriangle size={16} className="text-accent-coral shrink-0 mt-0.5" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {isBingo ? (
        <div className="mb-8">
          <div className="rounded-xl border-2 border-[#7F77DD] bg-[#26004D]/30 px-5 py-4 mb-4">
            <p className="text-xs font-heading font-bold text-[#C9B8FF] uppercase tracking-wide mb-2">
              Bingo — first line completion
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-heading text-xl font-bold text-accent-green">
                  {p.winCondition.draws.lucky[0]}–{p.winCondition.draws.lucky[1]}
                </p>
                <p className="text-[11px] text-text-muted">Lucky draws</p>
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-accent-gold">
                  {p.winCondition.draws.realistic}
                </p>
                <p className="text-[11px] text-text-muted">Realistic draws</p>
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-accent-coral">
                  {p.winCondition.draws.worst}
                </p>
                <p className="text-[11px] text-text-muted">Worst case draws</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              label="Diamonds (realistic)"
              value={p.winCondition.diamondCost.realistic.toLocaleString()}
              icon={Gem}
              accent="gold"
            />
            <SummaryCard
              label="Diamonds (lucky)"
              value={`${p.winCondition.diamondCost.lucky[0].toLocaleString()}–${p.winCondition.diamondCost.lucky[1].toLocaleString()}`}
              icon={Gem}
              accent="green"
            />
            <SummaryCard
              label="Diamonds (worst)"
              value={p.winCondition.diamondCost.worst.toLocaleString()}
              icon={Gem}
              accent="coral"
            />
          </div>
          {p.winCondition.pity.hasPity && (
            <p className="text-xs text-text-muted mt-3">
              Guaranteed: {p.winCondition.pity.pitySkinName} on first 10x draw if unowned.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <SummaryCard
            label="Total BDT"
            value={`৳${(p.recharge?.totalBdt ?? 0).toLocaleString()}`}
            icon={Wallet}
            accent="gold"
          />
          <SummaryCard
            label="Diamonds Needed"
            value={(p.totalDiamondsForPlan ?? 0).toLocaleString()}
            sublabel={
              isCollector
                ? `${(p.daySchedule?.totals?.coa ?? 0).toLocaleString()} CoA spent`
                : `${(p.netDiamondsNeeded?.netDiamondsNeeded ?? 0).toLocaleString()} extra needed`
            }
            icon={Gem}
            accent="blue"
          />
          <SummaryCard
            label="Total Draws"
            value={p.drawsNeeded.draws.toLocaleString()}
            icon={Layers}
            accent="green"
          />
          <SummaryCard
            label="Target Skin"
            value={p.target.skin.name}
            sublabel={p.target.skin.hero}
            icon={Target}
            accent="coral"
          />
        </div>
      )}

      {/* Recharge plan (themed_crest/legend/special only — collector uses CoA priority text plan) */}
      {!isBingo && p.recharge && p.recharge.totalDia > 0 && (
        <PackRecommendation recharge={p.recharge} eventDurationDays={event.duration_days} />
      )}

      {/* Day-by-day schedule */}
      {!isBingo && (
        <ScheduleTable
          plan={p}
          event={event}
        />
      )}

      <div className="flex justify-between gap-3 mt-8">
        <button
          type="button"
          onClick={() => setCurrentStep(3)}
          className="px-4 sm:px-6 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          ← Adjust plan
        </button>
      </div>

      <p className="text-xs text-text-muted text-center mt-6">
        Reminder: claim any free draw token shown in-game each day, even if it&apos;s not listed here.
      </p>
    </div>
  );
}