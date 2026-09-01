"use client";

// Root-level error boundary: catches failures where the root layout itself
// can't render (the blank-screen worst case). Must supply its own
// <html>/<body> since the layout may have failed — so the layout's font CSS
// variables are not guaranteed here and font-heading/font-body/font-mono are
// avoided (colors are hardcoded to the paper theme).
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#F2EDDF", color: "#27231B" }} className="antialiased">
        <main className="relative min-h-screen flex items-center justify-center px-6">
          <div className="relative z-10 max-w-lg text-center">
            <p style={{ color: "#9E3E24", letterSpacing: "0.3em" }} className="uppercase mb-4 text-[11px]">
              Connection trouble
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">
              Looks like we&apos;re getting a flood of players right now
            </h1>
            <p className="text-sm sm:text-base leading-relaxed mb-8" style={{ color: "#59513F" }}>
              The site just got shared and a lot of people are planning at once. Your plan
              usually needs just a moment — hit <span className="font-bold" style={{ color: "#27231B" }}>Try again</span>,
              or if you keep timing out, use the mirror site below.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => reset()}
                style={{ backgroundColor: "#9E3E24", color: "#FBF8EE" }}
                className="px-6 py-2.5 rounded-md font-bold hover:opacity-90 transition-opacity"
              >
                Try again
              </button>
              <a
                href="https://skin-route.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{ border: "2px solid #27231B", color: "#27231B" }}
                className="px-6 py-2.5 rounded-md font-bold hover:opacity-80 transition-opacity"
              >
                Open mirror site
              </a>
            </div>
            {process.env.NODE_ENV === "development" && error?.message ? (
              <p className="mt-8 text-xs break-words" style={{ color: "#6E654F" }}>{error.message}</p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
