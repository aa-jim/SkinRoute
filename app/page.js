import Image from "next/image";
import Navbar from "@/components/layout/Navbar";
import EventCarousel from "@/components/ui/EventCarousel";
import { getEvents } from "@/lib/eventRepo";
import { deriveStatus } from "@/lib/eventHelpers";

export const dynamic = "force-dynamic";

export default function Home() {
  const events = getEvents()
    .filter((e) => e.status !== "hidden" && deriveStatus(e) !== "ended")
    .sort((a, b) => {
      const aStatus = deriveStatus(a);
      const bStatus = deriveStatus(b);
      if (aStatus === "coming_soon" && bStatus !== "coming_soon") return 1;
      if (bStatus === "coming_soon" && aStatus !== "coming_soon") return -1;
      return (a.start_date ?? "").localeCompare(b.start_date ?? "");
    });

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Decorative background elements */}
      <div
        aria-hidden="true"
        className="hidden md:block pointer-events-none absolute inset-0 overflow-hidden z-0"
      >
        {/* Left Side: Parallelograms + Zhuxin */}
        <div className="absolute left-0 top-0 bottom-0 w-[24rem] lg:w-[30rem] xl:w-[34rem]">
          {/* Parallel Bars (high on left, sloping down to the right) */}
          <div className="absolute -left-12 top-[42%] xl:top-[36%] flex flex-col gap-8 lg:gap-10 xl:gap-12 skew-y-[20deg] z-0">
            <div className="w-[0] lg:w-[24rem] xl:w-[28rem] h-12 lg:h-20 xl:h-24 bg-[#2D1E17]" />
            <div className="w-[0] lg:w-[24rem] xl:w-[28rem] h-12 lg:h-20 xl:h-24 bg-[#2D1E17]" />
          </div>

          {/* Zhuxin Character Art (shifted higher up) */}
          <div className="relative w-0 lg:w-[36rem] xl:w-[40rem] h-[90%] top-[24%] lg:top-[20%] xl:top-[13%] left-[-10rem] xl:left-[-8rem] z-10">
            <Image
              src="/assets/bg/zhuxin_bg.png"
              alt=""
              fill
              sizes="(min-width: 1024px) 30rem, 24rem"
              priority
              className="object-contain object-left-top"
            />
          </div>
        </div>

        {/* Right Side: Butterfly Cluster (smaller & pushed to right edge) */}
        <div className="absolute -right-0 top-[45%] lg:top-[27%] xl:top-[14%] bottom-0 w-[12rem] lg:w-[16rem] xl:w-[20rem] z-0">
          <Image
            src="/assets/bg/butterfly.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 14rem, 8rem"
            priority
            className="object-contain object-right"
          />
        </div>
      </div>

      {/* Main Content Layer */}
      <div className="relative z-10">
        <Navbar />

        {/* Hero */}
        <section className="max-w-[1200px] mx-auto text-center px-6 pt-14 pb-8">
          <h1 className="font-heading text-3xl sm:text-5xl md:text-[3.4rem] font-semibold text-ink leading-[1.1] tracking-tight text-balance">
            Plan the cheapest path to your favorite skin
          </h1>
          
          <p className="mt-6 text-sm sm:text-base text-ink-soft max-w-xxl mx-auto leading-relaxed">
            Pick a running event, enter your resources, get a day by day draw
            schedule + recharge plan.
          </p>
        </section>

        {/* Event selector */}
        <section className="px-6 sm:px-10 pb-16">
          <EventCarousel events={events} />
        </section>

        {/* Footer */}
        <footer className="mt-8 bg-ink text-paper/80">
          <div className="max-w-[900px] mx-auto px-6 py-8">
            <p className="text-xs text-center text-paper/80">
              Built for MLBB Players, by MLBB Player. Data Verified against official rules.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}