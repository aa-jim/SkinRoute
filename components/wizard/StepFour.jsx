"use client";

import { useEffect, useRef, useState } from "react";
import { Gem, Layers, Target, Wallet, AlertTriangle, Download, Calendar, CalendarDays, RefreshCw, Scroll } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";
import { todayEventDay } from "@/lib/planOrchestrator";
import { daysUntilStart } from "@/lib/eventHelpers";
import { exportPlanPdf } from "@/lib/exporter";
import SummaryCard from "@/components/ui/SummaryCard";
import ScheduleTable from "@/components/ui/ScheduleTable";
import PackRecommendation from "@/components/ui/PackRecommendation";

const planCache = new Map();

export default function StepFour() {
  const { event, resources, target, ownedItems, goBack, setCurrentStep, startFromToday, setStartFromToday } = useWizard();

  const rawToday = event.start_date ? todayEventDay(event) : 1;
  const activeStartDay = startFromToday ? Math.max(1, rawToday) : 1;
  // event.start_date in the key: a recurring (monthly collector) event resolves
  // to a new window each month, so a cached plan must never cross a month boundary.
  const cacheKey = JSON.stringify([event.id, event.start_date, resources, target, ownedItems, activeStartDay]);

  const [plan, setPlan] = useState(() => planCache.get(cacheKey) ?? { data: null, error: null });
  const [planLoading, setPlanLoading] = useState(() => !planCache.has(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        resources,
        target,
        ownedItems,
        confidence: "realistic",
        overrideStartDay: activeStartDay,
      }),
    })
      .then(async (res) => {
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("application/json")) {
          throw new Error(
            `The plan service came back with an unexpected response (${res.status}). Please try again in a moment.`
          );
        }
        return res.json();
      })
      .then((result) => {
        if (cancelled) return;
        if (result.data) {
          planCache.set(cacheKey, result);
          hasPlanRef.current = true;
        }
        setPlan(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (hasPlanRef.current) {
          setRefreshFailed(true);
        } else {
          setPlan({
            data: null,
            error:
              err instanceof SyntaxError
                ? "The plan service returned an unreadable response. Please try again."
                : err?.message || "Failed to reach plan service",
          });
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
  }, [cacheKey, event.id, resources, target, ownedItems, activeStartDay, retryKey]);

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
        <p className="text-sm text-ink-soft">Calculating your plan...</p>
      </div>
    );
  }

  if (plan.error) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle className="mx-auto mb-3 text-brick" size={28} />
        <p className="text-ink font-medium mb-1">Can&apos;t calculate a plan yet</p>
        <p className="text-sm text-ink-soft mb-6">{plan.error}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-brick text-[#FFFBF2] font-heading font-semibold shadow-hard-sm hover:bg-brick-dark transition-colors"
          >
            <RefreshCw size={15} />
            Try again
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className="px-5 py-2.5 rounded-md border-2 border-ink text-ink font-heading font-semibold hover:bg-ink hover:text-paper-raised transition-colors"
          >
            ← Adjust plan
          </button>
        </div>
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
        <div className="flex flex-col items-center gap-2 mb-6">
          <span className="text-[11px] font-heading uppercase tracking-[0.2em] text-ink-faint">
            Plan start
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStartFromToday(true)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-heading font-bold transition-all ${
                startFromToday
                  ? "bg-ink text-paper-raised border-2 border-ink"
                  : "bg-paper-raised border-2 border-line-strong text-ink-soft hover:border-ink"
              }`}
            >
              <CalendarDays size={14} />
              Start Today (Day {rawToday})
            </button>
            <button
              type="button"
              onClick={() => setStartFromToday(false)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-heading font-bold transition-all ${
                !startFromToday
                  ? "bg-ink text-paper-raised border-2 border-ink"
                  : "bg-paper-raised border-2 border-line-strong text-ink-soft hover:border-ink"
              }`}
            >
              <Calendar size={14} />
              Start from Day 1
            </button>
            {refreshing && (
              <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                <RefreshCw size={12} className="animate-spin" />
                Updating…
              </span>
            )}
          </div>
        </div>
      )}

      {refreshFailed && (
        <p className="text-center text-xs text-brick mb-4">
          Couldn&apos;t refresh the plan — showing the last one.
        </p>
      )}

      {daysUntilStart(event) > 0 && (
        <p className="text-center text-xs text-gold-dark mb-4">
          This event hasn&apos;t started yet. The plan below starts from Day 1 and
          updates automatically once the event is live.
        </p>
      )}

      {/* Draws needed overview (all 3 confidence levels) — hidden for bingo since the card below shows the same info */}
      {!isBingo && p.drawsNeededAll && (
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 text-sm">
          <span className="text-[13px] sm:text-sm text-fern font-semibold">
            Optimistic: {p.drawsNeededAll.optimistic} draws
          </span>
          <span className="text-ink-soft hidden sm:inline">·</span>
          <span className="px-3 py-1 rounded-lg bg-gold/15 border border-gold/40 text-gold-dark font-bold">
            Realistic: {p.drawsNeededAll.realistic} draws
          </span>
          <span className="text-ink-soft hidden sm:inline">·</span>
          <span className="text-[13px] sm:text-sm text-brick font-semibold">
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
              className="flex items-start gap-2 px-4 py-3 rounded-lg bg-brick/10 border border-brick/50 text-sm text-ink"
            >
              <AlertTriangle size={16} className="text-brick shrink-0 mt-0.5" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {isBingo ? (
        <div className="mb-8">
          <div className="rounded-xl border-2 border-plum bg-plum/10 px-5 py-4 mb-4">
            <p className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-plum-dark mb-2">
              {event.id === "aspirants_2026" ? "The Aspirants" : "Bingo — first line completion"}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-heading text-3xl font-bold text-fern">
                  {p.winCondition.draws.lucky[0]}–{p.winCondition.draws.lucky[1]}
                </p>
                <p className="text-[12px] text-ink-soft">Lucky draws</p>
              </div>
              <div>
                <p className="font-heading text-3xl font-bold text-gold-dark">
                  {p.winCondition.draws.realistic}
                </p>
                <p className="text-[12px] text-ink-soft">Realistic draws</p>
              </div>
              <div>
                <p className="font-heading text-3xl font-bold text-brick">
                  {p.winCondition.draws.worst}
                </p>
                <p className="text-[12px] text-ink-soft">Worst case draws</p>
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
            <p className="text-xs text-ink-soft mt-3">
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
              value={(p.daySchedule?.totals?.dia ?? 0).toLocaleString()}
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
                    <span className="block text-sm font-bold text-[#84621A] leading-tight">
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
          className="px-4 sm:px-6 py-2.5 rounded-md border-2 border-ink text-ink font-heading font-semibold hover:bg-ink hover:text-paper-raised transition-colors whitespace-nowrap"
        >
          ← Adjust plan
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-md bg-brick text-[#FFFBF2] font-heading font-semibold shadow-hard-sm hover:bg-brick-dark transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <Download size={16} />
          {downloading ? "Preparing..." : "Download PDF"}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gold/10 border border-gold/50 text-xs text-ink mt-6">
        <Scroll size={14} className="text-gold-dark shrink-0" />
        <span className="text-center">
          <strong className="text-gold-dark">Reminder:</strong> claim any free draw
          token shown in-game each day, even if it&apos;s not listed here.
        </span>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gold/10 border border-gold/50 text-xs text-ink mt-4">
      <AlertTriangle size={14} className="text-gold-dark shrink-0" />
       <span className="text-center">
        Algorithmic plans are estimates and may contain errors. Cross-check against in-game values.
       </span>
      </div>      
    </div>
  );
}
