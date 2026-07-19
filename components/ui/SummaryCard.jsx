"use client";

export default function SummaryCard({ label, value, sublabel, icon: Icon, accent = "gold" }) {
  const accentClass = {
    gold: "text-accent-gold",
    green: "text-accent-green",
    coral: "text-accent-coral",
    blue: "text-accent-blue",
  }[accent] ?? "text-accent-gold";

  return (
    <div className="rounded-xl border border-border-subtle bg-navy px-5 py-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-text-muted text-xs font-medium uppercase tracking-wide">
        {Icon && <Icon size={14} />}
        {label}
      </div>
      <p className={`font-heading text-2xl sm:text-3xl font-bold ${accentClass}`}>{value}</p>
      {sublabel && <p className="text-xs text-text-muted">{sublabel}</p>}
    </div>
  );
}