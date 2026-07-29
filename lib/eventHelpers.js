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
  collector: "bg-badge-cyan text-[#004C1E] border-2 border-[#0F4F40]",
  bingo: "bg-badge-purple text-[#26004D] border-2 border-[#1E003D]",
  themed_crest: "bg-badge-green text-[#004C1E] border-2 border-[#033417]",
  legend: "bg-accent-amber text-[#3A2705] border-2 border-[#4A3106]",
  special: "bg-[#F5A0B8] text-[#3A0518] border-2 border-[#4A0620]",
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

// Derives "coming_soon" | "active" | "ended" from start_date/end_date + today,
// using the same 2PM BDT reset convention as daysLeft(). This is the source of
// truth for lifecycle state going forward — events.json's own `status` field is
// only respected as an explicit early-kill-switch (status:"ended" forces ended
// even if end_date hasn't passed yet); it is otherwise ignored so admins don't
// need to hand-flip status when an event starts/ends.
export function deriveStatus(event) {
  if (event?.status === "ended") return "ended"; // manual override, always respected
  if (!event?.start_date) return "coming_soon"; // no start date at all → not live yet

  const now = new Date();

  const [sy, sm, sd] = event.start_date.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd, BD_RESET_HOUR_UTC, 0, 0));
  if (now.getTime() < start.getTime()) return "coming_soon";

  if (event.end_date) {
    const days = daysLeft(event.end_date);
    if (days !== null && days < 0) return "ended";
  }

  return "active";
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