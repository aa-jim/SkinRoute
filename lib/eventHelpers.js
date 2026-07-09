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
  collector: "bg-[#6EE7DA] text-[#0B3B36]",
  bingo: "bg-[#D9B8F5] text-[#3B1A52]",
  themed_crest: "bg-[#B7F04B] text-[#1F2E05]",
  legend: "bg-[#F5C453] text-[#3A2705]",
  special: "bg-[#F5A0B8] text-[#3A0518]",
};

export function daysLeft(endDateStr) {
  if (!endDateStr) return null;
  const end = new Date(endDateStr + "T23:59:59");
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Urgency-based progress bar color: red/orange near end, green = plenty of time
// Bar length also reflects urgency (shorter time left = fuller/more depleted-looking bar)
export function urgencyStyle(days) {
  if (days === null) {
    return { color: "bg-[#5A5C6E]", fillPct: 60, label: "Coming soon" };
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
