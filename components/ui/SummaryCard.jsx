"use client";

export default function SummaryCard({ label, value, sublabel, icon: Icon, accent = "gold", compact = false }) {
  const accentClass = {
    gold: "text-gold-dark",
    green: "text-fern",
    coral: "text-brick",
    blue: "text-sea",
    amber: "text-gold-dark",
  }[accent] ?? "text-gold-dark";

  return (
    <div className={`rounded-lg border border-line-strong bg-paper-raised px-4 ${compact ? "py-2.5" : "py-4"} flex flex-col gap-1`}>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">
        {Icon && <Icon size={compact ? 12 : 14} />}
        {label}
      </div>
      <p className={`font-heading ${compact ? "text-lg sm:text-2xl" : "text-xl sm:text-3xl"} font-semibold leading-tight break-words ${accentClass}`}>{value}</p>
      {sublabel && <p className="text-xs text-ink-soft">{sublabel}</p>}
    </div>
  );
}
