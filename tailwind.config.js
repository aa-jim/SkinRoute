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
        // Skin Route palette — placeholder, will be finalized against landing page design
        navy: "#10152B",
        "bg-page": "#F5F6FA",
        "accent-gold": "#D6A94B",
        "accent-blue": "#2E6BE6",
        "accent-green": "#1DA35A",
        "accent-amber": "#EF9F27",
        "accent-coral": "#D85A30",
        "text-primary": "#1A1B2E",
        "text-muted": "#6B6C80",
        "border-subtle": "#E4E5EE",
      },
      fontFamily: {
        heading: ["var(--font-rajdhani)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
