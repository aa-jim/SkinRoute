"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Themed Crest / Legend / Special row builder — reads plan.daySchedule.rows
 * directly (built by planOrchestrator.js's buildThemedCrestDaySchedule()),
 * same real-simulation pattern as buildCollectorRows() but diamonds-only
 * (no CoA column).
 */
function buildThemedCrestRows(plan, event) {
  const daySchedule = plan.daySchedule;
  if (!daySchedule?.rows) return null;

  const duration = event.duration_days;
  let cumulative = 0;
  return daySchedule.rows.map((r) => {
    const isFinal = r.day === duration;
    let tag = null;
    if (isFinal) tag = "final";
    else if (r.notes.some((n) => n.includes("spend") || n.includes("recharge") || n.includes("login task"))) tag = "supply";
    else if (r.notes.some((n) => n.includes("insufficient balance") || n.includes("Short"))) tag = "gap";

    cumulative += r.draws;

    return {
      day: r.day,
      draws: r.draws,
      cumulative,
      dia: r.diaSpent,
      action: r.notes.join(" · "),
      tag,
    };
  });
}

/**
 * Collector-specific row builder — reads plan.daySchedule.rows directly (built by
 * planOrchestrator.js's buildCollectorDaySchedule()) instead of re-deriving day
 * actions from phase boundaries. Shows real per-day draw count + diamond/CoA spend,
 * matching the reference spreadsheet format (Date | Description | Draws | Dia | CoA).
 */
function buildCollectorRows(plan, event) {
  const daySchedule = plan.daySchedule;
  if (!daySchedule?.rows) return null;

  const duration = event.duration_days;
  let cumulative = 0;
  return daySchedule.rows.map((r) => {
    const isFinal = r.day === duration;
    let tag = null;
    if (isFinal) tag = "final";
    else if (r.notes.some((n) => n.includes("Starlight"))) tag = "supply";
    else if (r.notes.some((n) => n.includes("insufficient balance"))) tag = "gap";

    cumulative += r.draws;

    return {
      day: r.day,
      draws: r.draws,
      cumulative,
      dia: r.diaSpent,
      coa: r.coaSpent,
      action: r.notes.join(" · "),
      tag,
    };
  });
}

const TAG_STYLES = {
  supply: "bg-[#26004D]/25 border-l-2 border-[#7F77DD]",
  final: "bg-accent-green/10 border-l-2 border-accent-green",
  gap: "bg-accent-coral/10 border-l-2 border-accent-coral",
};

export default function ScheduleTable({ plan, event }) {
  const [expanded, setExpanded] = useState(false);
  const isCollector = plan.eventType === "collector";
  const collectorRows = isCollector ? buildCollectorRows(plan, event) : null;

  // ---------------------------------------------------------------------
  // Collector layout — extra Draws/Dia/CoA columns + totals footer, matches
  // the reference spreadsheet (Date | Description | Draw | Dia Spend | CoA Spend).
  // ---------------------------------------------------------------------
  if (collectorRows) {
    const visibleRows = expanded ? collectorRows : collectorRows.slice(0, 10);
    const totals = plan.daySchedule.totals;

    return (
      <div className="mb-6">
        <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
          Day-by-Day Schedule
        </h3>
        <div className="rounded-xl border border-border-subtle bg-navy overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-light text-text-muted text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-medium w-14">Day</th>
                <th className="text-left px-4 py-2.5 font-medium">Action</th>
                <th className="text-right px-4 py-2.5 font-medium w-16">Draws</th>
                <th className="text-right px-4 py-2.5 font-medium w-20">Cumulative</th>
                <th className="text-right px-4 py-2.5 font-medium w-20">Dia</th>
                <th className="text-right px-4 py-2.5 font-medium w-20">CoA</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.day} className={`border-t border-border-subtle ${row.tag ? TAG_STYLES[row.tag] : ""}`}>
                  <td className="px-4 py-2.5 text-text-muted font-heading font-bold">{row.day}</td>
                  <td className="px-4 py-2.5 text-text-primary">{row.action}</td>
                  <td className="px-4 py-2.5 text-right text-text-primary">{row.draws}</td>
                  <td className="px-4 py-2.5 text-right text-accent-gold font-semibold">{row.cumulative}</td>
                  <td className="px-4 py-2.5 text-right text-accent-blue">{row.dia > 0 ? row.dia.toLocaleString() : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-accent-teal">{row.coa > 0 ? row.coa.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-subtle bg-navy-light">
                <td colSpan={2} className="px-4 py-2.5 text-text-primary font-heading font-bold">Total</td>
                <td className="px-4 py-2.5 text-right text-text-primary font-heading font-bold">{totals.draws}</td>
                <td className="px-4 py-2.5 text-right text-accent-gold font-heading font-bold">{totals.draws}</td>
                <td className="px-4 py-2.5 text-right text-accent-blue font-heading font-bold">{totals.dia.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-accent-teal font-heading font-bold">{totals.coa.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {collectorRows.length > 10 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-accent-gold hover:opacity-80 transition-opacity"
          >
            {expanded ? (
              <>Show less <ChevronUp size={14} /></>
            ) : (
              <>Show all {collectorRows.length} days <ChevronDown size={14} /></>
            )}
          </button>
        )}

        <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#7F77DD]/60" /> Starlight day
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

  // ---------------------------------------------------------------------
  // Themed Crest / Legend / Special layout — real simulation, same format
  // as Collector's table minus the CoA column (diamonds-only event type).
  // ---------------------------------------------------------------------
  const themedRows = buildThemedCrestRows(plan, event);
  const rows = themedRows ?? [];
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  const themedTotals = plan.daySchedule?.totals;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
        Day-by-Day Schedule
      </h3>
      <div className="rounded-xl border border-border-subtle bg-navy overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-light text-text-muted text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium w-14">Day</th>
              <th className="text-left px-4 py-2.5 font-medium">Action</th>
              <th className="text-right px-4 py-2.5 font-medium w-16">Draws</th>
              <th className="text-right px-4 py-2.5 font-medium w-20">Cumulative</th>
              <th className="text-right px-4 py-2.5 font-medium w-20">Dia</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.day} className={`border-t border-border-subtle ${row.tag ? TAG_STYLES[row.tag] : ""}`}>
                <td className="px-4 py-2.5 text-text-muted font-heading font-bold">{row.day}</td>
                <td className="px-4 py-2.5 text-text-primary">{row.action}</td>
                <td className="px-4 py-2.5 text-right text-text-primary">{row.draws}</td>
                <td className="px-4 py-2.5 text-right text-accent-gold font-semibold">{row.cumulative}</td>
                <td className="px-4 py-2.5 text-right text-accent-blue">{row.dia > 0 ? row.dia.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
          {themedTotals && (
            <tfoot>
              <tr className="border-t-2 border-border-subtle bg-navy-light">
                <td colSpan={2} className="px-4 py-2.5 text-text-primary font-heading font-bold">Total</td>
                <td className="px-4 py-2.5 text-right text-text-primary font-heading font-bold">{themedTotals.draws}</td>
                <td className="px-4 py-2.5 text-right text-accent-gold font-heading font-bold">{themedTotals.draws}</td>
                <td className="px-4 py-2.5 text-right text-accent-blue font-heading font-bold">{themedTotals.dia.toLocaleString()}</td>
              </tr>
            </tfoot>
          )}
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