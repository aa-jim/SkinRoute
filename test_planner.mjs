import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Read data files
const eventsFile = JSON.parse(readFileSync("data/events.json", "utf-8"));
const events = eventsFile.events;
const packsData = JSON.parse(readFileSync("data/packs.json", "utf-8"));

const event = events.find(e => e.id === "aspirants_2026");
if (!event) { console.error("aspirants_2026 not found"); process.exit(1); }

// Monkey-patch module resolution for @/ alias
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent) {
  if (request.startsWith("@/")) {
    const resolved = request.replace("@/", 
      require("path").resolve(process.cwd()) + "/");
    return origResolve.call(this, resolved, parent);
  }
  return origResolve.call(this, request, parent);
};

const { buildPlan } = await import("./lib/planOrchestrator.js");

const scenarios = [
  
  { diamonds: 0, passes: 0, firstPassDate: null, label: "0 dia, 0 passes" },
  { diamonds: 0, passes: 0, firstPassDate: "2026-07-25", label: "0 dia, 0 passes (early)" },
  { diamonds: 500, passes: 0, firstPassDate: null, label: "500 dia, 0 passes" },
  { diamonds: 500, passes: 1, firstPassDate: "2026-07-28", label: "500 dia, 1 pass (D1)" },
  { diamonds: 1000, passes: 2, firstPassDate: "2026-07-28", label: "1000 dia, 2 passes (D1)" },
  { diamonds: 1500, passes: 3, firstPassDate: "2026-07-28", label: "1500 dia, 3 passes (D1)" },
  { diamonds: 2000, passes: 4, firstPassDate: "2026-07-25", label: "2000 dia, 4 passes (D-3)" },
  { diamonds: 2000, passes: 4, firstPassDate: "2026-07-28", label: "2000 dia, 4 passes (D1)" },
  { diamonds: 2500, passes: 5, firstPassDate: "2026-07-25", label: "2500 dia, 5 passes (D-3)" },
  { diamonds: 3000, passes: 6, firstPassDate: "2026-07-25", label: "3000 dia, 6 passes (D-3)" },
  { diamonds: 4000, passes: 4, firstPassDate: "2026-07-25", label: "4000 dia, 4 passes (D-3)" },
];

const target = { itemId: "angela_cyber_cherubin", mode: "worst" };
const ownedItems = { skins: [], groups: {} };

for (const s of scenarios) {
  console.log(`\n====== ${s.label} ======`);
  const resources = { diamonds: s.diamonds, weeklyPasses: s.passes, firstPassDate: s.firstPassDate };
  try {
    const plan = buildPlan(event, resources, target, ownedItems, "realistic");
    const packs = plan.recharge?.packsUsed ?? [];
    const totalBdt = plan.recharge?.totalBdt ?? 0;
    const totalDia = plan.recharge?.totalDia ?? 0;
    console.log(`  Total packs: ${totalDia} dia, ৳${totalBdt}`);
    for (const p of packs) {
      const label = p.id === "weekly_pass" ? "pass" : p.id;
      console.log(`  ${label} ×${p.count}: ${p.count * p.dia} dia, ৳${p.count * p.bdt}`);
    }
    const rows = plan.daySchedule?.rows ?? [];
    const totals = plan.daySchedule?.totals ?? { draws: 0, dia: 0 };
    const day20 = rows.find(r => r.day === 20);
    const day20Draws = day20?.draws ?? 0;
    const has10x = day20Draws >= 10;
    console.log(`  Day 20 draws: ${day20Draws} ${has10x ? "✅ 10x done" : "❌ 10x MISSED"}`);
    console.log(`  Total draws: ${totals.draws}, Total dia spent: ${totals.dia}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}
