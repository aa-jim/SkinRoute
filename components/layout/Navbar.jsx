"use client";

import { useState } from "react";
import Link from "next/link";
import { Home, Menu, X, Bug } from "lucide-react";
import ReportModal from "@/components/ui/ReportModal";
import { useWizardOptional } from "@/lib/wizardContext";

export default function Navbar() {
  const wizard = useWizardOptional();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const openReport = () => {
    setMenuOpen(false);
    setReportOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-navy/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[2400px] mx-auto flex items-center justify-between px-2 sm:px-4 h-[52px] sm:h-[68px]">
          <Link
            href="/"
            className="font-heading text-2xl sm:text-3xl px-0 sm:px-0 font-bold tracking-wide text-white"
          >
            SKIN ROUTE
          </Link>
          <nav className="flex items-center gap-2 sm:gap-6">
            <div className="hidden sm:flex items-center gap-4 sm:gap-6">
              <Link
                href="/"
                aria-label="Home"
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg border-2 border-white/70 text-white hover:bg-white/20 transition-colors"
              >
                <Home size={24} strokeWidth={2} />
              </Link>
              <Link
                href="/help"
                aria-label="Help"
                className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg border-2 border-white/70 text-white hover:bg-white/20 transition-colors"
              >
                <span className="text-2xl font-heading font-bold leading-none">?</span>
              </Link>
              <button
                type="button"
                onClick={openReport}
                aria-label="Report a bug"
                className="h-8 sm:h-10 flex items-center gap-1.5 px-2.5 sm:px-3 rounded-lg border-2 border-accent-coral/70 text-accent-coral hover:bg-accent-coral/20 transition-colors"
              >
                <Bug size={18} strokeWidth={2} />
                <span className="hidden lg:inline text-sm font-heading font-bold">Report Bug</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg border-2 border-white/70 text-white hover:bg-white/20 transition-colors"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </nav>
        </div>

        {menuOpen && (
          <div className="sm:hidden border-t border-white/10 bg-navy/95">
            <div className="flex flex-col px-4 pt-2 pb-0">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 py-3 text-sm font-heading font-bold text-white hover:text-accent-gold transition-colors -mx-4 px-4 border-b border-white/10"
              >
                <Home size={16} />
                Home
              </Link>
              <Link
                href="/help"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 py-3 text-sm font-heading font-bold text-white hover:text-accent-gold transition-colors -mx-4 px-4 border-b border-white/10"
              >
                <span className="text-base font-bold leading-none w-4 text-center">?</span>
                Help
              </Link>
              <button
                type="button"
                onClick={openReport}
                className="flex items-center gap-2.5 py-3 text-left text-sm font-heading font-bold text-accent-coral hover:text-accent-coral/80 transition-colors -mx-4 px-4 border-b border-white/10"
              >
                <Bug size={16} />
                Report a Bug
              </button>
            </div>
          </div>
        )}
      </header>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} context={wizard} />
    </>
  );
}
