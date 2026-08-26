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
      <header className="sticky top-0 z-50 bg-paper-raised/90 backdrop-blur-md border-b-2 border-ink">
        <div className="max-w-[2400px] mx-auto flex items-center justify-between px-3 sm:px-5 h-[52px] sm:h-[64px]">
          <Link
            href="/"
            className="font-heading text-[22px] sm:text-2xl font-semibold tracking-tight text-ink leading-none"
          >
            Skin<span className="text-brick">Route</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-3 sm:gap-4">
              <Link
                href="/"
                aria-label="Home"
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-md border-2 border-ink/70 text-ink hover:bg-ink hover:text-paper-raised transition-colors"
              >
                <Home size={20} strokeWidth={2} />
              </Link>
              <Link
                href="/help"
                aria-label="Help"
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-md border-2 border-ink/70 text-ink hover:bg-ink hover:text-paper-raised transition-colors font-mono font-semibold text-lg"
              >
                ?
              </Link>
              <button
                type="button"
                onClick={openReport}
                aria-label="Report a bug"
                className="h-9 sm:h-10 flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md border-2 border-brick text-brick hover:bg-brick hover:text-paper-raised transition-colors"
              >
                <Bug size={17} strokeWidth={2} />
                <span className="hidden lg:inline text-sm font-heading font-semibold">Report Bug</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="sm:hidden w-9 h-9 flex items-center justify-center rounded-md border-2 border-ink/70 text-ink hover:bg-ink hover:text-paper-raised transition-colors"
            >
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </nav>
        </div>

        {menuOpen && (
          <div className="sm:hidden border-t-2 border-ink bg-paper-raised">
            <div className="flex flex-col divide-y divide-line px-3 pt-2 pb-0">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 py-3 text-sm font-heading font-semibold text-ink hover:text-brick transition-colors -mx-3 px-3"
              >
                <Home size={16}/>
                Home
              </Link>
              <Link
                href="/help"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 py-3 text-sm font-heading font-semibold text-ink hover:text-brick transition-colors -mx-3 px-3"
              >
                <span className="font-mono font-semibold w-4 text-center">?</span>
                Help
              </Link>
              <button
                type="button"
                onClick={openReport}
                className="flex items-center gap-2.5 py-3 text-left text-sm font-heading font-semibold text-brick hover:text-brick-dark transition-colors -mx-3 px-3"
              >
                <Bug size={16}/>
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