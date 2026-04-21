/**
 * Excel generation for Sylvia's House
 *
 * Generates 3 workbooks: APT, PRODUCCION, PATIO
 * Each workbook has 3 sheets: CONSOLIDADO + 2 detail sheets
 */

import ExcelJS from "exceljs";
import { WORKERS_WITH_AUTO_SODA } from "./soda-config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerOrder {
  workerId: string;
  workerName: string;
  docNumber: string;
  orderDate: string; // YYYY-MM-DD
  count: number;
}

export interface ManualProductEntry {
  productName: string;
  quantity: number;
  date: string; // YYYY-MM-DD
  unitPrice: number;
}

export interface SpecialOrderSummary {
  groupName: string; // e.g. "APT ALMUERZOS"
  label: string;     // e.g. "Almuerzo ejecutivo"
  price: number;     // unit price without IGV
  dailyQty: Record<string, number>; // date -> count
}

export interface GroupPriceEntry {
  concept: string;
  unitPrice: number;
}

export interface ExcelInput {
  month: number; // 1-12
  year: number;
  // Orders by group name
  orders: Record<string, WorkerOrder[]>;
  // Workers by group name
  workers: Record<string, { id: string; full_name: string; doc_number: string }[]>;
  // Adicionales by group name and date
  adicionales: Record<string, Record<string, number>>;
  // Manual products for each excel (APT / PRODUCCION / PATIO)
  manualProducts: ManualProductEntry[];
  // Special-price orders (from email, added manually)
  specialOrders: SpecialOrderSummary[];
  // Fixed values
  fixedCenas: number; // default 25 for PRODUCCION
  fixedCafe: number;  // default 2 for PRODUCCION
  // Prices by concept
  prices: Record<string, number>;
}

const MONTH_NAMES_ES = [
  "", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const DAY_NAMES = ["D", "L", "M", "M", "J", "V", "S"];

const IGV_RATE = 0.18;

// ─── Helper: get day of week label ───────────────────────────────────────────

function getDayLabel(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  return DAY_NAMES[d.getDay()];
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

function dateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = {
  headerBg: "FF8B4513",      // saddle brown
  headerFg: "FFFFFFFF",
  subHeaderBg: "FFD2691E",   // chocolate
  subHeaderFg: "FFFFFFFF",
  weekendBg: "FFFFF8DC",     // cornsilk
  totalRowBg: "FFFFF0E0",    // light orange
  summaryHeaderBg: "FF8B4513",
  summaryHeaderFg: "FFFFFFFF",
  totalBg: "FFFFD700",       // gold
  borderColor: "FFC4A265",
};

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.borderColor } },
    left: { style: "thin", color: { argb: COLORS.borderColor } },
    bottom: { style: "thin", color: { argb: COLORS.borderColor } },
    right: { style: "thin", color: { argb: COLORS.borderColor } },
  };
}

function headerStyle(cell: ExcelJS.Cell, bg = COLORS.headerBg, fg = COLORS.headerFg) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.font = { bold: true, color: { argb: fg }, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  applyBorder(cell);
}

function numberStyle(cell: ExcelJS.Cell, bold = false) {
  cell.font = { size: 9, bold };
  cell.alignment = { horizontal: "center" };
  applyBorder(cell);
}

function currencyStyle(cell: ExcelJS.Cell) {
  cell.numFmt = '"S/."#,##0.00';
  cell.font = { size: 9 };
  applyBorder(cell);
}

// ─── Build daily totals from orders ──────────────────────────────────────────

function buildDailyTotals(
  orders: WorkerOrder[],
  year: number,
  month: number
): Record<string, number> {
  const totals: Record<string, number> = {};
  const days = getDaysInMonth(year, month);
  for (let d = 1; d <= days; d++) {
    totals[dateStr(year, month, d)] = 0;
  }
  for (const o of orders) {
    if (totals[o.orderDate] !== undefined) {
      totals[o.orderDate] += o.count;
    }
  }
  return totals;
}

// Build a map: workerId -> { date -> count }
function buildWorkerDailyMap(
  orders: WorkerOrder[]
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  for (const o of orders) {
    if (!map[o.workerId]) map[o.workerId] = {};
    map[o.workerId][o.orderDate] = (map[o.workerId][o.orderDate] || 0) + o.count;
  }
  return map;
}

// ─── Auto-soda calculation for PRODUCCION ────────────────────────────────────

function calcSoda500ml(
  year: number,
  month: number,
  produccionOrders: WorkerOrder[],
  produccionWorkers: { id: string; full_name: string }[],
  cenasDailyQty: Record<string, number>,
  adicionalesProduccion: Record<string, number>
): Record<string, number> {
  const days = getDaysInMonth(year, month);
  const result: Record<string, number> = {};

  // Find soda workers
  const sodaWorkerIds = new Set<string>();
  for (const w of produccionWorkers) {
    const nameLower = w.full_name.toUpperCase();
    if (WORKERS_WITH_AUTO_SODA.workerNames.some((n) => nameLower.includes(n))) {
      sodaWorkerIds.add(w.id);
    }
  }

  const workerDayMap = buildWorkerDailyMap(produccionOrders);
  const dailyTotals = buildDailyTotals(produccionOrders, year, month);

  for (let d = 1; d <= days; d++) {
    const ds = dateStr(year, month, d);
    const date = new Date(year, month - 1, d);
    const dow = date.getDay(); // 0=Sun, 6=Sat

    if (dow === 6) {
      // Saturday: use actual manual cenas count for that day
      result[ds] = cenasDailyQty[ds] || 0;
    } else if (dow === 0) {
      // Sunday: use almuerzos count
      result[ds] = dailyTotals[ds] || 0;
    } else {
      // Mon–Fri: count soda workers who ordered
      let count = 0;
      for (const wId of sodaWorkerIds) {
        if (workerDayMap[wId]?.[ds]) count++;
      }
      result[ds] = count;
    }
  }
  return result;
}

// ─── Detail sheet (workers × days) ───────────────────────────────────────────

function buildDetailSheet(
  ws: ExcelJS.Worksheet,
  title: string,
  year: number,
  month: number,
  workers: { id: string; full_name: string; doc_number: string }[],
  orders: WorkerOrder[],
  adicionales: Record<string, number>,
  showNN: boolean
) {
  const days = getDaysInMonth(year, month);
  const monthName = MONTH_NAMES_ES[month];

  // Row 1: blank
  ws.addRow([]);

  // Row 2: title
  const titleRow = ws.addRow([null, `RACIONES ${monthName} ${year}`]);
  ws.mergeCells(2, 2, 2, 3 + days + 1);
  const titleCell = ws.getCell(2, 2);
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { horizontal: "center" };

  // Row 3: day labels (D, L, M, M, J, V, S)
  const dayLabelData: (string | number | null)[] = [null, null, null];
  for (let d = 1; d <= days; d++) {
    dayLabelData.push(getDayLabel(year, month, d));
  }
  dayLabelData.push(null);
  const dayLabelRow = ws.addRow(dayLabelData);
  dayLabelRow.eachCell((cell, colIdx) => {
    if (colIdx >= 4 && colIdx <= 3 + days) {
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: "center" };
      if (isWeekend(year, month, colIdx - 3)) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.weekendBg } };
      }
    }
  });

  // Row 4: headers
  const headerData: (string | number | null)[] = [null, "DNI", "NOMBRES"];
  for (let d = 1; d <= days; d++) headerData.push(d);
  headerData.push("SUBTOTAL");
  const headerRow = ws.addRow(headerData);
  headerRow.eachCell((cell, colIdx) => {
    if (colIdx >= 2) headerStyle(cell);
    if (colIdx >= 4 && colIdx <= 3 + days && isWeekend(year, month, colIdx - 3)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.weekendBg } };
      cell.font = { bold: true, size: 9 };
    }
  });

  // Set column widths
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 11; // DNI
  ws.getColumn(3).width = 28; // NOMBRES
  for (let d = 1; d <= days; d++) {
    ws.getColumn(3 + d).width = 5;
  }
  ws.getColumn(4 + days).width = 9; // SUBTOTAL

  // Worker rows — only workers with at least 1 order this month
  const workerDayMap = buildWorkerDailyMap(orders);
  const activeWorkers = workers.filter((w) => !!workerDayMap[w.id]);
  const dayTotals: number[] = new Array(days).fill(0);

  for (const worker of activeWorkers) {
    const rowData: (string | number | null)[] = [null, worker.doc_number, worker.full_name];
    let subtotal = 0;
    for (let d = 1; d <= days; d++) {
      const ds = dateStr(year, month, d);
      const val = workerDayMap[worker.id]?.[ds] || 0;
      rowData.push(val > 0 ? val : null);
      subtotal += val;
      dayTotals[d - 1] += val;
    }
    rowData.push(subtotal || null);
    const row = ws.addRow(rowData);
    row.eachCell((cell, colIdx) => {
      if (colIdx >= 2) applyBorder(cell);
      if (colIdx === 2) { cell.font = { size: 9 }; cell.alignment = { horizontal: "center" }; }
      if (colIdx === 3) { cell.font = { size: 9 }; }
      if (colIdx >= 4 && colIdx <= 3 + days) {
        cell.font = { size: 9 };
        cell.alignment = { horizontal: "center" };
        if (isWeekend(year, month, colIdx - 3)) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.weekendBg } };
        }
      }
      if (colIdx === 4 + days) { numberStyle(cell, true); }
    });
  }

  // NN row (only for APT/PRODUCCION)
  if (showNN) {
    const nnRow: (string | number | null)[] = [null, null, "NN"];
    for (let d = 1; d <= days; d++) nnRow.push(null);
    nnRow.push(null);
    const row = ws.addRow(nnRow);
    row.eachCell((cell, colIdx) => {
      if (colIdx >= 2) applyBorder(cell);
    });
  }

  // ADICIONALES row
  const adicRow: (string | number | null)[] = [null, null, "ADICIONALES"];
  let adicTotal = 0;
  for (let d = 1; d <= days; d++) {
    const ds = dateStr(year, month, d);
    const val = adicionales[ds] || 0;
    adicRow.push(val > 0 ? val : null);
    adicTotal += val;
    dayTotals[d - 1] += val;
  }
  adicRow.push(adicTotal || null);
  const adicRowEl = ws.addRow(adicRow);
  adicRowEl.eachCell((cell, colIdx) => {
    if (colIdx >= 2) {
      applyBorder(cell);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalRowBg } };
      cell.font = { size: 9, bold: true };
    }
    if (colIdx >= 4) cell.alignment = { horizontal: "center" };
  });

  // TOTAL row
  const totalRow: (string | number | null)[] = [null, null, title.toUpperCase()];
  let grandTotal = 0;
  for (let d = 0; d < days; d++) {
    totalRow.push(dayTotals[d] || null);
    grandTotal += dayTotals[d];
  }
  totalRow.push(grandTotal || null);
  const totalRowEl = ws.addRow(totalRow);
  totalRowEl.eachCell((cell, colIdx) => {
    if (colIdx >= 2) {
      applyBorder(cell);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
      cell.font = { size: 9, bold: true };
      cell.alignment = { horizontal: colIdx >= 4 ? "center" : "left" };
    }
  });
}

// ─── Summary block for CONSOLIDADO ───────────────────────────────────────────

interface ConsolidadoRow {
  concept: string;
  dailyQty: Record<string, number>; // date -> qty
  unitPrice: number;
}

function buildConsolidadoSheet(
  ws: ExcelJS.Worksheet,
  title: string,
  year: number,
  month: number,
  rows: ConsolidadoRow[]
) {
  const days = getDaysInMonth(year, month);
  const monthName = MONTH_NAMES_ES[month];

  // Row 1: blank
  ws.addRow([]);

  // Row 2: title
  ws.addRow([null, `${title} - RESUMEN RACIONES ${monthName} ${year}`]);
  ws.mergeCells(2, 2, 2, 3 + days + 2);
  const titleCell = ws.getCell(2, 2);
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: "center" };

  // Row 3: day labels
  const dayLabelData: (string | null)[] = [null, null];
  for (let d = 1; d <= days; d++) dayLabelData.push(getDayLabel(year, month, d));
  dayLabelData.push("TOTAL", null);
  const dayLabelRow = ws.addRow(dayLabelData);
  dayLabelRow.eachCell((cell, colIdx) => {
    if (colIdx >= 3 && colIdx <= 2 + days) {
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: "center" };
      if (isWeekend(year, month, colIdx - 2)) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.weekendBg } };
      }
    }
    if (colIdx === 3 + days) {
      headerStyle(cell);
    }
  });

  // Row 4: headers
  const headerData: (string | number | null)[] = [null, "CONCEPTO"];
  for (let d = 1; d <= days; d++) headerData.push(d);
  headerData.push("TOTAL", null);
  const headerRow = ws.addRow(headerData);
  headerRow.eachCell((cell, colIdx) => {
    if (colIdx >= 2) headerStyle(cell);
    if (colIdx >= 3 && colIdx <= 2 + days && isWeekend(year, month, colIdx - 2)) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.weekendBg } };
      cell.font = { bold: true, size: 9, color: { argb: COLORS.headerFg } };
    }
  });

  // Set col widths
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 28;
  for (let d = 1; d <= days; d++) ws.getColumn(2 + d).width = 5;
  ws.getColumn(3 + days).width = 8; // TOTAL
  ws.getColumn(4 + days).width = 4; // gap

  // Data rows
  const summaryData: { concept: string; total: number; unitPrice: number }[] = [];

  for (const row of rows) {
    const rowData: (string | number | null)[] = [null, row.concept];
    let total = 0;
    for (let d = 1; d <= days; d++) {
      const ds = dateStr(year, month, d);
      const val = row.dailyQty[ds] || 0;
      rowData.push(val > 0 ? val : null);
      total += val;
    }
    rowData.push(total || null, null);
    const addedRow = ws.addRow(rowData);
    addedRow.eachCell((cell, colIdx) => {
      if (colIdx === 2) {
        applyBorder(cell);
        cell.font = { size: 9, bold: true };
      }
      if (colIdx >= 3 && colIdx <= 2 + days) {
        numberStyle(cell);
        if (isWeekend(year, month, colIdx - 2)) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.weekendBg } };
        }
      }
      if (colIdx === 3 + days) numberStyle(cell, true);
    });
    if (row.unitPrice > 0) {
      summaryData.push({ concept: row.concept, total, unitPrice: row.unitPrice });
    }
  }

  // ─── RESUMEN block (to the right) ─────────────────────────────────────────
  // Placed starting at row 4, column days+5

  const summaryStartCol = 5 + days;
  const summaryStartRow = 4;

  // Header
  const sh = ws.getCell(summaryStartRow, summaryStartCol);
  sh.value = "CONCEPTO";
  headerStyle(sh);
  ws.getColumn(summaryStartCol).width = 26;

  const sc = ws.getCell(summaryStartRow, summaryStartCol + 1);
  sc.value = "CANTIDAD";
  headerStyle(sc);
  ws.getColumn(summaryStartCol + 1).width = 10;

  const sp = ws.getCell(summaryStartRow, summaryStartCol + 2);
  sp.value = "COSTO UNIT.";
  headerStyle(sp);
  ws.getColumn(summaryStartCol + 2).width = 12;

  const ss = ws.getCell(summaryStartRow, summaryStartCol + 3);
  ss.value = "SUBTOTAL";
  headerStyle(ss);
  ws.getColumn(summaryStartCol + 3).width = 12;

  let subtotalSum = 0;
  for (let i = 0; i < summaryData.length; i++) {
    const r = summaryStartRow + 1 + i;
    const item = summaryData[i];
    const subtotal = item.total * item.unitPrice;
    subtotalSum += subtotal;

    const c1 = ws.getCell(r, summaryStartCol);
    c1.value = item.concept;
    c1.font = { size: 9 };
    applyBorder(c1);

    const c2 = ws.getCell(r, summaryStartCol + 1);
    c2.value = item.total;
    numberStyle(c2);

    const c3 = ws.getCell(r, summaryStartCol + 2);
    c3.value = item.unitPrice;
    currencyStyle(c3);

    const c4 = ws.getCell(r, summaryStartCol + 3);
    c4.value = subtotal;
    currencyStyle(c4);
  }

  const igv = subtotalSum * IGV_RATE;
  const total = subtotalSum + igv;
  const afterRows = summaryStartRow + 1 + summaryData.length;

  const lblSubtotal = ws.getCell(afterRows, summaryStartCol + 2);
  lblSubtotal.value = "SUBTOTAL";
  lblSubtotal.font = { bold: true, size: 9 };
  applyBorder(lblSubtotal);
  const valSubtotal = ws.getCell(afterRows, summaryStartCol + 3);
  valSubtotal.value = subtotalSum;
  currencyStyle(valSubtotal);
  valSubtotal.font = { bold: true, size: 9 };

  const lblIgv = ws.getCell(afterRows + 1, summaryStartCol + 2);
  lblIgv.value = "I.G.V. (18%)";
  lblIgv.font = { bold: true, size: 9 };
  applyBorder(lblIgv);
  const valIgv = ws.getCell(afterRows + 1, summaryStartCol + 3);
  valIgv.value = igv;
  currencyStyle(valIgv);

  const lblTotal = ws.getCell(afterRows + 2, summaryStartCol + 2);
  lblTotal.value = "TOTAL";
  lblTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  lblTotal.font = { bold: true, size: 10 };
  applyBorder(lblTotal);
  const valTotal = ws.getCell(afterRows + 2, summaryStartCol + 3);
  valTotal.value = total;
  valTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  valTotal.numFmt = '"S/."#,##0.00';
  valTotal.font = { bold: true, size: 10 };
  applyBorder(valTotal);
}

// ─── Build manual product daily quantities ────────────────────────────────────

function buildManualProductDailyQty(
  products: ManualProductEntry[],
  productName: string,
  year: number,
  month: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const p of products) {
    if (p.productName === productName) {
      result[p.date] = (result[p.date] || 0) + p.quantity;
    }
  }
  return result;
}

// ─── APT WORKBOOK ─────────────────────────────────────────────────────────────

export async function generateExcelAPT(input: ExcelInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sylvia's House";
  wb.created = new Date();

  const { month, year, orders, workers, adicionales, manualProducts, specialOrders, prices } = input;
  const days = getDaysInMonth(year, month);

  const aptAlmuerzosOrders = orders["APT ALMUERZOS"] || [];
  const aptCenasOrders = orders["APT CENAS"] || [];
  const aptAlmuerzosWorkers = workers["APT ALMUERZOS"] || [];
  const aptCenasWorkers = workers["APT CENAS"] || [];
  const adicAlmuerzos = adicionales["APT ALMUERZOS"] || {};
  const adicCenas = adicionales["APT CENAS"] || {};

  const almuerzoDailyTotals = buildDailyTotals(aptAlmuerzosOrders, year, month);
  const cenaDailyTotals = buildDailyTotals(aptCenasOrders, year, month);

  // Add adicionales to totals
  for (let d = 1; d <= days; d++) {
    const ds = dateStr(year, month, d);
    almuerzoDailyTotals[ds] = (almuerzoDailyTotals[ds] || 0) + (adicAlmuerzos[ds] || 0);
    cenaDailyTotals[ds] = (cenaDailyTotals[ds] || 0) + (adicCenas[ds] || 0);
  }

  const aptSpecialRows: ConsolidadoRow[] = specialOrders
    .filter((s) => s.groupName === "APT ALMUERZOS" || s.groupName === "APT CENAS")
    .map((s) => ({ concept: s.label.toUpperCase(), dailyQty: s.dailyQty, unitPrice: s.price }));

  const consolidadoRows: ConsolidadoRow[] = [
    { concept: "ALMUERZOS", dailyQty: almuerzoDailyTotals, unitPrice: prices["ALMUERZO"] || 0 },
    { concept: "CENAS", dailyQty: cenaDailyTotals, unitPrice: prices["CENA"] || 0 },
    ...aptSpecialRows,
    { concept: "CAFÉ", dailyQty: buildManualProductDailyQty(manualProducts, "CAFÉ", year, month), unitPrice: prices["CAFÉ"] || 30 },
    { concept: "TORTA GRANDE", dailyQty: buildManualProductDailyQty(manualProducts, "TORTA GRANDE", year, month), unitPrice: prices["TORTA GRANDE"] || 125 },
    { concept: "TORTA MEDIANA", dailyQty: buildManualProductDailyQty(manualProducts, "TORTA MEDIANA", year, month), unitPrice: prices["TORTA MEDIANA"] || 100 },
    { concept: "BOCADITOS", dailyQty: buildManualProductDailyQty(manualProducts, "BOCADITOS", year, month), unitPrice: prices["BOCADITOS"] || 2 },
    { concept: "GASEOSA 3L", dailyQty: buildManualProductDailyQty(manualProducts, "GASEOSA 3L", year, month), unitPrice: prices["GASEOSA 3L"] || 15 },
    { concept: "GASEOSA 600 ml", dailyQty: buildManualProductDailyQty(manualProducts, "GASEOSA 600 ml", year, month), unitPrice: prices["GASEOSA 600 ml"] || 3.5 },
  ];

  // Sheet 1: CONSOLIDADO APT
  const wsConsolidado = wb.addWorksheet("CONSOLIDADO APT");
  buildConsolidadoSheet(wsConsolidado, "APT", year, month, consolidadoRows);

  // Sheet 2: ALMUERZOS APT
  const wsAlmuerzos = wb.addWorksheet("ALMUERZOS APT");
  buildDetailSheet(wsAlmuerzos, "ALMUERZOS", year, month, aptAlmuerzosWorkers, aptAlmuerzosOrders, adicAlmuerzos, true);

  // Sheet 3: CENAS APT
  const wsCenas = wb.addWorksheet("CENAS APT");
  buildDetailSheet(wsCenas, "CENAS", year, month, aptCenasWorkers, aptCenasOrders, adicCenas, true);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── PRODUCCION WORKBOOK ──────────────────────────────────────────────────────

export async function generateExcelProduccion(input: ExcelInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sylvia's House";
  wb.created = new Date();

  const { month, year, orders, workers, adicionales, manualProducts, specialOrders, prices, fixedCafe } = input;
  const days = getDaysInMonth(year, month);

  const prodOrders = orders["PRODUCCION"] || [];
  const staffOrders = orders["STAFF"] || [];
  const prodWorkers = workers["PRODUCCION"] || [];
  const staffWorkers = workers["STAFF"] || [];
  const adicProd = adicionales["PRODUCCION"] || {};
  const adicStaff = adicionales["STAFF"] || {};

  const prodDailyTotals = buildDailyTotals(prodOrders, year, month);
  const staffDailyTotals = buildDailyTotals(staffOrders, year, month);

  // Add adicionales to totals
  for (let d = 1; d <= days; d++) {
    const ds = dateStr(year, month, d);
    prodDailyTotals[ds] = (prodDailyTotals[ds] || 0) + (adicProd[ds] || 0);
    staffDailyTotals[ds] = (staffDailyTotals[ds] || 0) + (adicStaff[ds] || 0);
  }

  // Cenas from manual products (entered day-by-day via /products)
  const cenasDailyQty = buildManualProductDailyQty(manualProducts, "CENAS PRODUCCIÓN", year, month);

  // Fixed cafe (2 per day by default)
  const cafeDailyQty: Record<string, number> = {};
  for (let d = 1; d <= days; d++) {
    cafeDailyQty[dateStr(year, month, d)] = fixedCafe;
  }

  // Auto soda 500ml (Saturdays use actual cenas count)
  const soda500mlQty = calcSoda500ml(year, month, prodOrders, prodWorkers, cenasDailyQty, adicProd);

  // Combined almuerzos: PRODUCCION + STAFF summed per day (consolidado only)
  const combinedAlmuerzosDailyQty: Record<string, number> = {};
  for (let d = 1; d <= days; d++) {
    const ds = dateStr(year, month, d);
    combinedAlmuerzosDailyQty[ds] = (prodDailyTotals[ds] || 0) + (staffDailyTotals[ds] || 0);
  }

  const prodSpecialRows: ConsolidadoRow[] = specialOrders
    .filter((s) => s.groupName === "PRODUCCION" || s.groupName === "STAFF")
    .map((s) => ({ concept: s.label.toUpperCase(), dailyQty: s.dailyQty, unitPrice: s.price }));

  const consolidadoRows: ConsolidadoRow[] = [
    { concept: "ALMUERZOS PRODUCCIÓN", dailyQty: combinedAlmuerzosDailyQty, unitPrice: prices["ALMUERZO"] || 0 },
    { concept: "CENAS PRODUCCIÓN", dailyQty: cenasDailyQty, unitPrice: prices["CENA"] || 0 },
    ...prodSpecialRows,
    { concept: "CAFÉ", dailyQty: cafeDailyQty, unitPrice: prices["CAFÉ"] || 30 },
    { concept: "GASEOSAS 500ml", dailyQty: soda500mlQty, unitPrice: prices["GASEOSAS 500ml"] || 3.5 },
    { concept: "GASEOSA 3L", dailyQty: buildManualProductDailyQty(manualProducts, "GASEOSA 3L", year, month), unitPrice: prices["GASEOSA 3L"] || 15 },
    { concept: "BOCADITOS", dailyQty: buildManualProductDailyQty(manualProducts, "BOCADITOS", year, month), unitPrice: prices["BOCADITOS"] || 2 },
    { concept: "TORTA GRANDE", dailyQty: buildManualProductDailyQty(manualProducts, "TORTA GRANDE", year, month), unitPrice: prices["TORTA GRANDE"] || 125 },
    { concept: "TORTA MEDIANA", dailyQty: buildManualProductDailyQty(manualProducts, "TORTA MEDIANA", year, month), unitPrice: prices["TORTA MEDIANA"] || 100 },
    { concept: "REPOSICIÓN THERMO", dailyQty: buildManualProductDailyQty(manualProducts, "REPOSICIÓN THERMO", year, month), unitPrice: prices["REPOSICIÓN THERMO"] || 100 },
  ];

  // Sheet 1: CONSOLIDADO PRODUCCION
  const wsConsolidado = wb.addWorksheet("CONSOLIDADO PRODUCCION");
  buildConsolidadoSheet(wsConsolidado, "PRODUCCIÓN", year, month, consolidadoRows);

  // Sheet 2: PRODUCCION detail
  const wsProduccion = wb.addWorksheet("PRODUCCION");
  buildDetailSheet(wsProduccion, "ALMUERZOS", year, month, prodWorkers, prodOrders, adicProd, true);

  // Sheet 3: STAFF detail
  const wsStaff = wb.addWorksheet("STAFF");
  buildDetailSheet(wsStaff, "ALMUERZOS", year, month, staffWorkers, staffOrders, adicStaff, false);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── PATIO WORKBOOK ───────────────────────────────────────────────────────────

export async function generateExcelPatio(input: ExcelInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sylvia's House";
  wb.created = new Date();

  const { month, year, orders, workers, adicionales, specialOrders, prices } = input;
  const days = getDaysInMonth(year, month);

  const patioAlmuerzosOrders = orders["PATIO ALMUERZOS"] || [];
  const patioCenasOrders = orders["PATIO CENAS"] || [];
  const patioAlmuerzosWorkers = workers["PATIO ALMUERZOS"] || [];
  const patioCenasWorkers = workers["PATIO CENAS"] || [];
  const adicAlmuerzos = adicionales["PATIO ALMUERZOS"] || {};
  const adicCenas = adicionales["PATIO CENAS"] || {};

  const almuerzoDailyTotals = buildDailyTotals(patioAlmuerzosOrders, year, month);
  const cenaDailyTotals = buildDailyTotals(patioCenasOrders, year, month);

  for (let d = 1; d <= days; d++) {
    const ds = dateStr(year, month, d);
    almuerzoDailyTotals[ds] = (almuerzoDailyTotals[ds] || 0) + (adicAlmuerzos[ds] || 0);
    cenaDailyTotals[ds] = (cenaDailyTotals[ds] || 0) + (adicCenas[ds] || 0);
  }

  const patioSpecialRows: ConsolidadoRow[] = specialOrders
    .filter((s) => s.groupName === "PATIO ALMUERZOS" || s.groupName === "PATIO CENAS")
    .map((s) => ({ concept: s.label.toUpperCase(), dailyQty: s.dailyQty, unitPrice: s.price }));

  const consolidadoRows: ConsolidadoRow[] = [
    { concept: "ALMUERZOS PATIO", dailyQty: almuerzoDailyTotals, unitPrice: prices["ALMUERZO"] || 0 },
    { concept: "CENAS PATIO", dailyQty: cenaDailyTotals, unitPrice: prices["CENA"] || 0 },
    ...patioSpecialRows,
  ];

  // Sheet 1: CONSOLIDADO PATIO
  const wsConsolidado = wb.addWorksheet("CONSOLIDADO PATIO");
  buildConsolidadoSheet(wsConsolidado, "PATIO", year, month, consolidadoRows);

  // Sheet 2: ALMUERZOS PATIO
  const wsAlmuerzos = wb.addWorksheet("ALMUERZOS PATIO");
  buildDetailSheet(wsAlmuerzos, "ALMUERZOS", year, month, patioAlmuerzosWorkers, patioAlmuerzosOrders, adicAlmuerzos, false);

  // Sheet 3: CENAS PATIO
  const wsCenas = wb.addWorksheet("CENAS PATIO");
  buildDetailSheet(wsCenas, "CENAS", year, month, patioCenasWorkers, patioCenasOrders, adicCenas, false);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
