// lib/exporter.js
// Part 8 — PDF export (jsPDF, client-side, no backend). Excel/xlsx export dropped per
// user decision (2026-07-27) — PDF only. Clean light/printable theme (white bg, dark
// text, gold accent headers) chosen over matching the app's dark navy theme, since
// printed/downloaded reports read better in light mode regardless of in-app theme.
//
// Two content branches:
//   - Collector / Themed Crest (Legend/Special share the same plan shape): summary
//     cards, recharge pack table (if any), full day-by-day schedule.
//   - Bingo: win-condition summary (lucky/realistic/worst draws + diamond cost + pity).
//
// Reads directly from the `plan` object shape produced by planOrchestrator.js's
// buildPlan() — no recalculation happens here, this is a pure presentation layer.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Brand palette (light/printable variant — NOT the dark navy in-app theme)
const COLORS = {
  gold: [196, 144, 34],       // accent headers
  goldLight: [250, 240, 220], // header row fill
  text: [30, 30, 40],
  muted: [110, 110, 125],
  border: [225, 222, 235],
  green: [22, 130, 90],
  coral: [200, 70, 50],
  supplyTint: [243, 240, 253],
  finalTint: [232, 247, 240],
  gapTint: [252, 235, 231],
  gemBlue: [67, 136, 240],
  purple: [175, 169, 236],
};

const MARGIN = 40;

// jsPDF's built-in Helvetica font is WinAnsi-encoded — it has no glyphs for the
// Bengali Taka sign, arrows, em-dash, or middot. Those render as mangled/wrong
// characters instead of raising an error. Use plain-ASCII stand-ins everywhere.
const TK = "Tk";
const ARROW = "->";
const DASH = "-";
const BULLET = "-";

// Matches components/ui/PackRecommendation.jsx's packNameMap exactly, so PDF pack
// names read the same as the on-screen recharge table.
const PACK_NAME_MAP = {
  fp_50: "First Purchase Bonus 50 dias",
  fp_150: "First Purchase Bonus 150 dias",
  fp_250: "First Purchase Bonus 250 dias",
  fp_500: "First Purchase Bonus 500 dias",
};

function packDisplayName(p) {
  return PACK_NAME_MAP[p.id] || (p.id.startsWith("r_") ? `${p.id.replace("r_", "")} dias` : p.id);
}

function addHeader(doc, event, planLabel) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.gold);
  doc.text("Skin Route", MARGIN, 44);

  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text(event.name ?? "", MARGIN, 62);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(planLabel, MARGIN, 76);

  doc.setDrawColor(...COLORS.border);
  doc.line(MARGIN, 86, doc.internal.pageSize.getWidth() - MARGIN, 86);

  return 106; // next Y position
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(
      `Skin Route ${DASH} MLBB Skin Planner. Verify against in-game event rules before spending.`,
      MARGIN,
      doc.internal.pageSize.getHeight() - 24
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - MARGIN - 60,
      doc.internal.pageSize.getHeight() - 24
    );
  }
}

// Note strings come from idealSchedule.collector.js / idealSchedule.themedCrest.js,
// which use Unicode arrows/multiplication signs for the on-screen HTML UI (renders
// fine there). jsPDF's Helvetica font can't render those glyphs, so strip them here
// at PDF-render time only — the simulator source strings are left untouched since
// the in-app ScheduleTable.jsx still needs the real Unicode characters.
function sanitizePdfText(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\u2192/g, ARROW)   // →
    .replace(/\u00d7/g, "x")     // ×
    .replace(/\u2014/g, DASH)    // —
    .replace(/\u2013/g, DASH)    // –
    .replace(/\u2022/g, BULLET)  // •
    .replace(/\u09F3/g, TK)      // ৳
    .replace(/\u00b7/g, "|");    // ·
}

// ---------------------------------------------------------------------------
// Icon shapes — small hand-drawn vector glyphs matching ScheduleTable.jsx's
// actionIcon() mapping (lucide icons + coa-star.png), since jsPDF can't embed
// React icon components. Each drawer receives the cell's top-left (x, y) for
// that note line and draws within a compact box, then the caller offsets the
// text start x by ICON_RESERVED_WIDTH.
// ---------------------------------------------------------------------------

const ICON_SIZE = 6; // roughly matches the on-screen 13-14px icons at PDF scale
const ICON_RESERVED_WIDTH = 12; // text indent to leave room for the icon glyph

function classifyNoteIcon(line) {
  if (line.includes("Buy") && line.includes("weekly pass")) return "pass";
  if (line.startsWith("Claim") && line.includes("(Starlight)")) return "key";
  if (line.includes("Starlight")) return "starlight";
  if (line.includes("Recharge") || (line.includes("Buy") && line.includes("dias pack"))) return "wallet";
  if (line.startsWith("Claim") && line.includes("token")) return "scroll";
  if (line.startsWith("Claim")) return "key";
  if (line.includes("insufficient balance") || line.includes("No draw")) return "warning";
  if (line.includes("(CoA)") || line.includes("Final push (CoA)")) return "coaStar";
  if (line.includes("daily") || line.includes("10x") || line.includes("single") || line.includes("Final push")) return "gem";
  return null;
}

/**
 * Draws a small vector glyph anchored at (x, yBaseline), where yBaseline is the
 * text baseline of the note line it belongs to. Shapes are drawn centered a few
 * points above the baseline so they sit visually mid-height with the text.
 */
function drawNoteIcon(doc, type, x, yBaseline) {
  const cy = yBaseline - ICON_SIZE / 2.6; // vertical center, tuned to sit mid-text
  const r = ICON_SIZE / 2;

  switch (type) {
    case "gem": // blue diamond (rotated square)
      doc.setFillColor(...COLORS.gemBlue);
      doc.triangle(x, cy - r, x + r, cy, x, cy + r, "F");
      doc.triangle(x, cy - r, x - r, cy, x, cy + r, "F");
      break;
    case "coaStar": // gold 4-point star, stands in for coa-star.png
      drawStar(doc, x, cy, r, COLORS.gold);
      break;
    case "pass": // coral ticket (rounded rect with a notch)
      doc.setFillColor(...COLORS.coral);
      doc.roundedRect(x - r, cy - r * 0.65, r * 2, r * 1.3, 1, 1, "F");
      break;
    case "starlight": // purple 4-point sparkle
      drawStar(doc, x, cy, r, COLORS.purple);
      break;
    case "wallet": // green rounded rect
      doc.setFillColor(...COLORS.green);
      doc.roundedRect(x - r, cy - r * 0.75, r * 2, r * 1.5, 1, 1, "F");
      break;
    case "scroll": // gold rounded rect (simplified scroll)
      doc.setFillColor(...COLORS.gold);
      doc.roundedRect(x - r, cy - r * 0.6, r * 2, r * 1.2, 1.5, 1.5, "F");
      break;
    case "key": // gold key: small circle + short shaft
      doc.setFillColor(...COLORS.gold);
      doc.circle(x - r * 0.4, cy, r * 0.55, "F");
      doc.setLineWidth(0.8);
      doc.setDrawColor(...COLORS.gold);
      doc.line(x - r * 0.1, cy, x + r * 0.9, cy);
      doc.line(x + r * 0.6, cy, x + r * 0.6, cy + r * 0.4);
      break;
    case "warning": // coral triangle
      doc.setFillColor(...COLORS.coral);
      doc.triangle(x, cy - r, x + r, cy + r * 0.8, x - r, cy + r * 0.8, "F");
      break;
    default:
      break;
  }
}

function drawStar(doc, cx, cy, r, color) {
  doc.setFillColor(...color);
  // simple 4-point sparkle via two overlapping triangles (diamond-ish star)
  doc.triangle(cx, cy - r, cx + r * 0.35, cy, cx, cy + r, "F");
  doc.triangle(cx - r * 0.35, cy, cx, cy - r * 0.35, cx + r * 0.35, cy, "F");
  doc.triangle(cx - r * 0.35, cy, cx, cy + r * 0.35, cx + r * 0.35, cy, "F");
}

function summaryLine(doc, y, label, value, x = MARGIN, sublabel = null) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text(String(value), x, y + (sublabel ? 15 : 12), { maxWidth: 120 });
  if (sublabel) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(sublabel, x, y + 26, { maxWidth: 120 });
  }
}

// ---------------------------------------------------------------------------
// Collector / Themed Crest branch
// ---------------------------------------------------------------------------

function buildStandardPdf(doc, plan, event) {
  const isCollector = plan.eventType === "collector";
  const hasTarget = !!plan.target?.skin?.name;
  const hasOutfit1Header = hasTarget && plan.target.outfit1 && plan.target.skin.outfit1_variant;
  const targetLabel = hasTarget
    ? (hasOutfit1Header
        ? `Target: ${plan.target.skin.name} (${plan.target.skin.hero ?? ""}) + ${plan.target.skin.outfit1_variant.name}`
        : `Target: ${plan.target.skin.name} (${plan.target.skin.hero ?? ""})`)
    : `Plan: ${event.name} (bingo)`;
  let y = addHeader(doc, event, targetLabel);

  // Summary cards — 4-col wrap: collector gets a 5th card (CoA) wrapping to row 2
  const hasOutfit1 = hasTarget && plan.target.outfit1 && plan.target.skin.outfit1_variant;
  const cardList = [
    ["Total BDT", `${TK} ${(plan.recharge?.totalBdt ?? 0).toLocaleString()}`, null],
    [
      "Diamonds Needed",
      (isCollector ? (plan.daySchedule?.totals?.dia ?? 0) : (plan.totalDiamondsForPlan ?? 0)).toLocaleString(),
      null,
    ],
  ];
  if (isCollector) {
    cardList.push(["CoA Needed", (plan.daySchedule?.totals?.coa ?? 0).toLocaleString(), null]);
  }
  cardList.push(["Total Draws", plan.drawsNeeded.draws.toLocaleString(), null]);
  cardList.push([
    "Target Skin",
    hasOutfit1 ? `${plan.target.skin.name} + ${plan.target.skin.outfit1_variant.name}` : (plan.target?.skin?.name ?? "Bingo (any 1 skin)"),
    plan.target?.skin?.hero ?? "",
  ]);

  const cols = 4;
  const cardW = (doc.internal.pageSize.getWidth() - MARGIN * 2) / cols;
  const numRows = Math.ceil(cardList.length / cols);
  const ROW_TALL = 44;
  const ROW_COMPACT = 22;
  let rowY = y;
  for (let r = 0; r < numRows; r++) {
    const rowCards = cardList.slice(r * cols, (r + 1) * cols);
    const hasSublabel = rowCards.some(([, , s]) => s != null);
    const rowH = hasSublabel ? ROW_TALL : ROW_COMPACT;
    rowCards.forEach(([label, value, sublabel], c) => {
      if (label === "Target Skin" && hasOutfit1) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.muted);
        doc.text("Target Skin", MARGIN + c * cardW, rowY);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.text);
        doc.text(plan.target.skin.name, MARGIN + c * cardW, rowY + 15, { maxWidth: cardW });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...COLORS.muted);
        doc.text(`+ ${plan.target.skin.outfit1_variant.name}`, MARGIN + c * cardW, rowY + 26, { maxWidth: cardW });
        if (sublabel) {
          doc.setFontSize(8);
          doc.setTextColor(...COLORS.muted);
          doc.text(sublabel, MARGIN + c * cardW, rowY + 36, { maxWidth: cardW });
        }
      } else {
        summaryLine(doc, rowY, label, value, MARGIN + c * cardW, sublabel);
      }
    });
    rowY += rowH;
  }
  y = rowY;

  // Confidence strip
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Optimistic: ${plan.drawsNeededAll?.optimistic ?? "-"} draws   |   Realistic: ${plan.drawsNeededAll?.realistic ?? "-"} draws   |   Worst case: ${plan.drawsNeededAll?.worst ?? "-"} draws`,
    MARGIN,
    y
  );
  y += 20;

  // Warnings
  if (plan.warnings?.length > 0) {
    doc.setTextColor(...COLORS.coral);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    for (const w of plan.warnings) {
      doc.text(`[!] ${w.message}`, MARGIN, y, { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 });
      y += 16;
    }
    y += 6;
  }

  // Recharge pack table
  if (plan.recharge?.packsUsed?.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    doc.text("Recommended Recharge", MARGIN, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Pack", "Type", "Qty", "Diamonds", "BDT"]],
      body: plan.recharge.packsUsed.map((p) => [
        packDisplayName(p),
        p.type,
        `x${p.count}`,
        (p.count * p.dia).toLocaleString(),
        `${TK} ${(p.count * p.bdt).toLocaleString()}`,
      ]),
      foot: [["Total", "", "", plan.recharge.totalDia.toLocaleString(), `${TK} ${plan.recharge.totalBdt.toLocaleString()}`]],
      showFoot: "lastPage",
      headStyles: { fillColor: COLORS.goldLight, textColor: COLORS.text, fontStyle: "bold" },
      footStyles: { fillColor: COLORS.goldLight, textColor: COLORS.text, fontStyle: "bold" },
      styles: { fontSize: 8, textColor: COLORS.text, lineColor: COLORS.border },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  // Day-by-day schedule
  const rows = plan.daySchedule?.rows ?? [];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  if (y > doc.internal.pageSize.getHeight() - 100) {
    doc.addPage();
    y = 40;
  }
  doc.text("Day-by-Day Schedule", MARGIN, y);
  y += 14;

  // Icon legend — compact single line, drawn glyph + label pairs
  const legendItems = isCollector
    ? [["gem", "Draw (dia)"], ["coaStar", "Draw (CoA)"], ["pass", "Buy pass"], ["starlight", "Starlight"], ["key", "Claim keys"], ["warning", "Insufficient"]]
    : [["gem", "Draw (dia)"], ["pass", "Buy pass"], ["wallet", "Recharge"], ["scroll", "Claim tokens"], ["warning", "Insufficient"]];
  let legendX = MARGIN;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  for (const [iconType, label] of legendItems) {
    drawNoteIcon(doc, iconType, legendX + 3, y);
    doc.setTextColor(...COLORS.muted);
    doc.text(label, legendX + 10, y);
    legendX += 10 + doc.getTextWidth(label) + 14;
  }
  y += 14;

  const duration = event.duration_days;
  let cumulative = 0;
  const head = isCollector ? ["Day", "Action", "Draws", "Total", "Dia", "CoA"] : ["Day", "Action", "Draws", "Total", "Dia"];

  const body = rows.map((r) => {
    cumulative += r.draws;
    const sanitizedNotes = (r.notes ?? []).map(sanitizePdfText);
    const action = sanitizedNotes.join("\n");
    const base = [r.day, action, r.draws, cumulative, r.diaSpent > 0 ? r.diaSpent.toLocaleString() : DASH];
    if (isCollector) base.push(r.coaSpent > 0 ? r.coaSpent.toLocaleString() : DASH);
    return base;
  });
  const rowNotesLookup = rows.map((r) => (r.notes ?? []).map(sanitizePdfText));

  // Totals row — matches ScheduleTable.jsx's plan.daySchedule.totals footer exactly
  // (Draws / Dia / CoA summed across all rows; cumulative column shows the same
  // running total the last row already reached).
  const totals = plan.daySchedule?.totals ?? { draws: 0, dia: 0, coa: 0 };
  const footRow = isCollector
    ? ["Total", "", totals.draws, cumulative, totals.dia.toLocaleString(), totals.coa.toLocaleString()]
    : ["Total", "", totals.draws, cumulative, totals.dia.toLocaleString()];

  const pageContentWidth = doc.internal.pageSize.getWidth() - MARGIN * 2;
  const fixedCols = 26 + 34 + 34 + 44 + (isCollector ? 44 : 0);
  const actionColWidth = pageContentWidth - fixedCols;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [head],
    body,
    foot: [footRow],
    showFoot: "lastPage",
    headStyles: { fillColor: COLORS.goldLight, textColor: COLORS.text, fontStyle: "bold" },
    footStyles: { fillColor: COLORS.goldLight, textColor: COLORS.text, fontStyle: "bold", fontSize: 8 },
    styles: {
      fontSize: 7.5,
      textColor: COLORS.text,
      lineColor: COLORS.border,
      cellPadding: 4,
      overflow: "linebreak",
      valign: "top",
    },
    tableWidth: pageContentWidth,
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: actionColWidth, overflow: "linebreak" },
      2: { cellWidth: 34 },
      3: { cellWidth: 34 },
      4: { cellWidth: 44 },
      ...(isCollector ? { 5: { cellWidth: 44 } } : {}),
    },
    theme: "grid",
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = rows[data.row.index];
      const day = row?.day;
      const isFinal = day === duration;
      const notes = row?.notes ?? [];
      if (isFinal) data.cell.styles.fillColor = COLORS.finalTint;
      else if (notes.some((n) => n.includes("Starlight") || n.includes("spend") || n.includes("recharge") || n.includes("Buy"))) {
        data.cell.styles.fillColor = COLORS.supplyTint;
      } else if (notes.some((n) => n.includes("insufficient balance") || n.includes("No draw"))) {
        data.cell.styles.fillColor = COLORS.gapTint;
      }
      // Reserve left space in the Action column for the drawn icon glyph —
      // indent every wrapped line uniformly via extra left cell padding.
      if (data.column.index === 1) {
        data.cell.styles.cellPadding = { top: 4, right: 4, bottom: 4, left: 4 + ICON_RESERVED_WIDTH };
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const notes = rowNotesLookup[data.row.index] ?? [];
      const lineHeight = data.cell.styles.fontSize * 1.15 + 0.5; // approximate jsPDF-autotable line spacing
      const startX = data.cell.x + 4 + ICON_RESERVED_WIDTH / 2 - 2;
      const startY = data.cell.y + data.cell.styles.cellPadding.top + data.cell.styles.fontSize * 0.8;
      notes.forEach((line, i) => {
        const iconType = classifyNoteIcon(line);
        if (!iconType) return;
        drawNoteIcon(doc, iconType, startX, startY + i * lineHeight);
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Bingo branch
// ---------------------------------------------------------------------------

function buildBingoPdf(doc, plan, event) {
  let y = addHeader(doc, event, `Bingo ${DASH} first line completion (any 1 unowned skin)`);

  const wc = plan.winCondition;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.text);
  doc.text("Draws to complete 1 line", MARGIN, y);
  y += 20;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Scenario", "Draws", "Diamond Cost"]],
    body: [
      ["Lucky", `${wc.draws.lucky[0]}${DASH}${wc.draws.lucky[1]}`, `${wc.diamondCost.lucky[0].toLocaleString()}${DASH}${wc.diamondCost.lucky[1].toLocaleString()}`],
      ["Realistic", `${wc.draws.realistic}`, wc.diamondCost.realistic.toLocaleString()],
      ["Worst case", `${wc.draws.worst}`, wc.diamondCost.worst.toLocaleString()],
    ],
    headStyles: { fillColor: COLORS.goldLight, textColor: COLORS.text, fontStyle: "bold" },
    styles: { fontSize: 9, textColor: COLORS.text, lineColor: COLORS.border },
    theme: "grid",
  });
  y = doc.lastAutoTable.finalY + 24;

  if (wc.pity?.hasPity) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Guaranteed: ${wc.pity.pitySkinName} on first 10x draw if unowned.`, MARGIN, y);
    y += 20;
  }

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Daily discounted 1x draw applies every day of the event ${DASH} never skip it.`,
    MARGIN,
    y,
    { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 }
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generates and triggers a browser download of the plan PDF.
 * @param {object} plan - output of planOrchestrator.js's buildPlan()
 * @param {object} event - full event object from events.json
 */
export function exportPlanPdf(plan, event) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  if (plan.eventType === "bingo" && !plan.daySchedule) {
    buildBingoPdf(doc, plan, event);
  } else {
    buildStandardPdf(doc, plan, event);
  }

  addFooter(doc);

  const filename = `skinroute-${event.id}-plan.pdf`;
  doc.save(filename);
}