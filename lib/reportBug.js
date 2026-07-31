import { buildPlan, todayEventDay } from "./planOrchestrator.js";

function fmtValue(v) {
  if (v === "" || v === null || v === undefined) return "-";
  return String(v);
}

function fpClaimedList(fpClaimed) {
  const list = Object.entries(fpClaimed ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  return list.length > 0 ? list.join(", ") : "none";
}

function packsSummary(plan) {
  const packs = plan?.recharge?.packsUsed ?? [];
  if (packs.length === 0) return "-";
  return packs.map((p) => `${p.count}\u00d7 ${p.id}`).join(", ");
}

function buildFields({ event, target = null, plan, planError, startDay }) {
  return {
    "Event": event?.name ?? event?.id ?? "-",
    "Plan Start Day": event ? fmtValue(startDay) : "-",
    "Target": fmtValue(target?.itemId),
    "Draws Needed": plan ? fmtValue(plan.drawsNeeded?.draws) : "-",
    "Recharge BDT": plan ? fmtValue(plan.recharge?.totalBdt ?? 0) : "-",
    "Plan Error": planError ?? (plan ? "-" : "plan not built"),
  };
}

function buildTechnical({ event, resources = {}, target = null, ownedItems = null, startDay, plan, planError }) {
  const lines = [
    `Event: ${event ? `${event.name} (${event.id})` : "— (no event context)"}`,
    `Reported: ${new Date().toISOString()}`,
  ];
  if (event) {
    lines.push(
      `Type: ${event.type}`,
      `Window: ${event.start_date} \u2192 ${event.end_date} (${event.duration_days} days)`,
      `Event day at report: ${todayEventDay(event)}`
    );
  }

  lines.push("", "Inputs:");
  lines.push(
    `- Diamonds: ${fmtValue(resources.diamonds)}`,
    `- CoA: ${fmtValue(resources.coa)}`,
    `- Weekly passes: ${fmtValue(resources.weeklyPasses)}${resources.passDaysRemaining ? ` (${resources.passDaysRemaining} days remaining)` : ""}`,
    `- FP claimed: ${fpClaimedList(resources.fpClaimed)}`,
    `- Target: ${target?.itemId ?? "-"}`,
    `- Owned: ${(ownedItems?.skins ?? []).length} skins / ${Object.keys(ownedItems?.groups ?? {}).length} groups`
  );

  lines.push("", "Plan (realistic):");
  if (planError) {
    lines.push(`- ERROR: ${planError}`);
  } else if (plan) {
    lines.push(
      `- Start day: ${startDay}`,
      `- Draws needed: ${plan.drawsNeeded?.draws ?? "-"}`,
      `- Recharge: ${plan.recharge?.totalBdt ?? 0} BDT / ${plan.recharge?.totalDia ?? 0} dia`,
      `- Total diamonds for plan: ${plan.totalDiamondsForPlan ?? "-"}`
    );
    const packs = plan.recharge?.packsUsed ?? [];
    if (packs.length > 0) {
      lines.push("- Packs:", ...packs.map((p) => `  ${p.count}\u00d7 ${p.id} (${p.bdt} BDT each, ${p.dia} dia)`));
    }
    const rows = plan.daySchedule?.rows ?? [];
    if (rows.length > 0) {
      lines.push("- Day schedule:");
      for (const r of rows) {
        lines.push(`  Day ${r.day}: ${r.draws} draws, ${r.diaSpent} dia spent, ${r.diaLeft ?? "-"} left${r.notes?.length ? ` | ${r.notes.join("; ")}` : ""}`);
      }
    }
  } else {
    lines.push("- (plan not built)");
  }

  return lines.join("\n");
}

export function buildReport(context = null) {
  const ctx = context ?? {};
  const { event, resources = {}, target = null, ownedItems = null } = ctx;
  // Mirrors StepFour's "Start Today" vs "Start from Day 1" toggle; default true
  const startFromToday = ctx.startFromToday !== false;
  const startDay = event
    ? Math.min(
        event.duration_days ?? 1,
        Math.max(1, startFromToday ? todayEventDay(event) : 1)
      )
    : 1;

  let plan = null;
  let planError = null;
  const canBuild = event && (event.type === "bingo" || target);
  if (canBuild) {
    try {
      plan = buildPlan(event, resources, target, ownedItems ?? { groups: {}, skins: [] }, "realistic", startDay);
    } catch (err) {
      planError = err?.message ?? String(err);
    }
  }

  return {
    description: event ? `Bug in the ${event.name} plan` : "Bug report",
    technical: buildTechnical({ event, resources, target, ownedItems, startDay, plan, planError }),
    fields: buildFields({ event, target, plan, planError, startDay }),
  };
}
