"use client";

import Link from "next/link";
import { EVENT_TYPE_LABELS, EVENT_TYPE_BADGE, daysLeft, urgencyStyle } from "@/lib/eventHelpers";

export default function EventCard({ event }) {
  const isComingSoon = event.status === "coming_soon";
  const days = daysLeft(event.end_date);
  const urgency = urgencyStyle(days);

  const dateLabel = isComingSoon
    ? "Coming Soon"
    : `Ends on ${new Date(event.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

  const CardInner = (
    <div
      className={`relative w-[260px] sm:w-[280px] h-[420px] shrink-0 rounded-2xl overflow-hidden border border-white/15 bg-gradient-to-br ${event.banner_gradient} ${
        isComingSoon ? "opacity-60 grayscale-[30%] cursor-not-allowed" : "cursor-pointer hover:border-white/40 hover:-translate-y-1"
      } transition-all duration-200`}
    >
      {/* dark gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/40" />

      {/* type badge */}
      <span
        className={`absolute top-4 left-4 px-3 py-1 rounded-md text-xs font-semibold ${EVENT_TYPE_BADGE[event.type]}`}
      >
        {EVENT_TYPE_LABELS[event.type] ?? event.type}
      </span>

      {/* bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <h3 className="font-heading text-2xl font-bold text-white uppercase tracking-wide leading-tight mb-1">
          {event.name}
        </h3>
        <p className="text-sm text-white/85 mb-3">{dateLabel}</p>

        <div className="h-1.5 w-full rounded-full bg-black/50 overflow-hidden mb-2">
          <div
            className={`h-full rounded-full ${urgency.color}`}
            style={{ width: `${urgency.fillPct}%` }}
          />
        </div>
        <p className="text-sm font-medium text-white/90">{urgency.label}</p>
      </div>
    </div>
  );

  if (isComingSoon) return CardInner;

  return <Link href={`/plan/${event.id}`}>{CardInner}</Link>;
}
