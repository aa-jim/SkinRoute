"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import EventCard from "@/components/ui/EventCard";

export default function EventCarousel({ events }) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Determine which card is closest to the center of the visible scroll area
  const updateActiveIndex = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const children = Array.from(container.children[0]?.children ?? []);
    if (children.length === 0) return;

    const containerCenter = container.scrollLeft + container.clientWidth / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;
    children.forEach((child, i) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const distance = Math.abs(childCenter - containerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    });
    setActiveIndex(closestIndex);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    updateActiveIndex();
    container.addEventListener("scroll", updateActiveIndex, { passive: true });
    return () => container.removeEventListener("scroll", updateActiveIndex);
  }, [updateActiveIndex]);

  const scrollToIndex = (i) => {
    const container = scrollRef.current;
    const child = container?.children[0]?.children[i];
    if (child) {
      child.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  };

  return (
    <div>
      <div ref={scrollRef} className="max-w-[2400px] mx-auto overflow-x-auto">
        <div className="flex gap-8 w-max mx-auto px-6 py-6 justify-center">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {/* Scroll position dots — only shown when there's more than one card to scroll through */}
      {events.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-2 md:hidden">
          {events.map((event, i) => (
            <button
              key={event.id}
              type="button"
              aria-label={`Go to ${event.name}`}
              onClick={() => scrollToIndex(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIndex ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}