"use client";

// Client error boundary for pages (/ , /help, /plan/*). Render/SSR failures land
// visitors here instead of Next's default error page — branded, with a retry
// (Next's reset()) and a mirror link for when the Workers host is straining
// under a traffic spike.
export default function ErrorPage({ error, reset }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-6">
      <div className="relative z-10 max-w-lg text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brick mb-4">
          Connection trouble
        </p>
        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-ink leading-tight mb-4 tracking-tight">
          Looks like we&apos;re getting a flood of players right now
        </h1>
        <p className="text-sm sm:text-base text-ink-soft leading-relaxed mb-8">
          The site just got shared and a lot of people are planning at once. Your plan usually
          needs just a moment — hit <span className="font-bold text-ink">Try again</span>, or
          if it keeps timing out, use the mirror site below.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-2.5 rounded-md bg-brick text-paper-raised font-heading font-semibold shadow-hard hover:bg-brick-dark transition-colors"
          >
            Try again
          </button>
          <a
            href="https://skin-route.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 rounded-md border-2 border-ink text-ink font-heading font-semibold hover:bg-ink hover:text-paper-raised transition-colors"
          >
            Open mirror site
          </a>
        </div>
        {process.env.NODE_ENV === "development" && error?.message ? (
          <p className="mt-8 font-mono text-xs text-ink-faint break-words">{error.message}</p>
        ) : null}
      </div>
    </main>
  );
}
