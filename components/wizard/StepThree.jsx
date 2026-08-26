"use client";

import { Check } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";

export default function StepThree() {
  const { event, target, ownedItems, setOwnedItems, goNext, goBack } = useWizard();

  const targetSkins = event.shop_items ?? [];
  const groups = (event.prize_pool ?? []).filter(
  (g) => g.type !== "skin_group" && g.type !== "crest" && g.type !== "items"
);

  const ownedSkinIds = ownedItems.skins ?? [];
  const groupCounts = ownedItems.groups ?? {};

  const toggleSkinOwned = (skinId) => {
    setOwnedItems((prev) => {
      const current = prev.skins ?? [];
      const next = current.includes(skinId)
        ? current.filter((id) => id !== skinId)
        : [...current, skinId];
      return { ...prev, skins: next };
    });
  };

  const setGroupCount = (groupId, delta, max) => {
    setOwnedItems((prev) => {
      const current = prev.groups ?? {};
      const currentVal = current[groupId] ?? 0;
      const next = Math.max(0, Math.min(max, currentVal + delta));
      return { ...prev, groups: { ...current, [groupId]: next } };
    });
  };

  return (
    <div>
      <h2 className="font-heading text-xl sm:text-2xl font-semibold text-ink mb-1">
        Prize pool — what do you already own?
      </h2>
      {event.type !== "bingo" && (
        <p className="text-sm text-ink-soft mb-6">
          Owned items convert future pulls into crests instead of duplicates — speeds up reaching your target
        </p>
      )}

      {/* Section A — target-tier skins, image grid, same pattern as Step 2 */}
      {targetSkins.length > 0 && (
        <div className="mb-8">
          <h3 className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft mb-3">
            {event.type === "collector" ? "Collector / Luckybox Skins" : "Event Skins"}
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 sm:gap-3">
            {targetSkins.map((skin) => {
              const isOwned = ownedSkinIds.includes(skin.id);
              const isTarget = target?.itemId === skin.id;
              return (
                <button
                  key={skin.id}
                  type="button"
                  disabled={isTarget}
                  onClick={() => !isTarget && toggleSkinOwned(skin.id)}
                  className={`relative rounded-lg overflow-hidden border-2 bg-white text-left transition-all ${
                    isTarget ? "border-gold/50 opacity-70 cursor-not-allowed" :
                    isOwned
                      ? "border-fern shadow-[3px_3px_0_0_#4E6B38] cursor-pointer"
                      : "border-line-strong hover:border-fern cursor-pointer"
                  }`}
                >
                  <div
                    className="aspect-square bg-cover bg-center bg-paper-dim relative"
                    style={skin.image ? { backgroundImage: `url(${skin.image})` } : undefined}
                  >
                    {isTarget ? (
                      <div className="absolute inset-0 bg-gold/20 flex items-center justify-center">
                        <span className="flex items-center gap-1 bg-brick text-[#FFFBF2] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          TARGET
                        </span>
                      </div>
                    ) : isOwned && (
                      <div className="absolute inset-0 bg-fern/30 flex items-center justify-center">
                        <span className="flex items-center gap-1 bg-fern text-[#FFFBF2] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          <Check size={11} strokeWidth={3} />
                          OWNED
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="px-1.5 py-1.5 text-center">
                    <p className="font-heading font-bold text-[10.5px] text-ink leading-tight truncate">
                      {skin.name}
                    </p>
                    <p className="text-[9.5px] font-semibold text-gold-dark mt-0.5 truncate">
                      {skin.hero}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Section B — other rarity groups, counter only, no images */}
      {groups.length > 0 && (
        <div className="mb-8">
          <h3 className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft mb-3">
            Other Rewards
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((group) => {
              const count = groupCounts[group.id] ?? 0;
              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-white/60 border border-line-strong"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{group.name}</p>
                    <p className="text-xs text-ink-soft">
                      Dupe = {group.crest_value} crests
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setGroupCount(group.id, -1, group.count)}
                      className="w-8 h-8 rounded-md bg-ink text-paper-raised font-bold flex items-center justify-center hover:bg-brick transition-colors"
                    >
                      −
                    </button>
                    <span className="min-w-[44px] text-center bg-paper-raised border border-line-strong rounded-md py-1.5 px-1 text-ink font-mono font-semibold text-sm">
                      {count}/{group.count}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGroupCount(group.id, 1, group.count)}
                      className="w-8 h-8 rounded-md bg-ink text-paper-raised font-bold flex items-center justify-center hover:bg-brick transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {targetSkins.length === 0 && groups.length === 0 && (
        <p className="text-ink-soft text-sm py-8 text-center">
          Prize pool data for this event isn&apos;t available yet.
        </p>
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
          className="px-4 sm:px-6 py-2.5 rounded-md bg-brick text-[#FFFBF2] font-heading font-semibold shadow-hard-sm hover:bg-brick-dark transition-colors whitespace-nowrap"
        >
          <span className="sm:hidden">→</span>
          <span className="hidden sm:inline">Next Step →</span>
        </button>
      </div>
    </div>
  );
}
