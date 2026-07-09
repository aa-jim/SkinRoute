import { Inter, Rajdhani } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata = {
  title: "Skin Route — MLBB Skin Planner",
  description:
    "Plan the cheapest way to get your Mobile Legends event skin. Enter your resources, pick your target, get a day-by-day schedule.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${rajdhani.variable} font-body bg-bg-page text-text-primary antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
