"use client";

import { useEffect, useRef, useState } from "react";
import { Gem, Layers, Target, Wallet, AlertTriangle, Download, Calendar, CalendarDays, RefreshCw } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";
import { todayEventDay } from "@/lib/planOrchestrator";
import { exportPlanPdf } from "@/lib/exporter";
import SummaryCard from "@/components/ui/SummaryCard";
import ScheduleTable from "@/components/ui/ScheduleTable";
import PackRecommendation from "@/components/ui/PackRecommendation";

const planCache = new Map();

export default function StepFour() {
  const { event, resources, target, ownedItems, goBack, setCurrentStep, startFromToday, setStartFromToday } = useWizard();

  const rawToday = event.start_date ? todayEventDay(event) : 1;
  const activeStartDay = startFromToday ? Math.max(1, rawToday) : 1;
  const cacheKey = JSON.stringify([event.id, resources, target, ownedItems, activeStartDay]);

  const [plan, setPlan] = useState(() => planCache.get(cacheKey) ?? { data: null, error: null });
  const [planLoading, setPlanLoading] = useState(() => !planCache.has(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const hasPlanRef = useRef(plan.data !== null);

  useEffect(() => {
    const cached = planCache.get(cacheKey);
    if (cached) {
      setPlan(cached);
      setPlanLoading(false);
      return;
    }

    let cancelled = false;
    setRefreshing(hasPlanRef.current);
    setPlanLoading(!hasPlanRef.current);
    setRefreshFailed(false);

    fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        resources,
        target,
        ownedItems,
        confidence: "realistic",
        overrideStartDay: activeStartDay,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        planCache.set(cacheKey, result);
        if (result.data) hasPlanRef.current = true;
        setPlan(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (hasPlanRef.current) {
          setRefreshFailed(true);
        } else {
          setPlan({ data: null, error: err.message || "Failed to reach plan service" });
        }
      })
      .finally(() => {
        if (cancelled) return;
        setPlanLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, event.id, resources, target, ownedItems, activeStartDay]);

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    if (!plan.data) return;
    setDownloading(true);
    try {
      exportPlanPdf(plan.data, event);
    } finally {
      setDownloading(false);
    }
  };

  if (planLoading) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-text-muted">Calculating your plan...</p>
      </div>
    );
  }

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
    <div data-plan-section>
      {/* Schedule view toggle — Start Today vs Start from Day 1 */}
      {rawToday > 1 && (
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setStartFromToday(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
              startFromToday
                ? "bg-accent-gold/20 border border-accent-gold/50 text-accent-gold"
                : "bg-navy-light border border-border-subtle text-text-muted hover:text-text-primary"
            }`}
          >
            <CalendarDays size={14} />
            Start Today (Day {rawToday})
          </button>
          <button
            type="button"
            onClick={() => setStartFromToday(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
              !startFromToday
                ? "bg-accent-gold/20 border border-accent-gold/50 text-accent-gold"
                : "bg-navy-light border border-border-subtle text-text-muted hover:text-text-primary"
            }`}
          >
            <Calendar size={14} />
            Start from Day 1
          </button>
          {refreshing && (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <RefreshCw size={12} className="animate-spin" />
              Updating…
            </span>
          )}
        </div>
      )}

      {refreshFailed && (
        <p className="text-center text-xs text-accent-coral mb-4">
          Couldn&apos;t refresh the plan — showing the last one.
        </p>
      )}

      {/* Draws needed overview (all 3 confidence levels) — hidden for bingo since the card below shows the same info */}
      {!isBingo && p.drawsNeededAll && (
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 text-sm">
          <span className="text-[13px] sm:text-sm text-accent-green font-semibold">
            Optimistic: {p.drawsNeededAll.optimistic} draws
          </span>
          <span className="text-text-muted hidden sm:inline">·</span>
          <span className="px-3 py-1 rounded-lg bg-accent-gold/15 border border-accent-gold/40 text-accent-gold font-bold">
            Realistic: {p.drawsNeededAll.realistic} draws
          </span>
          <span className="text-text-muted hidden sm:inline">·</span>
          <span className="text-[13px] sm:text-sm text-accent-coral font-semibold">
            Worst case: {p.drawsNeededAll.worst} draws
          </span>
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
            <p className="text-sm font-heading font-bold text-[#C9B8FF] uppercase tracking-wide mb-2">
              {event.id === "aspirants_2026" ? "The Aspirants" : "Bingo — first line completion"}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-heading text-3xl font-bold text-accent-green">
                  {p.winCondition.draws.lucky[0]}–{p.winCondition.draws.lucky[1]}
                </p>
                <p className="text-[12px] text-text-muted">Lucky draws</p>
              </div>
              <div>
                <p className="font-heading text-3xl font-bold text-accent-gold">
                  {p.winCondition.draws.realistic}
                </p>
                <p className="text-[12px] text-text-muted">Realistic draws</p>
              </div>
              <div>
                <p className="font-heading text-3xl font-bold text-accent-coral">
                  {p.winCondition.draws.worst}
                </p>
                <p className="text-[12px] text-text-muted">Worst case draws</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="Total BDT"
              value={`৳${(p.recharge?.totalBdt ?? 0).toLocaleString()}`}
              icon={Wallet}
              accent="gold"
            />
            <SummaryCard
              label="Diamonds (lucky)"
              value={`${p.winCondition.diamondCost.lucky[0].toLocaleString()}–${p.winCondition.diamondCost.lucky[1].toLocaleString()}`}
              icon={Gem}
              accent="green"
            />
            <SummaryCard
              label="Diamonds (realistic)"
              value={p.winCondition.diamondCost.realistic.toLocaleString()}
              icon={Gem}
              accent="gold"
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
          {isCollector ? (
            <div className="flex flex-col gap-3">
              <SummaryCard
                compact
                label="Diamonds Needed"
                value={(p.daySchedule?.totals?.dia ?? 0).toLocaleString()}
                icon={Gem}
                accent="blue"
              />
              <SummaryCard
                compact
                label="CoA Needed"
                value={(p.daySchedule?.totals?.coa ?? 0).toLocaleString()}
                icon={(props) => <img src="/assets/icons/coa-star.png" alt="" className="w-3.5 h-3.5 object-contain" />}
                accent="amber"
              />
            </div>
          ) : (
            <SummaryCard
              label="Diamonds Needed"
              value={(p.totalDiamondsForPlan ?? 0).toLocaleString()}
              icon={Gem}
              accent="blue"
            />
          )}
          <SummaryCard
            label="Total Draws"
            value={p.drawsNeeded.draws.toLocaleString()}
            icon={Layers}
            accent="green"
          />
          <SummaryCard
            label="Target Skin"
            value={
              p.target.outfit1 && p.target.skin.outfit1_variant
                ? <>
                    {p.target.skin.name}
                    <span className="block text-sm font-bold text-[#ffa245] leading-tight">
                      + {p.target.skin.outfit1_variant.name}
                    </span>
                  </>
                : p.target.skin.name
            }
            sublabel={p.target.skin.hero}
            icon={Target}
            accent="coral"
          />
        </div>
      )}

      {/* Recharge plan — all event types that have a full day schedule */}
      {p.daySchedule && p.recharge && p.recharge.totalDia > 0 && (
        <PackRecommendation recharge={p.recharge} eventDurationDays={event.duration_days} />
      )}

      {/* Day-by-day schedule — all event types that have full day schedule */}
      {p.daySchedule && (
        <ScheduleTable
          plan={p}
          event={event}
          startDay={p.startDay ?? activeStartDay}
        />
      )}

      <div className="flex justify-between gap-3 mt-8">
        <button
          type="button"
          onClick={() => setCurrentStep(event.type === "bingo" ? 2 : 3)}
          className="px-4 sm:px-6 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          ← Adjust plan
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-lg bg-accent-gold text-navy font-heading font-bold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
        >
          <Download size={16} />
          {downloading ? "Preparing..." : "Download PDF"}
        </button>
      </div>

      <p className="text-xs text-text-muted text-center mt-6">
        Reminder: claim any free draw token shown in-game each day, even if it&apos;s not listed here.
      </p>

      <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-amber/10 border border-accent-amber/40 text-xs text-text-primary mt-4">
      <AlertTriangle size={14} className="text-accent-amber shrink-0" />
       <span className="text-center">
        Algorithmic plans are estimates and may contain errors. Cross-check against in-game values.
       </span>
      </div>      
    </div>
  );
}