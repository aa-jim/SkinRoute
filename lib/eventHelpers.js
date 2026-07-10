// Shared helpers for event display (badges, urgency colors, days-left math)

export const EVENT_TYPE_LABELS = {
  collector: "Collector",
  bingo: "Bingo",
  themed_crest: "Themed Crest",
  legend: "Legend",
  special: "Special",
};

// Badge color per event type — matches mockup (teal/purple/lime), amber reserved for Legend
export const EVENT_TYPE_BADGE = {
  collector: "bg-badge-cyan text-[#0B3B36] border border-[#0F4F40]",
  bingo: "bg-badge-purple text-[#3B1A52] border border-[#4A2167]",
  themed_crest: "bg-badge-green text-[#1F2E05] border border-[#2A3D07]",
  legend: "bg-accent-amber text-[#3A2705] border border-[#4A3106]",
  special: "bg-[#F5A0B8] text-[#3A0518] border border-[#4A0620]",
};

// MLBB's in-game day resets at 2:00 PM Bangladesh time (UTC+6), not midnight.
// So "end_date" means the event is live until 2:00 PM BDT on the day AFTER end_date.
const BD_RESET_HOUR_UTC = 8; // 2:00 PM BDT = 08:00 UTC (BDT is UTC+6)

export function daysLeft(endDateStr) {
  if (!endDateStr) return null;
  // Event closes at the 2PM BDT reset on the day following end_date
  const [year, month, day] = endDateStr.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day + 1, BD_RESET_HOUR_UTC, 0, 0));
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Urgency-based progress bar color: red/orange near end, green = plenty of time
// Bar length also reflects urgency (shorter time left = fuller/more depleted-looking bar)
export function urgencyStyle(days) {
  if (days === null) {
    return { color: "bg-[#5A5C6E]", fillPct: 100, label: "Coming soon" };
  }
  if (days <= 3) {
    return { color: "bg-[#F0872E]", fillPct: 92, label: `${days} day${days === 1 ? "" : "s"} left` };
  }
  if (days <= 7) {
    return { color: "bg-[#C7E82E]", fillPct: 70, label: `${days} days left` };
  }
  if (days <= 14) {
    return { color: "bg-[#5FE86B]", fillPct: 40, label: `${days} days left` };
  }
  return { color: "bg-[#2ED47A]", fillPct: 20, label: `${days} days left` };
}