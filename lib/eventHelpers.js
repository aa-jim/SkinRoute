// Shared helpers for event display (badges, urgency colors, days-left math)

export const EVENT_TYPE_LABELS = {
  collector: "Collector",
  bingo: "Bingo",
  themed_crest: "Themed Crest",
  legend: "Legend",
  special: "Special",
};

// Corner-tab colors per event type — solid deep game-UI tones, cream text (rendered as diagonal-cut tabs on the card corners)
export const EVENT_TYPE_BADGE = {
  collector: "bg-gold text-[#FFFBF2]",
  bingo: "bg-plum text-[#FFFBF2]",
  themed_crest: "bg-sea text-[#FFFBF2]",
  legend: "bg-brick text-[#FFFBF2]",
  special: "bg-[#9C4E61] text-[#FFFBF2]",
};

// MLBB's in-game day resets at 2:00 PM Bangladesh time (UTC+6), not midnight.
// So "end_date" means the event is live until 2:00 PM BDT on the day AFTER end_date.
const BD_RESET_HOUR_UTC = 8; // 2:00 PM BDT = 08:00 UTC (BDT is UTC+6)

const fmtDate = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;

// Resolves recurring events to concrete dates. A monthly event (the collector
// cycle) maps to the current in-game month — evaluated at the 2PM BDT reset
// boundary so the window flips at the same moment the game rotates the event:
// "now - 8h" is the in-game clock. Explicit start_date/end_date in the data
// always win over the recurring pattern (manual override for deviant months).
// Must be called per request/render (not cached at module load) so long-lived
// Workers isolates never serve a stale month.
export function resolveEventDates(event) {
  if (!event || event.recurring?.pattern !== "monthly" || event.start_date) return event;
  const gameNow = new Date(Date.now() - BD_RESET_HOUR_UTC * 60 * 60 * 1000);
  const start = new Date(Date.UTC(gameNow.getUTCFullYear(), gameNow.getUTCMonth(), 1));
  const end = new Date(Date.UTC(gameNow.getUTCFullYear(), gameNow.getUTCMonth() + 1, 0));
  return {
    ...event,
    start_date: fmtDate(start),
    end_date: fmtDate(end),
    duration_days: end.getUTCDate(),
  };
}

// Current in-game event day, using the same 2PM BDT reset boundary as daysLeft().
// Day 1 of the event starts at 2:00 PM BDT on start_date; the day number advances
// at 2:00 PM BDT each day, NOT at midnight. This is the canonical "what day is it
// in-game right now" used by todayEventDay() (planOrchestrator) and anywhere the
// plan schedule needs to align with in-game days.
export function eventDayNow(event) {
  event = resolveEventDates(event);
  if (!event?.start_date) return null;
  const [year, month, day] = event.start_date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, BD_RESET_HOUR_UTC, 0, 0));
  return Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

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
  event = resolveEventDates(event);
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

// Linear time progress for an event card: how far along the event window the
// current moment is, 0–100. Uses the same 2PM BDT (08:00 UTC) anchors as
// daysLeft(): the event starts at 2PM BDT on start_date and closes at 2PM BDT
// on the day AFTER end_date. Returns null when dates are missing (coming-soon
// cards fall back to the neutral gray bar).
export function eventProgress(event) {
  event = resolveEventDates(event);
  if (!event?.start_date || !event?.end_date) return null;
  const [sy, sm, sd] = event.start_date.split("-").map(Number);
  const [ey, em, ed] = event.end_date.split("-").map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd, BD_RESET_HOUR_UTC, 0, 0));
  const end = new Date(Date.UTC(ey, em - 1, ed + 1, BD_RESET_HOUR_UTC, 0, 0));
  const now = Date.now();
  if (now <= start.getTime()) return 0;
  if (now >= end.getTime()) return 100;
  return Math.round(((now - start.getTime()) / (end.getTime() - start.getTime())) * 100);
}

// Progress bar color: a smooth green→red sweep keyed to elapsed time, so the
// bar reads as time-passed at a glance (green on day 1, orange around 75% in,
// red at the very end). null (no dates / coming soon) returns the neutral gray.
export function progressColor(pct) {
  if (pct === null) return "#5A5C6E";
  const hue = 142 - Math.min(100, Math.max(0, pct)) * 1.42;
  return `hsl(${hue}, 70%, 48%)`;
}

// Countdown label for the progress bar ("N days left" / "Coming soon")
export function urgencyLabel(days) {
  if (days === null) return "Coming soon";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

// ---------------------------------------------------------------------------
// Early planning window (coming-soon events)
// ---------------------------------------------------------------------------

// Events become planable this many days BEFORE their start date: the home-page
// card unlocks and the wizard is reachable, with plans starting from Day 1
// until the event actually goes live.
export const EARLY_PLAN_DAYS = 7;

// Start anchor for an event: 2PM BDT (08:00 UTC) on start_date — same boundary
// as eventDayNow()/daysLeft(). Returns null when the event has no start date.
export function eventStartDate(event) {
  event = resolveEventDates(event);
  if (!event?.start_date) return null;
  const [year, month, day] = event.start_date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, BD_RESET_HOUR_UTC, 0, 0));
}

// Whole days until the event starts (0 = starting today, negative = live or
// past, null = no start date). Uses the same 2PM BDT anchor as deriveStatus.
export function daysUntilStart(event) {
  const start = eventStartDate(event);
  if (!start) return null;
  return Math.ceil((start.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Is this coming-soon event inside the early-planning window? Cards unlock
// (clickable, full opacity, countdown label) exactly 7 days before launch —
// or immediately when the event's `status` is manually set to "early" (a
// data-driven override for opening an event to planning ahead of the 7-day
// window, even when it has no start_date). "ended" still wins via deriveStatus.
export function isEarlyPlanable(event) {
  if (deriveStatus(event) !== "coming_soon") return false;
  if (event?.status === "early") return true; // manual override — unlock any coming-soon card
  const d = daysUntilStart(event);
  return d !== null && d >= 0 && d <= EARLY_PLAN_DAYS;
}

// ---------------------------------------------------------------------------
// Live countdown (running events)
// ---------------------------------------------------------------------------

// Days + hours remaining until the event closes, using the same 2PM BDT anchor
// as daysLeft(). {days:0,hours:0} when expired, null when no end date.
export function timeLeft(endDateStr) {
  if (!endDateStr) return null;
  const [year, month, day] = endDateStr.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day + 1, BD_RESET_HOUR_UTC, 0, 0));
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return { days: 0, hours: 0 };
  const DAY_MS = 1000 * 60 * 60 * 24;
  const HOUR_MS = 1000 * 60 * 60;
  return { days: Math.floor(diffMs / DAY_MS), hours: Math.floor((diffMs % DAY_MS) / HOUR_MS) };
}

// In-game style countdown label ("3d 5h left", "5h left" under a day) — matches
// how MLBB renders the remaining time on event banners. null when no end date.
export function timeLeftLabel(endDateStr) {
  const t = timeLeft(endDateStr);
  if (!t) return null;
  if (t.days > 0) return `${t.days}d ${t.hours}h left`;
  return `${t.hours}h left`;
}
