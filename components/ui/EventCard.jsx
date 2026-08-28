"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_BADGE,
  daysLeft,
  eventProgress,
  progressColor,
  urgencyLabel,
  deriveStatus,
  isEarlyPlanable,
  daysUntilStart,
  timeLeftLabel,
} from "@/lib/eventHelpers";

export default function EventCard({ event }) {
  const [imageFailed, setImageFailed] = useState(false);
  const isComingSoon = deriveStatus(event) === "coming_soon";
  const early = isEarlyPlanable(event);
  const locked = isComingSoon && !early;
  const progress = eventProgress(event);
  const days = daysLeft(event.end_date);
  const tilStart = daysUntilStart(event);
  const liveLeft = timeLeftLabel(event.end_date);

  const dateLabel = isComingSoon
    ? early
      ? `Coming ${new Date(event.start_date + "T06:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
      : "Coming Soon"
    : `Ends on ${new Date(event.end_date + "T06:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

  const countdownLabel = isComingSoon
    ? early
      ? tilStart === 0
        ? "Starting today"
        : `Starts in ${tilStart} day${tilStart === 1 ? "" : "s"}`
      : "Coming soon"
    : liveLeft ?? urgencyLabel(days);

  const showImage = event.image && !imageFailed;

  // Poster-style trading card on the paper page: thick ink frame + hard offset
  // shadow; the game art stays the only saturated element on screen.
  const CardInner = (
    <div
      className={`relative w-[260px] sm:w-[280px] h-[340px] shrink-0 rounded-xl overflow-hidden border-2 border-ink bg-gradient-to-br ${event.banner_gradient} ${
        locked
          ? "opacity-60 grayscale-[35%] cursor-not-allowed shadow-hard-sm"
          : "cursor-pointer shadow-hard hover:-translate-y-1.5 hover:shadow-hard-lg"
      } transition-all duration-200 ease-out`}
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
        className="absolute bottom-0 left-0 right-0 h-[300px] sm:h-[260px] pointer-events-none"
        style={{
          background: `linear-gradient(to top,
            ${event.text_panel_color ?? "#000000"} 0%,
            ${event.text_panel_color ?? "#000000"}E6 35%,
            ${event.text_panel_color ?? "#000000"}B3 45%,
            ${event.text_panel_color ?? "#000000"}66 65%,
            ${event.text_panel_color ?? "#000000"}1A 85%,
            transparent 100%)`,
        }}
      />
      <span
        className={`absolute top-0 left-0 pr-6 pl-4 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${EVENT_TYPE_BADGE[event.type]}`}
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
      >
        {EVENT_TYPE_LABELS[event.type] ?? event.type}
      </span>
      {early && (
        <span
          className="absolute top-0 right-0 pl-6 pr-4 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-brick text-[#FFFBF2]"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 12px 100%)" }}
        >
          Plan early
        </span>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <h3 className="font-heading text-2xl font-semibold text-white uppercase tracking-wide leading-tight mb-1">
          {event.name}
        </h3>
        <p className="font-mono text-xs text-white/85 mb-3">{dateLabel}</p>
        <div className="h-1.5 w-full rounded-full bg-black/50 overflow-hidden mb-2">
          <div
            className="h-full rounded-full"
            style={{ width: `${progress ?? 100}%`, backgroundColor: progressColor(progress) }}
          />
        </div>
        <p className="text-sm font-medium text-white/90">{countdownLabel}</p>
      </div>
    </div>
  );

  if (locked) return CardInner;

  return <Link href={`/plan/${event.id}`}>{CardInner}</Link>;
}
