"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Gem, Key, Scroll, Sparkles, Wallet, Ticket, AlertTriangle, Coins, Clock } from "lucide-react";

function dayToDate(startDate, day) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + day - 1);
  const month = d.getMonth() + 1;
  const date = d.getDate();
  return `${month}/${date}`;
}

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
  let cumulativeDia = 0;
  return daySchedule.rows.map((r) => {
    const isFinal = r.day === duration;
    let tag = null;
    if (isFinal) tag = "final";
    else if (r.notes.some((n) => n.includes("Premium Supply") || n.includes("All tasks completed") || n.includes("Buy"))) tag = "supply";
    else if (r.notes.some((n) => n.includes("insufficient balance") || n.includes("Short"))) tag = "gap";

    cumulative += r.draws;
    cumulativeDia += r.diaSpent;

    return {
      day: r.day,
      date: dayToDate(event.start_date, r.day),
      draws: r.draws,
      cumulative,
      dia: r.diaSpent,
      cumulativeDia,
      actionLines: r.notes,
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
  let cumulativeDia = 0;
  let cumulativeCoa = 0;
  return daySchedule.rows.map((r) => {
    const isFinal = r.day === duration;
    let tag = null;
    if (isFinal) tag = "final";
    else if (r.notes.some((n) => n.includes("Starlight"))) tag = "supply";
    else if (r.notes.some((n) => n.includes("insufficient balance"))) tag = "gap";

    cumulative += r.draws;
    cumulativeDia += r.diaSpent;
    cumulativeCoa += r.coaSpent;

    return {
      day: r.day,
      date: dayToDate(event.start_date, r.day),
      draws: r.draws,
      cumulative,
      dia: r.diaSpent,
      coa: r.coaSpent,
      cumulativeDia,
      cumulativeCoa,
      actionLines: r.notes,
      tag,
    };
  });
}

/**
 * Renders a row's notes as separate lines instead of a middot-joined wall of
 * text. Bullet sub-lines (from the "claim all keys" block, prefixed with two
 * spaces + •) get extra indent; the "don't claim yet" reminder is muted; the
 * "claim all keys" header and totals line are bolded for scan-ability.
 */
function actionIcon(line) {
  if (line.includes("Buy") && line.includes("weekly pass")) return <Ticket size={14} className="text-accent-coral shrink-0 mt-0.5" />;
  if (line.startsWith("Claim") && line.includes("(Starlight)")) return <Key size={14} className="text-accent-gold shrink-0 mt-0.5" />;
  if (line.includes("Starlight")) return <Sparkles size={14} className="text-[#AFA9EC] shrink-0 mt-0.5" />;
  if (line.includes("Recharge") || (line.includes("Buy") && line.includes("dias pack"))) return <Wallet size={14} className="text-accent-green shrink-0 mt-0.5" />;
  if (line.startsWith("Claim") && line.includes("token")) return <Scroll size={14} className="text-accent-gold shrink-0 mt-0.5" />;
  if (line.startsWith("Claim")) return <Key size={14} className="text-accent-gold shrink-0 mt-0.5" />;
  if (line.includes("Don't claim")) return <Clock size={14} className="text-accent-coral shrink-0 mt-0.5" />;
  if (line.includes("recharge task") && line.includes("completed")) return <Coins size={14} className="text-accent-gold shrink-0 mt-0.5" />;
  if (line.includes("spend task") && line.includes("completed")) return <Coins size={14} className="text-accent-gold shrink-0 mt-0.5" />;
  if (line.includes("insufficient balance") || line.includes("No draw")) return <AlertTriangle size={14} className="text-accent-coral shrink-0 mt-0.5" />;
  if (line.includes("(CoA)") || line.includes("Final push (CoA)")) {
    return <img src="/assets/icons/coa-star.png" alt="" className="w-3.5 h-3.5 shrink-0 mt-0.5 object-contain" />;
  }
  if (line.includes("daily") || line.includes("10x") || line.includes("10-draw") || line.includes("single") || line.includes("Final push")) {
    return <Gem size={14} className="text-accent-blue shrink-0 mt-0.5" />;
  }
  return null;
}

function ActionCell({ lines }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const isBullet = line.startsWith("  \u2022");
        const isDontClaim = line.includes("Don't claim any tokens");
        const isClaimHeader = line === "Claim all keys for this window:";
        const isClaimTotal = line.includes("free draw") && line.includes("total \u2192");
        const icon = isBullet ? null : actionIcon(line);
        return (
          <p
            key={i}
            className={`flex items-start gap-1.5 ${
              isBullet
                ? "pl-4 text-text-muted"
                : isDontClaim
                ? "font-bold text-accent-coral"
                : isClaimHeader || isClaimTotal
                ? "font-semibold text-accent-green"
                : "text-text-primary"
            }`}
          >
            {icon}
            <span className="text-[13px] sm:text-sm">{line}</span>
          </p>
        );
      })}
    </div>
  );
}

const TAG_STYLES = {
  supply: "bg-[#26004D]/25 border-l-2 border-[#7F77DD]",
  final: "bg-accent-green/10 border-l-2 border-accent-green",
  gap: "bg-accent-coral/10 border-l-2 border-accent-coral",
};

/**
 * Icon legend — shown once above the schedule, scoped per event type so only
 * icons that actually appear for that event's action set are listed (Collector
 * has Starlight/keys/CoA-draws; Themed Crest has recharge/tokens instead).
 */
function IconLegend({ isCollector }) {
  const items = isCollector
    ? [
        { icon: <Gem size={13} className="text-accent-blue" />, label: "Draw (diamonds)" },
        { icon: <img src="/assets/icons/coa-star.png" alt="" className="w-3.5 h-3.5 object-contain" />, label: "Draw (CoA)" },
        { icon: <Ticket size={13} className="text-accent-coral" />, label: "Buy weekly pass" },
        { icon: <Sparkles size={13} className="text-[#AFA9EC]" />, label: "Starlight" },
        { icon: <Key size={13} className="text-accent-gold" />, label: "Claim keys" },
        { icon: <AlertTriangle size={13} className="text-accent-coral" />, label: "Insufficient balance" },
      ]
    : [
        { icon: <Gem size={13} className="text-accent-blue" />, label: "Draw (diamonds)" },
        { icon: <Ticket size={13} className="text-accent-coral" />, label: "Buy weekly pass" },
        { icon: <Wallet size={13} className="text-accent-green" />, label: "Recharge / buy pack" },
        { icon: <Coins size={13} className="text-accent-gold" />, label: "Recharge/spend task completed" },
        { icon: <Clock size={13} className="text-accent-coral" />, label: "Don't claim tokens yet" },
        { icon: <Scroll size={13} className="text-accent-gold" />, label: "Claim tokens" },
        { icon: <AlertTriangle size={13} className="text-accent-coral" />, label: "Insufficient balance" },
      ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 text-[11px] text-text-muted">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.icon}
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Mobile-only stacked card view (< sm breakpoint) — one card per day, replacing
 * the cramped 4-6 column table on narrow screens. Reuses the same row objects
 * as the table (day/draws/cumulative/dia/coa/actionLines/tag), just laid out
 * vertically instead of in table cells. Table itself stays for sm: and up.
 */
function DayCards({ rows, showCoa }) {
  return (
    <div className="sm:hidden flex flex-col gap-2.5">
      {rows.map((row) => (
        <div
          key={row.day}
          className={`rounded-xl border border-border-subtle bg-navy px-4 py-3 ${row.tag ? TAG_STYLES[row.tag] : ""}`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-heading font-bold text-text-primary text-sm">{row.date}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-text-muted bg-navy-light px-2 py-0.5 rounded">
                {row.draws} draw{row.draws === 1 ? "" : "s"}
              </span>
              <span className="text-[11px] text-accent-coral font-semibold bg-navy-light px-2 py-0.5 rounded">
                total {row.cumulative}
              </span>
            </div>
          </div>
          <ActionCell lines={row.actionLines} />
          {(row.dia > 0 || (showCoa && row.coa > 0)) && (
            <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-border-subtle">
              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Spent today</p>
                {row.dia > 0 && <p className="text-[11px] text-accent-blue m-0">{row.dia.toLocaleString()} dia</p>}
                {showCoa && row.coa > 0 && <p className="text-[11px] text-accent-gold m-0">{row.coa.toLocaleString()} CoA</p>}
              </div>
              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Total spent</p>
                {row.cumulativeDia > 0 && <p className="text-[11px] text-accent-blue m-0">{row.cumulativeDia.toLocaleString()} dia</p>}
                {showCoa && row.cumulativeCoa > 0 && <p className="text-[11px] text-accent-gold m-0">{row.cumulativeCoa.toLocaleString()} CoA</p>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ScheduleTable({ plan, event, startDay = 1 }) {
  const [expanded, setExpanded] = useState(false);
  const isCollector = plan.eventType === "collector";
  const showFromToday = startDay > 1;

  function filterRows(rows) {
    const filtered = rows.filter((r) => r.day >= startDay);
    if (filtered.length === 0) return filtered;
    let cumDraws = 0;
    let cumDia = 0;
    let cumCoa = 0;
    return filtered.map((r) => {
      cumDraws += r.draws;
      cumDia += r.diaSpent ?? r.dia;
      cumCoa += r.coaSpent ?? r.coa ?? 0;
      return { ...r, cumulative: cumDraws, cumulativeDia: cumDia, cumulativeCoa: cumCoa };
    });
  }

  const collectorRows = isCollector ? filterRows(buildCollectorRows(plan, event) ?? []) : null;

  // ---------------------------------------------------------------------
  // Collector layout — extra Draws/Dia/CoA columns + totals footer, matches
  // the reference spreadsheet (Date | Description | Draw | Dia Spend | CoA Spend).
  // ---------------------------------------------------------------------
  if (collectorRows) {
    const visibleRows = expanded ? collectorRows : collectorRows.slice(0, 10);
    const displayTotals = visibleRows.reduce(
      (a, r) => ({ draws: a.draws + r.draws, dia: a.dia + r.dia, coa: a.coa + (r.coa ?? 0) }),
      { draws: 0, dia: 0, coa: 0 }
    );

    return (
      <div className="mb-6">
        <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
          Day-by-Day Schedule
        </h3>
        {showFromToday && (
          <p className="text-xs text-accent-gold mb-3">
            From Day {startDay} ({collectorRows.length > 0 ? collectorRows[0].date : ""})
          </p>
        )}
        <IconLegend isCollector />
        <DayCards rows={visibleRows} showCoa />

        <div className="hidden sm:block rounded-xl border border-border-subtle bg-navy overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-light text-text-muted text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-medium w-16">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Action</th>
                <th className="text-right px-4 py-2.5 font-medium w-16">Draws</th>
                <th className="text-right px-4 py-2.5 font-medium w-20">Total</th>
                <th className="text-right px-4 py-2.5 font-medium w-20">Dia</th>
                <th className="text-right px-4 py-2.5 font-medium w-20">CoA</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.day} className={`border-t border-border-subtle ${row.tag ? TAG_STYLES[row.tag] : ""}`}>
                  <td className="px-4 py-2.5 text-text-muted font-heading font-bold">{row.date}</td>
                  <td className="px-4 py-2.5 text-text-primary"><ActionCell lines={row.actionLines} /></td>
                  <td className="px-4 py-2.5 text-right text-text-primary">{row.draws}</td>
                  <td className="px-4 py-2.5 text-right text-accent-coral font-semibold">{row.cumulative}</td>
                  <td className="px-4 py-2.5 text-right text-accent-blue">{row.dia > 0 ? row.dia.toLocaleString() : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-accent-gold">{row.coa > 0 ? row.coa.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-subtle bg-navy-light">
                <td colSpan={2} className="px-4 py-2.5 text-text-primary font-heading font-bold">Total from Day {startDay}</td>
                <td className="px-4 py-2.5 text-right text-text-primary font-heading font-bold">{displayTotals.draws}</td>
                <td></td>
                <td className="px-4 py-2.5 text-right text-accent-blue font-heading font-bold">{displayTotals.dia.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-accent-gold font-heading font-bold">{displayTotals.coa.toLocaleString()}</td>
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

        <div className="hidden sm:flex flex-wrap gap-4 mt-3 text-[11px] text-text-muted">
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
  const themedRows = filterRows(buildThemedCrestRows(plan, event) ?? []);
  const rows = themedRows ?? [];
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  const displayTotals = visibleRows.reduce(
    (a, r) => ({ draws: a.draws + r.draws, dia: a.dia + r.dia }),
    { draws: 0, dia: 0 }
  );

  return (
    <div className="mb-6">
      <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
        Day-by-Day Schedule
      </h3>
      {showFromToday && (
        <p className="text-xs text-accent-gold mb-3">
          From Day {startDay} ({rows.length > 0 ? rows[0].date : ""})
        </p>
      )}
      <IconLegend isCollector={false} />
      <DayCards rows={visibleRows} showCoa={false} />

      <div className="hidden sm:block rounded-xl border border-border-subtle bg-navy overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-light text-text-muted text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium w-16">Date</th>
              <th className="text-left px-4 py-2.5 font-medium">Action</th>
              <th className="text-right px-4 py-2.5 font-medium w-16">Draws</th>
              <th className="text-right px-4 py-2.5 font-medium w-20">Cumulative</th>
              <th className="text-right px-4 py-2.5 font-medium w-20">Dia</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.day} className={`border-t border-border-subtle ${row.tag ? TAG_STYLES[row.tag] : ""}`}>
                <td className="px-4 py-2.5 text-text-muted font-heading font-bold">{row.date}</td>
                <td className="px-4 py-2.5 text-text-primary"><ActionCell lines={row.actionLines} /></td>
                <td className="px-4 py-2.5 text-right text-text-primary">{row.draws}</td>
                <td className="px-4 py-2.5 text-right text-accent-coral font-semibold">{row.cumulative}</td>
                <td className="px-4 py-2.5 text-right text-accent-blue">{row.dia > 0 ? row.dia.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
          {(displayTotals.draws > 0 || displayTotals.dia > 0) && (
            <tfoot>
              <tr className="border-t-2 border-border-subtle bg-navy-light">
                <td colSpan={2} className="px-4 py-2.5 text-text-primary font-heading font-bold">Total from Day {startDay}</td>
                <td className="px-4 py-2.5 text-right text-text-primary font-heading font-bold">{displayTotals.draws}</td>
                <td></td>
                <td className="px-4 py-2.5 text-right text-accent-blue font-heading font-bold">{displayTotals.dia.toLocaleString()}</td>
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

      {/* Legend — hidden on mobile since DayCards already show the colored tags */}
      <div className="hidden sm:flex flex-wrap gap-4 mt-3 text-[11px] text-text-muted">
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