// Single access point for event data. Resolves recurring events (the monthly
// collector cycle) on EVERY call — never at module load — so the dates always
// reflect the current in-game month even on long-lived Workers isolates.
// Consumers: app/page.js, app/api/plan/route.js, app/plan/[eventId]/page.js
// (the wizard page; everything downstream gets the resolved event via context).

import eventsData from "@/data/events.json";
import { resolveEventDates } from "./eventHelpers.js";

export function getEvents() {
  return (eventsData.events ?? []).map(resolveEventDates);
}

export function getEvent(eventId) {
  return getEvents().find((e) => e.id === eventId);
}
