"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EVENT_TYPE_LABELS, EVENT_TYPE_BADGE, daysLeft, urgencyStyle } from "@/lib/eventHelpers";

export default function EventCard({ event }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isComingSoon = event.status === "coming_soon";
  const days = daysLeft(event.end_date);
  const urgency = urgencyStyle(days);

  const dateLabel = isComingSoon
    ? "Coming Soon"
    : `Ends on ${new Date(event.end_date + "T06:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

  const showImage = event.image && !imageFailed;

  const CardInner = (
    <div
      className={`relative w-[260px] sm:w-[280px] h-[340px] shrink-0 rounded-2xl overflow-hidden border-2 border-white/40 bg-gradient-to-br ${event.banner_gradient} ${
        isComingSoon
          ? "opacity-60 grayscale-[30%] cursor-not-allowed"
          : "cursor-pointer hover:border-white/50 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-2"
      } transition-all duration-300 ease-out`}
    >
      {showImage && (
        <Image
          src={event.image}
          alt={event.name}
          fill
          sizes="280px"
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      )}
      {/* Progressive tint panel behind text — layered radial/linear gradients simulate soft blur
          without backdrop-blur, which flickers during the hover transform animation */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[260px] pointer-events-none"
        style={{
          background: `linear-gradient(to top,
            ${event.text_panel_color ?? "#000000"} 0%,
            ${event.text_panel_color ?? "#000000"}E6 22%,
            ${event.text_panel_color ?? "#000000"}B3 42%,
            ${event.text_panel_color ?? "#000000"}66 65%,
            ${event.text_panel_color ?? "#000000"}1A 85%,
            transparent 100%)`,
        }}
      />
      <span
        className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-semibold ${EVENT_TYPE_BADGE[event.type]}`}
      >
        {EVENT_TYPE_LABELS[event.type] ?? event.type}
      </span>
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