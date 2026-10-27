import localFont from "next/font/local";
import SupportButton from "@/components/ui/SupportButton";
import FirstVisitNotice from "@/components/ui/FirstVisitNotice";
import "./globals.css";

// Fonts are self-hosted (app/fonts/, OFL licenses included) instead of
// next/font/google: builds must not depend on reaching Google Fonts, which
// hard-fails `next build` on networks that block fonts.googleapis.com.
const inter = localFont({
  src: "./fonts/Inter-Variable.ttf",
  variable: "--font-inter",
  display: "swap",
});

// Rajdhani — geometric display sans for headings and the "playbook" voice.
const rajdhani = localFont({
  src: [
    { path: "./fonts/Rajdhani-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Rajdhani-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Rajdhani-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Rajdhani-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-rajdhani",
  display: "swap",
});

// Mono for dates, numbers and micro-labels — the ledger feel.
const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Skin Route",
  description:
    "Plan the cheapest way to get your Mobile Legends event skin. Enter your resources, pick your target, get a day-by-day schedule.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${rajdhani.variable} ${plexMono.variable} font-body bg-paper text-ink antialiased`}
      >
        {children}
        <SupportButton />
        <FirstVisitNotice />
      </body>
    </html>
  );
}
