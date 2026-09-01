"use client";

import { useWizard } from "@/lib/wizardContext";

export default function StepTwo() {
  const { event, target, setTarget, goNext, goBack } = useWizard();

  const isBingo = event.type === "bingo";
  const skins = event.shop_items ?? [];
  const eventLabel = event.card_label?.toUpperCase() ?? event.name?.split(" ")[0]?.toUpperCase() ?? "EVENT";

  // Bingo: no per-skin selection yet (any-1-skin mode only) — Next is always enabled.
  // Non-bingo: must pick a target skin before proceeding.
  const canProceed = isBingo || !!target?.itemId;

  const handleSelect = (skin) => {
    if (isBingo) return;
    setTarget({ itemId: skin.id, mode: "specific", outfit1: false });
  };

  const toggleOutfit1 = () => {
    setTarget((prev) => ({ ...prev, outfit1: !prev?.outfit1 }));
  };

  const selectedSkin = skins.find((s) => s.id === target?.itemId);
  const hasOutfit1 = !!selectedSkin?.outfit1_variant;

  return (
    <div>
      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-ink mb-1">
        {isBingo ? "Event Skins" : "Select target skin"}
      </h2>
      <p className="text-sm text-ink-soft mb-6">
        {isBingo
          ? `First completed ${event.id === "aspirants_2026" ? "box" : "bingo line"} wins any 1 unowned skin below`
          : "Choose the skin you want to get"}
      </p>

      {skins.length === 0 ? (
        <p className="text-ink-soft text-sm py-8 text-center">
          Skin data for this event isn&apos;t available yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {skins.map((skin) => {
            const isSelected = !isBingo && target?.itemId === skin.id;
            const isPity = isBingo && skin.id === event.bingo?.guaranteed_pity_skin_id;
            const isDiscounted =
              skin.base_crest_cost != null && skin.crest_cost < skin.base_crest_cost;
            
            // Determine the dynamic label: use skin tier if it exists, otherwise use the event name fallback
            const skinLabel = skin.tier ? skin.tier.toUpperCase() : eventLabel;

            return (
              <button
                key={skin.id}
                type="button"
                onClick={() => handleSelect(skin)}
                disabled={isBingo}
                className={`relative rounded-xl overflow-hidden border-2 bg-white text-left transition-all ${
                  isBingo ? "cursor-default" : "cursor-pointer"
                } ${
                  isSelected
                    ? "border-brick shadow-[3px_3px_0_0_#9E3E24]"
                    : "border-line-strong hover:border-ink"
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 left-1.5 z-10 bg-brick text-[#FFFBF2] text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-wide">
                    TARGET
                  </span>
                )}
                
                {/* Dynamically render the updated skinLabel here */}
                <span className="absolute top-0 right-0 z-10 bg-ink text-paper-raised text-[8px] font-bold px-1.5 py-0.5 rounded-bl-md tracking-wide">
                  {skinLabel}
                </span>

                <div
                  className="aspect-square bg-cover bg-center bg-paper-dim"
                  style={skin.image ? { backgroundImage: `url(${skin.image})` } : undefined}
                />

                <div className="px-2.5 py-2.5 text-center">
                  <p className="font-heading font-bold text-xs text-ink leading-tight">
                    {skin.name}
                  </p>
                  <p className="text-[11px] font-semibold text-gold-dark mt-0.5 mb-1">
                    {skin.hero}
                  </p>

                  {isBingo ? (
                    isPity ? (
                      <p className="text-[10px] font-bold text-gold-dark">
                        Guaranteed in 10x
                      </p>
                    ) : (
                      <p className="text-[10.5px] font-semibold text-fern">
                        {event.id === "aspirants_2026" ? "Box completion" : "Line completion"}
                      </p>
                    )
                  ) : isDiscounted ? (
                    <p className="text-[11px]">
                      <span className="line-through text-ink-soft mr-1">
                        {skin.base_crest_cost}
                      </span>
                      <span className="font-bold text-gold-dark">
                        {skin.crest_cost} Crests
                      </span>
                    </p>
                  ) : (
                    <p className="text-[11px] font-bold text-gold-dark">
                      {skin.crest_cost} Crests
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isBingo && hasOutfit1 && (
        <div className="border-2 border-ink rounded-xl bg-paper-dim p-4 mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-md bg-cover bg-center bg-paper-dim shrink-0"
              style={
                selectedSkin.outfit1_variant?.image
                  ? { backgroundImage: `url(${selectedSkin.outfit1_variant.image})` }
                  : selectedSkin.image
                    ? { backgroundImage: `url(${selectedSkin.image})` }
                    : undefined
              }
            />
            <div>
              <p className="font-heading font-bold text-sm text-ink">
                Also get Painted Skin variant?
              </p>
              <p className="text-[11.5px] text-ink-soft mt-0.5">
                Outfit 1 companion piece for {selectedSkin.hero} —{" "}
                <span className="text-gold-dark font-semibold">
                  +{selectedSkin.outfit1_variant.crest_cost} Crests
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleOutfit1}
            className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
              target?.outfit1 ? "bg-fern" : "bg-line-strong"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                target?.outfit1 ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      )}

      {!isBingo && hasOutfit1 && target?.outfit1 && (
        <div className="text-xs text-ink-soft mb-5 max-w-[220px]">
          <div className="flex justify-between">
            <span>{selectedSkin.name}</span>
            <span>{selectedSkin.crest_cost} Crests</span>
          </div>
          <div className="flex justify-between">
            <span>Painted Skin (Outfit 1)</span>
            <span>+{selectedSkin.outfit1_variant.crest_cost} Crests</span>
          </div>
          <div className="flex justify-between font-bold text-gold-dark mt-1 pt-1 border-t border-line-strong">
            <span>Total</span>
            <span>{selectedSkin.crest_cost + selectedSkin.outfit1_variant.crest_cost} Crests</span>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className="px-4 sm:px-6 py-2.5 rounded-md border-2 border-ink text-ink font-heading font-semibold hover:bg-ink hover:text-paper-raised transition-colors whitespace-nowrap"
        >
          <span className="sm:hidden">←</span>
          <span className="hidden sm:inline">← Previous Step</span>
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!canProceed}
          className="px-4 sm:px-6 py-2.5 rounded-md bg-brick text-[#FFFBF2] font-heading font-semibold shadow-hard-sm hover:bg-brick-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <span className="sm:hidden">→</span>
          <span className="hidden sm:inline">Next Step →</span>
        </button>
      </div>
    </div>
  );
}
