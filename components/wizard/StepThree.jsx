"use client";

import { Check } from "lucide-react";
import { useWizard } from "@/lib/wizardContext";

export default function StepThree() {
  const { event, ownedItems, setOwnedItems, goNext, goBack } = useWizard();

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
      <h2 className="font-heading text-xl sm:text-2xl font-bold text-accent-gold mb-1">
        Prize pool — what do you already own?
      </h2>
      <p className="text-sm text-text-muted mb-6">
        Owned items convert future pulls into crests instead of duplicates — speeds up reaching your target
      </p>

      {/* Section A — target-tier skins, image grid, same pattern as Step 2 */}
      {targetSkins.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
            {event.type === "collector" ? "Collector / Luckybox Skins" : "Event Skins"}
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 sm:gap-3">
            {targetSkins.map((skin) => {
              const isOwned = ownedSkinIds.includes(skin.id);
              return (
                <button
                  key={skin.id}
                  type="button"
                  onClick={() => toggleSkinOwned(skin.id)}
                  className={`relative rounded-lg overflow-hidden border-2 bg-navy text-left transition-all cursor-pointer ${
                    isOwned
                      ? "border-accent-green shadow-[0_0_0_2px_#1D9E75,0_6px_14px_rgba(29,158,117,0.3)]"
                      : "border-border-subtle hover:border-accent-green/50"
                  }`}
                >
                  <div
                    className="aspect-square bg-cover bg-center bg-navy-light relative"
                    style={skin.image ? { backgroundImage: `url(${skin.image})` } : undefined}
                  >
                    {isOwned && (
                      <div className="absolute inset-0 bg-accent-green/40 flex items-center justify-center">
                        <span className="flex items-center gap-1 bg-accent-green text-navy text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          <Check size={11} strokeWidth={3} />
                          OWNED
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="px-1.5 py-1.5 text-center">
                    <p className="font-heading font-bold text-[10.5px] text-text-primary leading-tight truncate">
                      {skin.name}
                    </p>
                    <p className="text-[9.5px] font-semibold text-accent-gold mt-0.5 truncate">
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
          <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
            Other Rewards
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((group) => {
              const count = groupCounts[group.id] ?? 0;
              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-navy border border-border-subtle"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{group.name}</p>
                    <p className="text-xs text-text-muted">
                      Dupe = {group.crest_value} crests
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setGroupCount(group.id, -1, group.count)}
                      className="w-8 h-8 rounded-lg bg-accent-gold text-navy font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
                    >
                      −
                    </button>
                    <span className="min-w-[44px] text-center bg-navy-light border border-border-subtle rounded-lg py-1.5 px-1 text-text-primary font-heading font-bold text-sm">
                      {count}/{group.count}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGroupCount(group.id, 1, group.count)}
                      className="w-8 h-8 rounded-lg bg-accent-gold text-navy font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
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
        <p className="text-text-muted text-sm py-8 text-center">
          Prize pool data for this event isn&apos;t available yet.
        </p>
      )}

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className="px-4 sm:px-6 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <span className="sm:hidden">←</span>
          <span className="hidden sm:inline">← Previous Step</span>
        </button>
        <button
          type="button"
          onClick={goNext}
          className="px-4 sm:px-6 py-2.5 rounded-lg bg-accent-blue text-white font-heading font-bold hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <span className="sm:hidden">→</span>
          <span className="hidden sm:inline">Next Step →</span>
        </button>
      </div>
    </div>
  );
}