"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck, ShieldAlert, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "skinroute.notice.v1";

// One-time trust + phishing notice shown on the very first visit (per browser).
// Dismissal is persisted in localStorage so refresh/navigation never re-shows
// it; bump STORAGE_KEY if the copy ever needs to reach everyone again.
export default function FirstVisitNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      // localStorage unavailable (private mode etc.) — just don't show the modal
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-ink/70">
      <div className="relative w-full max-w-md rounded-xl border-2 border-ink bg-paper-raised shadow-hard-lg p-6">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close notice"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-ink-soft hover:text-ink hover:bg-paper-dim transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-gold-dark" />
          </span>
          <h2 className="font-heading text-lg sm:text-xl font-bold text-ink">
            This site does NOT sell skins
          </h2>
        </div>

        <div className="space-y-3 text-sm text-ink">
          <p className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-fern shrink-0 mt-0.5" />
            <span>
              SkinRoute is a <strong>free guide</strong>. It only calculates draw
              plans and recharge estimates. It does not sell skins, diamonds, or
              accounts, and never takes payments.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-brick shrink-0 mt-0.5" />
            <span>
              SkinRoute will <strong>never ask for your password, account login,
              or payment details</strong>. Do not enter them on any page that does.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-brick shrink-0 mt-0.5" />
            <span>
              Phishing copies of sites like this can exist. The only official addresses
              are<strong> skinroute.events-mlbb.workers.dev</strong> and{" "}
              <strong>skin-route.vercel.app</strong>. Check the address bar carefully.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-6 w-full px-6 py-2.5 rounded-lg bg-brick text-[#FFFBF2] font-heading font-bold hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
