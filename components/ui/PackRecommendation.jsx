"use client";

import { Gem, Ticket } from "lucide-react";

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
      <div className="rounded-xl border border-border-subtle bg-navy overflow-hidden">
        <table className="w-full text-sm">
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
                  {pack.id}
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