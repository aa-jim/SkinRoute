import Link from "next/link";
import { Home, HelpCircle } from "lucide-react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-navy border-b border-white/10">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 sm:px-10 h-[76px]">
        <Link href="/" className="font-heading text-2xl sm:text-3xl font-bold tracking-wide text-white">
          SKIN ROUTE
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Home"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/70 text-white hover:bg-white/10 transition-colors"
          >
            <Home size={18} strokeWidth={2} />
          </Link>
          <Link
            href="/help"
            aria-label="Help"
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/70 text-white hover:bg-white/10 transition-colors"
          >
            <HelpCircle size={18} strokeWidth={2} />
          </Link>
        </nav>
      </div>
    </header>
  );
}
