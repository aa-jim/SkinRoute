"use client";

import { useState, useEffect, useRef } from "react";
import { Coffee, Copy, Check, X } from "lucide-react";

// TODO: replace with real numbers before launch
const BKASH_NUMBER = "01752-307252";
const NAGAD_NUMBER = "01701-051320";

function CopyRow({ label, number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full flex items-center justify-between gap-3 rounded-lg bg-navy border border-border-subtle px-4 py-3 hover:border-accent-gold/50 transition-colors text-left"
    >
      <div>
        <p className="text-[11px] text-text-muted uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-sm font-heading font-bold text-text-primary">{number}</p>
      </div>
      {copied ? (
        <Check size={18} className="text-accent-green shrink-0" />
      ) : (
        <Copy size={18} className="text-text-muted shrink-0" />
      )}
    </button>
  );
}

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef(null);
  const observerRef = useRef(null);
  const step4TriggeredRef = useRef(false);

  useEffect(() => {
    const isMobile = window.innerWidth < 640;
    if (!isMobile) {
      setExpanded(true);
      return;
    }

    setExpanded(true);
    timerRef.current = setTimeout(() => setExpanded(false), 2000);

    let mo;

    function checkAndObserve() {
      const el = document.querySelector("[data-plan-section]");
      if (!el) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !step4TriggeredRef.current) {
              step4TriggeredRef.current = true;
              observerRef.current.disconnect();
              clearTimeout(timerRef.current);
              timerRef.current = setTimeout(() => {
                setExpanded(true);
                timerRef.current = setTimeout(() => setExpanded(false), 2000);
              }, 1000);
            }
          }
        },
        { threshold: 0.3 }
      );
      observerRef.current.observe(el);
      if (mo) mo.disconnect();
    }

    checkAndObserve();

    mo = new MutationObserver(() => checkAndObserve());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timerRef.current);
      if (observerRef.current) observerRef.current.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Support this project"
        className={`fixed bottom-12 sm:bottom-4 right-4 z-40 flex items-center rounded-full bg-accent-gold text-navy font-heading font-bold shadow-lg shadow-black/30 hover:opacity-90 transition-all duration-300 ${
          expanded ? "gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-4" : "gap-0 p-2.5 sm:gap-2 sm:px-4 sm:py-2.5"
        }`}
      >
        <Coffee size={18} />
        <span
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[360px] rounded-2xl border border-border-subtle bg-navy-light p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Coffee size={20} className="text-accent-gold" />
                <h3 className="font-heading text-lg font-bold text-text-primary">Buy me a coffee</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} className="text-text-muted hover:text-text-primary transition-colors" />
              </button>
            </div>
            <p className="text-xs text-text-muted leading-relaxed mb-4">
              Skin Route is free and always will be. If it saved you some diamonds, you can
              donate any amount you like via bKash or Nagad :)
            </p>

            <div className="flex flex-col gap-2.5 mb-1">
              <CopyRow label="bKash (Personal — Send Money)" number={BKASH_NUMBER} />
              <CopyRow label="Nagad (Personal — Send Money)" number={NAGAD_NUMBER} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
