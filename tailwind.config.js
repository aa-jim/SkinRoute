/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Skin Route palette — confirmed from landing page design
        navy: "#0B0E1A",
        "navy-light": "#151A2E",
        "accent-gold": "#D6A94B",
        "accent-blue": "#2E6BE6",
        "accent-green": "#3DDC5C",
        "accent-amber": "#EF9F27",
        "accent-coral": "#D85A30",
        "badge-cyan": "#5EEAD4",
        "badge-purple": "#C084FC",
        "badge-green": "#A3E635",
        "text-primary": "#F5F6FA",
        "text-muted": "#9CA0B5",
        "border-subtle": "#2A2E45",
      },
      fontFamily: {
        heading: ["var(--font-rajdhani)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
