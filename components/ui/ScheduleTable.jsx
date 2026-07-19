"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Builds display rows from whichever plan shape is passed (collector vs
 * themed_crest/legend/special). Each row: { day, action, tag, tagColor }
 * tag values: "supply" (purple tint), "final" (green tint), "gap" (coral tint), null (default)
 */
function buildRows(plan, event) {
  const rows = [];
  const duration = event.duration_days;
  const isCollector = plan.eventType === "collector";

  // Map supply window day ranges for tinting.
  const supplyDayRanges = (plan.supplyWindows ?? []).map((w) => [w.startDay, w.endDay, w.phase]);
  const dayInSupplyWindow = (day) => supplyDayRanges.find(([s, e]) => day >= s && day <= e);

  // Balance gap days (themed crest only) for coral tint.
  const gapDays = new Set((plan.idealPlan?.balanceGaps?.gaps ?? []).map((g) => g.day));

  for (let day = 1; day <= duration; day++) {
    const isFinal = day === duration;
    const supplyWindow = dayInSupplyWindow(day);
    const isGap = gapDays.has(day);

    let action = "Daily 1x draw";
    let tag = null;

    if (isGap) {
      tag = "gap";
      action = "⚠ Insufficient diamonds for daily 1x — recharge needed";
    } else if (isFinal) {
      tag = "final";
      action = "Daily 1x + final push (close remaining gap)";
    } else if (supplyWindow) {
      tag = "supply";
      action = `Daily 1x — Premium Supply Phase ${supplyWindow[2]} active`;
    }

    // Starlight / spend-window notes (collector only)
    let note = null;
    if (isCollector && plan.starlight?.day === day) {
      note = "Buy Starlight (+300 CoA, +2 keys)";
    }
    if (isCollector && plan.spendPlan?.phase1 && day === plan.spendPlan.phase1.endDay) {
      note = note ? `${note}; diamond spend window closes` : "Diamond spend window closes → switch to CoA-only";
    }

    // Recharge window notes (themed crest only)
    if (!isCollector && supplyWindow) {
      const phasePlan = (plan.idealPlan?.phases ?? []).find((p) => p.phase === supplyWindow[2]);
      if (phasePlan && day === supplyWindow[0]) {
        note = phasePlan.note;
      }
    }

    rows.push({ day, action, tag, note });
  }

  return rows;
}

const TAG_STYLES = {
  supply: "bg-[#26004D]/25 border-l-2 border-[#7F77DD]",
  final: "bg-accent-green/10 border-l-2 border-accent-green",
  gap: "bg-accent-coral/10 border-l-2 border-accent-coral",
};

export default function ScheduleTable({ plan, event }) {
  const [expanded, setExpanded] = useState(false);
  const rows = buildRows(plan, event);
  const visibleRows = expanded ? rows : rows.slice(0, 10);

  return (
    <div className="mb-6">
      <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
        Day-by-Day Schedule
      </h3>
      <div className="rounded-xl border border-border-subtle bg-navy overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-light text-text-muted text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium w-16">Day</th>
              <th className="text-left px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.day} className={`border-t border-border-subtle ${row.tag ? TAG_STYLES[row.tag] : ""}`}>
                <td className="px-4 py-2.5 text-text-muted font-heading font-bold">{row.day}</td>
                <td className="px-4 py-2.5 text-text-primary">
                  {row.action}
                  {row.note && <p className="text-xs text-accent-gold mt-0.5">{row.note}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-accent-gold hover:opacity-80 transition-opacity"
        >
          {expanded ? (
            <>Show less <ChevronUp size={14} /></>
          ) : (
            <>Show all {rows.length} days <ChevronDown size={14} /></>
          )}
        </button>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#7F77DD]/60" /> Premium Supply window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent-green/60" /> Final push
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent-coral/60" /> Balance gap
        </span>
      </div>
    </div>
  );
}