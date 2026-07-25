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
      <div className="rounded-xl border border-accent-coral/40 bg-accent-coral/10 px-5 py-4 mb-8">
        <p className="text-sm text-text-primary">
          No pack combination reaches the target within the event window with current inputs.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h3 className="text-sm font-heading font-bold text-text-primary uppercase tracking-wide mb-3">
        Recommended Recharge
      </h3>
      <div className="sm:hidden flex flex-col gap-2.5 mb-3">
        {recharge.packsUsed.map((pack, i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-navy px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              {pack.type === "pass" ? <Ticket size={15} className="text-accent-coral" /> : <Gem size={15} className="text-accent-gold" />}
              <span className="font-heading font-bold text-text-primary text-sm">
                {packNameMap[pack.id] || (pack.id.startsWith("r_") ? pack.id.replace("r_", "") + " dias" : pack.id)}
              </span>
              <span className="ml-auto text-xs font-heading font-bold text-navy bg-accent-gold px-2 py-0.5 rounded-full">
                x{pack.count}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted capitalize">{pack.type}</span>
              <span className="text-[#4388F0]">{(pack.count * pack.dia).toLocaleString()} dia</span>
              <span className="text-accent-gold font-semibold">৳{(pack.count * pack.bdt).toLocaleString()}</span>
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-border-subtle bg-navy-light px-4 py-3 flex justify-between items-center">
          <span className="font-heading font-bold text-text-primary text-sm">Total</span>
          <span className="flex items-center gap-3">
            <span className="text-[#4388F0] font-heading font-bold text-sm">{recharge.totalDia.toLocaleString()} dia</span>
            <span className="text-accent-gold font-heading font-bold text-sm">৳{recharge.totalBdt.toLocaleString()}</span>
          </span>
        </div>
      </div>

      <div className="hidden sm:block rounded-xl border border-border-subtle bg-navy overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-navy-light text-text-muted text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium">Pack</th>
              <th className="text-left px-4 py-2.5 font-medium">Type</th>
              <th className="text-right px-4 py-2.5 font-medium">Qty</th>
              <th className="text-right px-4 py-2.5 font-medium">Diamonds</th>
              <th className="text-right px-4 py-2.5 font-medium">BDT</th>
            </tr>
          </thead>
          <tbody>
            {recharge.packsUsed.map((pack, i) => (
              <tr key={i} className="border-t border-border-subtle">
                <td className="px-4 py-2.5 text-text-primary font-medium flex items-center gap-1.5">
                  {pack.type === "pass" ? <Ticket size={13} className="text-accent-coral" /> : <Gem size={13} className="text-accent-gold" />}
                  {packNameMap[pack.id] || (pack.id.startsWith("r_") ? pack.id.replace("r_", "") + " dias" : pack.id)}
                </td>
                <td className="px-4 py-2.5 text-text-muted capitalize">{pack.type}</td>
                <td className="px-4 py-2.5 text-right text-text-primary">×{pack.count}</td>
                <td className="px-4 py-2.5 text-right text-text-primary">{(pack.count * pack.dia).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-accent-gold font-semibold">
                  ৳{(pack.count * pack.bdt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-subtle bg-navy-light">
              <td colSpan={3} className="px-4 py-2.5 text-text-primary font-heading font-bold">Total</td>
              <td className="px-4 py-2.5 text-right text-text-primary font-heading font-bold">
                {recharge.totalDia.toLocaleString()}
              </td>
              <td className="px-4 py-2.5 text-right text-accent-gold font-heading font-bold">
                ৳{recharge.totalBdt.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-text-muted mt-2">
        Plan completes by day {recharge.completionDay} of {eventDurationDays}.
      </p>
    </div>
  );
}