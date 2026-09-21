"use client";

import { Gem, Ticket } from "lucide-react";

const packNameMap = {
  fp_50: "First Purchase Bonus 50 dias",
  fp_150: "First Purchase Bonus 150 dias",
  fp_250: "First Purchase Bonus 250 dias",
  fp_500: "First Purchase Bonus 500 dias",
};

export default function PackRecommendation({ recharge, eventDurationDays }) {
  if (!recharge || recharge.impossible) {
    return (
      <div className="rounded-xl border border-brick/40 bg-brick/10 px-5 py-4 mb-8">
        <p className="text-sm text-ink">
          No pack combination reaches the target within the event window with current inputs.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h3 className="font-mono text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft mb-3">
        Recommended Recharge
      </h3>
      <div className="sm:hidden flex flex-col gap-2.5 mb-3">
        {recharge.packsUsed.map((pack, i) => (
          <div key={i} className="rounded-lg border border-line-strong bg-white/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              {pack.type === "pass" ? <Ticket size={15} className="text-brick" /> : <Gem size={15} className="text-gold-dark" />}
              <span className="font-heading font-bold text-ink text-sm">
                {packNameMap[pack.id] || (pack.id.startsWith("r_") ? pack.id.replace("r_", "") + " dias" : pack.id)}
              </span>
              <span className="ml-auto font-mono text-xs font-semibold text-paper-raised bg-ink px-2 py-0.5 rounded-full">
                x{pack.count}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-ink-soft capitalize">{pack.type}</span>
              <span className="text-[#40607F]">{(pack.diaTotal ? pack.dia : pack.count * pack.dia).toLocaleString()} dia</span>
              <span className="text-gold-dark font-semibold">৳{(pack.count * pack.bdt).toLocaleString()}</span>
            </div>
          </div>
        ))}
        <div className="rounded-lg border border-line-strong bg-paper-dim px-4 py-3 flex justify-between items-center">
          <span className="font-heading font-bold text-ink text-sm">Total</span>
          <span className="flex items-center gap-3">
            <span className="text-[#40607F] font-heading font-bold text-sm">{recharge.totalDia.toLocaleString()} dia</span>
            <span className="text-gold-dark font-heading font-bold text-sm">৳{recharge.totalBdt.toLocaleString()}</span>
          </span>
        </div>
      </div>

      <div className="hidden sm:block rounded-lg border-2 border-ink bg-paper-raised shadow-hard overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-paper-dim font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">
              <th className="text-left px-4 py-2.5 font-medium">Pack</th>
              <th className="text-left px-4 py-2.5 font-medium">Type</th>
              <th className="text-right px-4 py-2.5 font-medium">Qty</th>
              <th className="text-right px-4 py-2.5 font-medium">Diamonds</th>
              <th className="text-right px-4 py-2.5 font-medium">BDT</th>
            </tr>
          </thead>
          <tbody>
            {recharge.packsUsed.map((pack, i) => (
              <tr key={i} className="border-t border-line-strong">
                <td className="px-4 py-2.5 text-ink font-medium flex items-center gap-1.5">
                  {pack.type === "pass" ? <Ticket size={13} className="text-brick" /> : <Gem size={13} className="text-gold-dark" />}
                  {packNameMap[pack.id] || (pack.id.startsWith("r_") ? pack.id.replace("r_", "") + " dias" : pack.id)}
                </td>
                <td className="px-4 py-2.5 text-ink-soft capitalize">{pack.type}</td>
                <td className="px-4 py-2.5 text-right text-ink">×{pack.count}</td>
                <td className="px-4 py-2.5 text-right text-ink">{(pack.diaTotal ? pack.dia : pack.count * pack.dia).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-gold-dark font-semibold">
                  ৳{(pack.count * pack.bdt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink bg-paper-dim">
              <td colSpan={3} className="px-4 py-2.5 text-ink font-heading font-bold">Total</td>
              <td className="px-4 py-2.5 text-right text-ink font-heading font-bold">
                {recharge.totalDia.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right text-gold-dark font-heading font-bold">
                ৳{recharge.totalBdt.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-ink-soft mt-2">
        Plan completes by day {recharge.completionDay} of {eventDurationDays}.
      </p>
    </div>
  );
}
