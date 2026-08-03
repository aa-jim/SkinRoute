"use client";

// Client error boundary for pages (/ , /help, /plan/*). Render/SSR failures land
// visitors here instead of Next's default error page — branded, with a retry
// (Next's reset()) and a mirror link for when the Workers host is straining
// under a traffic spike.
export default function ErrorPage({ error, reset }) {
  return (
    <main className="relative min-h-screen bg-navy flex items-center justify-center px-6">
      <div className="relative z-10 max-w-lg text-center">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white mb-4">
          Looks like we&apos;re getting a flood of players right now
        </h1>
        <p className="text-sm sm:text-base text-white/80 leading-relaxed mb-8">
          The site just got shared and a lot of people are planning at once. Your plan usually
          needs just a moment — hit <span className="font-bold text-white">Try again</span>, or
          if it keeps timing out, use the mirror site below.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <a
            href="https://skin-route.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 rounded-lg border border-white/20 text-white font-heading font-bold hover:bg-white/10 transition-colors"
          >
            Open mirror site
          </a>
        </div>
        {process.env.NODE_ENV === "development" && error?.message ? (
          <p className="mt-8 text-xs text-white/40 break-words">{error.message}</p>
        ) : null}
      </div>
    </main>
  );
}