import Image from "next/image";

// Page-anchored decorative layer: rendered inside each page's own relative
// <main> (home, help, wizard). Hidden below md (phones keep the clean paper
// look). Negative z-index paints it above the body's paper background but
// below ALL content (no per-page z-wrappers needed). overflow-hidden clips
// the art that intentionally bleeds past the edges.
//
// `fixed` pins the art to the viewport (doesn't scroll — used on help/wizard
// pages, which have no footer to slide over it); default (home) anchors it to
// the page and scrolls with content, so the footer never covers the art.
export default function PageDecor({ fixed = false }) {
  return (
    <div
      aria-hidden="true"
      className={`hidden md:block pointer-events-none overflow-hidden -z-10 ${
        fixed ? "fixed inset-0" : "absolute inset-0"
      }`}
    >
      {/* Left Side: Parallelograms + Zhuxin */}
      <div className="absolute left-0 top-0 bottom-0 w-[24rem] lg:w-[30rem] xl:w-[34rem]">
        {/* Parallel Bars (high on left, sloping down to the right) */}
        {/* Vertical position differs by placement: home keeps its tuned offsets;
            the fixed-pinned pages (help/wizard, viewport-box) sit lower so the
            bars clear the centered content. */}
        <div
          className={`absolute -left-12 flex flex-col gap-8 lg:gap-10 xl:gap-12 skew-y-[20deg] z-0 ${
            fixed
              ? "top-[43%] lg:top-[45%] xl:top-[39%]"
              : "top-[42%] xl:top-[38%]"
          }`}
        >
          <div className="w-[0] lg:w-[24rem] xl:w-[34rem] h-12 lg:h-20 xl:h-24 bg-[#2D1E17]" />
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
      {/* Vertical position differs by placement: home (page-anchored) keeps its
          tuned high offsets; the fixed-pinned pages (help/wizard, viewport-box)
          sit lower on screen, clear of the content. */}
      <div
        className={`absolute -right-0 bottom-0 w-[12rem] lg:w-[16rem] xl:w-[20rem] z-0 ${
          fixed
            ? "top-[60%] lg:top-[45%] xl:top-[38%]"
            : "top-[45%] lg:top-[27%] xl:top-[14%]"
        }`}
      >
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
  );
}