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
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/75">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-accent-gold/60 bg-navy shadow-2xl shadow-black/50 p-6">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close notice"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-white/10 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-9 h-9 rounded-lg bg-accent-gold/15 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-accent-gold" />
          </span>
          <h2 className="font-heading text-lg sm:text-xl font-bold text-text-primary">
            This site does NOT sell skins
          </h2>
        </div>

        <div className="space-y-3 text-sm text-text-primary">
          <p className="flex items-start gap-2">
            <CheckCircle2 size={16} className="text-accent-green shrink-0 mt-0.5" />
            <span>
              SkinRoute is a <strong>free guide</strong>. It only calculates draw
              plans and recharge estimates. It does not sell skins, diamonds, or
              accounts, and never takes payments.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-accent-coral shrink-0 mt-0.5" />
            <span>
              SkinRoute will <strong>never ask for your password, account login,
              or payment details</strong>. Do not enter them on any page that does.
            </span>
          </p>
          <p className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-accent-coral shrink-0 mt-0.5" />
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
          className="mt-6 w-full px-6 py-2.5 rounded-lg bg-accent-gold text-navy font-heading font-bold hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
