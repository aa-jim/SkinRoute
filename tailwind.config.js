/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    // Event banner gradients live in data (banner_gradient strings) — scan so
    // their arbitrary from-/via-/to- classes actually get generated.
    "./data/**/*.json",
  ],
  theme: {
    extend: {
      colors: {
        // "Game-plan ledger" palette — warm paper + ink, muted print accents.
        paper: {
          DEFAULT: "#F2EDDF", // page background
          raised: "#FBF8EE",  // cards / raised surfaces
          dim: "#E9E2CE",     // table heads / wells
          deep: "#DED3B8",    // strongest well tint
        },
        ink: {
          DEFAULT: "#27231B", // primary text
          soft: "#59513F",    // secondary text
          faint: "#6E654F",   // micro-labels (kept AA-readable on paper)
        },
        line: {
          DEFAULT: "#DAD1BB", // hairline borders
          strong: "#BEB294",  // defined borders (inputs, tables)
        },
        brick: { DEFAULT: "#9E3E24", dark: "#7F311C" }, // actions / danger
        fern:  { DEFAULT: "#4E6B38", dark: "#3F582B" }, // success / owned
        gold:  { DEFAULT: "#A17A22", dark: "#6F5314" }, // diamonds / costs
        sea:   { DEFAULT: "#395671", dark: "#2C455C" }, // info / dia values
        plum:  { DEFAULT: "#6E5590", dark: "#584373" }, // bingo / supply windows
      },
      fontFamily: {
        heading: ["var(--font-fraunces)", "Georgia", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Hard offset "print" shadows — no blur, no glow.
        "hard-sm": "2px 2px 0 0 rgba(39,35,27,0.9)",
        hard: "3px 3px 0 0 rgba(39,35,27,0.9)",
        "hard-lg": "6px 6px 0 0 rgba(39,35,27,0.9)",
      },
    },
  },
  plugins: [],
};
