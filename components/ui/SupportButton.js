"use client";

import { useState, useEffect, useRef } from "react";
import { Coffee, Copy, Check, X } from "lucide-react";

// TODO: replace with real numbers before launch
const BKASH_NUMBER = "01752-307252";
const NAGAD_NUMBER = "01701-051320";

// How long the pill stays expanded before auto-collapsing on phones.
const COLLAPSE_AFTER_MS = 2500;
// Extra delay before the Step-4 re-expansion kicks in (let the user land first).
const STEP4_DELAY_MS = 1000;

function CopyRow({ label, number }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(number)
      .then(function () {
        setCopied(true);
        setTimeout(function () {
          setCopied(false);
        }, 1500);
      })
      .catch(function () {});
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full flex items-center justify-between gap-3 rounded-md bg-white/70 border border-line-strong px-4 py-3 hover:border-ink transition-colors text-left"
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint mb-0.5">{label}</p>
        <p className="font-mono font-semibold text-sm text-ink">{number}</p>
      </div>
      {copied ? (
        <Check size={18} className="text-fern shrink-0" />
      ) : (
        <Copy size={18} className="text-ink-soft shrink-0" />
      )}
    </button>
  );
}

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timersRef = useRef([]);

  function expandNow() {
    setExpanded(true);
  }

  function collapseNow() {
    setExpanded(false);
  }

  function openModal() {
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  function stopPropagation(e) {
    e.stopPropagation();
  }

  useEffect(function mount() {
    const timers = [];
    function later(ms, fn) {
      timers.push(setTimeout(fn, ms));
    }
    function clearTimers() {
      timers.forEach(clearTimeout);
      timers.length = 0;
    }

    const isMobile = window.innerWidth < 640;
    if (!isMobile) {
      // Desktop: pill stays expanded permanently.
      setExpanded(true);
      return clearTimers;
    }

    // Phone rule: show the full label briefly on load, then collapse to the
    // coffee-cup icon so it doesn't sit over content.
    setExpanded(true);
    later(COLLAPSE_AFTER_MS, collapseNow);

    // On Step 4, re-expand once when the plan results scroll into view,
    // then collapse again - same phone-only rule.
    let observer = null;
    let mo = null;
    let triggered = false;

    function watchPlanSection() {
      const el = document.querySelector("[data-plan-section]");
      if (!el || triggered) return;
      if (mo) mo.disconnect();
      observer = new IntersectionObserver(function onIntersect(entries) {
        for (const entry of entries) {
          if (entry.isIntersecting && !triggered) {
            triggered = true;
            if (observer) observer.disconnect();
            clearTimers();
            later(STEP4_DELAY_MS, function reexpand() {
              setExpanded(true);
              later(COLLAPSE_AFTER_MS, collapseNow);
            });
          }
        }
      }, { threshold: 0.3 });
      observer.observe(el);
    }

    watchPlanSection();
    mo = new MutationObserver(watchPlanSection);
    mo.observe(document.body, { childList: true, subtree: true });

    return function unmount() {
      clearTimers();
      if (observer) observer.disconnect();
      if (mo) mo.disconnect();
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Support this project"
        aria-expanded={expanded}
        className={`fixed bottom-12 sm:bottom-4 right-4 z-[55] flex items-center rounded-full bg-brick text-[#FFFBF2] font-heading font-bold sm:shadow-hard hover:bg-brick-dark transition-all duration-300 ${
          expanded ? "gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-4" : "gap-0 p-2.5 sm:gap-2 sm:px-4 sm:py-2.5"
        }`}
      >
        <Coffee size={18} />
        <span
          aria-hidden={!expanded}
          className={`text-xs sm:text-sm whitespace-nowrap overflow-hidden inline-block transition-all duration-500 ${
            expanded
              ? "max-w-[120px] opacity-100"
              : "max-w-0 opacity-0 sm:max-w-[120px] sm:opacity-100"
          }`}
        >
          Buy me a coffee
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-[360px] rounded-xl border-2 border-ink bg-paper-raised shadow-hard-lg p-5"
            onClick={stopPropagation}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Coffee size={20} className="text-gold-dark" />
                <h3 className="font-heading text-lg font-bold text-ink">Buy me a coffee</h3>
              </div>
              <button type="button" aria-label="Close" onClick={closeModal}>
                <X size={18} className="text-ink-faint hover:text-ink transition-colors" />
              </button>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed mb-4">
              Skin Route is free and always will be. If it saved you some diamonds, you can
              donate any amount you like via bKash or Nagad :)
            </p>

            <div className="flex flex-col gap-2.5 mb-1">
              <CopyRow label="bKash (Personal - Send Money)" number={BKASH_NUMBER} />
              <CopyRow label="Nagad (Personal - Send Money)" number={NAGAD_NUMBER} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
