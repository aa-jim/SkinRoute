"use client";

import { useRef, useState, useEffect } from "react";
import EventCard from "@/components/ui/EventCard";

// Stacked-deck carousel (phones only): every card lives in its own scroll slot
// (the outer div is what scroll-snap targets), and the visible card inside it
// gets a translate + scale + z-stack so the active card sits ON TOP while
// neighbors peek out from BEHIND. All deck transforms are pure CSS via
// `max-md:` utility classes below — no JS media queries, so the phone layout
// is correct from the very first paint (no mount-time jump) — and from `md:`
// up they simply don't apply, rendering a plain spaced row instead.
//
// NOTE: the class strings in deckClasses() must stay full literals — Tailwind's
// scanner can't see classes assembled dynamically.
export default function EventCarousel({ events }) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(function bind() {
    const c = scrollRef.current;
    if (!c) return;

    function onScroll() {
      const r = c.children[0];
      if (!r) return;
      const cR = c.getBoundingClientRect();
      const ct = cR.left + c.clientWidth / 2;
      let b = 0; let bd = Infinity;
      Array.from(r.children).forEach(function scan(el, i) {
        const rc = el.getBoundingClientRect();
        const dd = Math.abs(rc.left + rc.width / 2 - ct);
        if (dd < bd) { bd = dd; b = i; }
      });
      setActiveIndex(b);
    }

    onScroll();
    c.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return function cleanup() {
      c.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  function scrollToIndex(i) {
    const c = scrollRef.current;
    const ch = c ? c.children[0]?.children[i] : null;
    if (ch) ch.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // Peek styling per distance from the active card (mobile only): distance-1
  // cards tuck under the active card (~80-90% visible), distance-2+ stack deeper;
  // z-index keeps the active card on top. All straight, no rotation.
  function deckClasses(d) {
    if (d === 0) return "z-50";
    const ad = Math.abs(d);
    if (d > 0) {
      return ad === 1
        ? "max-md:[transform:translateX(-52px)_scale(0.9)] max-md:opacity-85 max-md:z-40"
        : "max-md:[transform:translateX(-24px)_scale(0.82)] max-md:opacity-65 max-md:z-30";
    }
    return ad === 1
      ? "max-md:[transform:translateX(52px)_scale(0.9)] max-md:opacity-85 max-md:z-40"
      : "max-md:[transform:translateX(24px)_scale(0.82)] max-md:opacity-65 max-md:z-30";
  }

  return (
    <div>
      <div ref={scrollRef} className="relative max-w-[2400px] mx-auto overflow-x-auto snap-x snap-mandatory">
        <div className="relative flex w-max mx-auto py-6 justify-center md:gap-8">
          {events.map((event, i) => (
            <div
              key={event.id}
              className="shrink-0 snap-center w-[260px] sm:w-[280px] h-[340px] flex items-center justify-center"
            >
              <div
                className={`relative transition-[transform,opacity] duration-300 ease-out will-change-transform ${deckClasses(i - activeIndex)}`}
              >
                <EventCard event={event} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll position dots - only shown when there is more than one card */}
      {events.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-2 md:hidden">
          {events.map((event, i) => (
            <button
              key={event.id}
              type="button"
              aria-label={`Go to ${event.name}`}
              onClick={function go() { scrollToIndex(i); }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIndex ? "w-6 bg-ink" : "w-2 bg-ink/25 hover:bg-ink/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
