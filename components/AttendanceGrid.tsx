"use client";

import React, { useState, useMemo } from "react";
import { MonthSelector } from "./MonthSelector";
import type { Worker, Order, Group } from "@/lib/types";

export interface ManualProductRow {
  productName: string;
  dailyEntries: Record<string, Array<{ qty: number; notes: string | null }>>; // day -> list of records
}

interface AttendanceGridProps {
  group: Group;
  workers: Worker[];
  orders: Order[];
  adicionales: Record<string, number>;
  manualProducts?: ManualProductRow[];
  month: string; // "YYYY-MM"
  onMonthChange: (month: string) => void;
  extraHeaderActions?: React.ReactNode;
  noOrderDays?: Set<number>;       // day numbers (1-31) marked as no-order
  canMarkNoOrder?: boolean;        // show toggle buttons (admin only)
  onToggleNoOrderDay?: (day: number) => void;
}

const DAY_NAMES_SHORT = ["D", "L", "M", "Mi", "J", "V", "S"];

// ─── Cell tooltip ────────────────────────────────────────────────────────────

function buildTooltipText(cellOrders: Order[]): string {
  const waCount = cellOrders.filter((o) => o.source === "whatsapp").length;
  const manualNormal = cellOrders.filter((o) => o.source === "manual" && o.special_price == null);
  const manualSpecial = cellOrders.filter((o) => o.source === "manual" && o.special_price != null);
  const lines: string[] = [
    `${cellOrders.length} pedido${cellOrders.length !== 1 ? "s" : ""}`,
  ];
  if (waCount > 0) lines.push(`- WhatsApp: ${waCount}`);
  if (manualNormal.length > 0) {
    const notes = manualNormal.flatMap((o) => (o.notes ? [o.notes] : []));
    lines.push(notes.length > 0
      ? `- Manual: ${manualNormal.length} — ${notes.join("; ")}`
      : `- Manual: ${manualNormal.length}`
    );
  }
  for (const o of manualSpecial) {
    const label = o.special_label ?? "Pedido especial";
    const price = `S/${o.special_price!.toFixed(2)}`;
    const note = o.notes ? ` — ${o.notes}` : "";
    lines.push(`- Especial: ${label} ${price}${note}`);
  }
  return lines.join("\n");
}

function CellTooltip({
  content,
  children,
}: {
  content: string;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <span
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ top: r.top, left: r.left + r.width / 2 });
      }}
      onMouseLeave={() => setPos(null)}
      className="cursor-default"
    >
      {children}
      {pos && (
        <div
          style={{
            position: "fixed",
            top: pos.top - 8,
            left: pos.left,
            transform: "translateX(-50%) translateY(-100%)",
          }}
          className="z-50 rounded-md bg-gray-900 text-white px-2.5 py-1.5 text-xs shadow-lg pointer-events-none whitespace-pre-line max-w-[240px] leading-relaxed"
        >
          {content}
        </div>
      )}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function AttendanceGrid({
  group,
  workers,
  orders,
  adicionales,
  manualProducts = [],
  month,
  onMonthChange,
  extraHeaderActions,
  noOrderDays,
  canMarkNoOrder = false,
  onToggleNoOrderDay,
}: AttendanceGridProps) {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Only show workers with at least 1 order this month
  const activeWorkers = useMemo(
    () => workers.filter((w) => orders.some((o) => o.worker_id === w.id && !o.is_additional)),
    [workers, orders]
  );

  // Build lookup: workerId -> { dateKey -> Order[] }
  // Orders with is_additional=true (or null worker_id) are excluded — they go into adicPerDay.
  const orderMap = useMemo(() => {
    const map = new Map<string, Map<string, Order[]>>();
    for (const order of orders) {
      if (order.is_additional || !order.worker_id) continue;
      if (!map.has(order.worker_id)) {
        map.set(order.worker_id, new Map());
      }
      const dayMap = map.get(order.worker_id)!;
      const day = parseInt(order.order_date.split("-")[2], 10);
      const dateKey = String(day);
      const existing = dayMap.get(dateKey) ?? [];
      existing.push(order);
      dayMap.set(dateKey, existing);
    }
    return map;
  }, [orders]);

  // Day-of-week for each day
  const dayOfWeek = useMemo(
    () =>
      days.map((d) => {
        const date = new Date(year, monthNum - 1, d);
        return date.getDay(); // 0=Sun, 6=Sat
      }),
    [days, year, monthNum]
  );

  // Total per day (column totals)
  const dayTotals = useMemo(() => {
    const totals: number[] = new Array(daysInMonth).fill(0);
    for (const [, dayMap] of orderMap) {
      for (const [dayStr, dayOrders] of dayMap) {
        const idx = parseInt(dayStr, 10) - 1;
        if (idx >= 0 && idx < daysInMonth) {
          totals[idx] += dayOrders.length;
        }
      }
    }
    return totals;
  }, [orderMap, daysInMonth]);

  // Adicionales per day: WhatsApp-parsed counts + manual is_additional orders
  const { adicPerDay, adicWaPerDay, adicManualByDay } = useMemo(() => {
    const totals: number[] = new Array(daysInMonth).fill(0);
    const waTotals: number[] = new Array(daysInMonth).fill(0);
    const manualByDay: Map<number, Order[]> = new Map();

    for (const [dateStr, count] of Object.entries(adicionales)) {
      const parts = dateStr.split("-");
      if (parseInt(parts[0], 10) === year && parseInt(parts[1], 10) === monthNum) {
        const day = parseInt(parts[2], 10);
        if (day >= 1 && day <= daysInMonth) {
          totals[day - 1] += count;
          waTotals[day - 1] += count;
        }
      }
    }
    for (const order of orders) {
      if (!order.is_additional) continue;
      const parts = order.order_date.split("-");
      if (parseInt(parts[0], 10) === year && parseInt(parts[1], 10) === monthNum) {
        const day = parseInt(parts[2], 10);
        if (day >= 1 && day <= daysInMonth) {
          totals[day - 1] += 1;
          const existing = manualByDay.get(day) ?? [];
          existing.push(order);
          manualByDay.set(day, existing);
        }
      }
    }
    return { adicPerDay: totals, adicWaPerDay: waTotals, adicManualByDay: manualByDay };
  }, [adicionales, orders, year, monthNum, daysInMonth]);

  const showNNRow =
    group.name.includes("APT") ||
    group.name.includes("PRODUCCION") ||
    group.name.includes("PRODUCCIÓN");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{group.excel_tab}</h3>
          <p className="text-sm text-muted-foreground">{group.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelector value={month} onChange={onMonthChange} />
          {extraHeaderActions}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead>
            {/* Day numbers row */}
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 bg-muted px-2 py-1 text-left min-w-[60px]">
                DNI
              </th>
              <th className="sticky left-[60px] z-10 bg-muted px-2 py-1 text-left min-w-[160px]">
                NOMBRES
              </th>
              {days.map((d, i) => {
                const isWeekend = dayOfWeek[i] === 0 || dayOfWeek[i] === 6;
                const dayTotal = dayTotals[i] + (adicPerDay[i] || 0);
                const isMarked = noOrderDays?.has(d) ?? false;
                const showToggle = canMarkNoOrder && dayTotal === 0;
                return (
                  <th
                    key={d}
                    className={`px-1 py-1 text-center min-w-[32px] ${
                      isWeekend ? "bg-amber-50" : ""
                    } ${isMarked ? "bg-gray-50" : ""}`}
                  >
                    <div className="text-xs text-muted-foreground">
                      {DAY_NAMES_SHORT[dayOfWeek[i]]}
                    </div>
                    <div>{d}</div>
                    {showToggle && (
                      <button
                        onClick={() => onToggleNoOrderDay?.(d)}
                        title={isMarked ? "Quitar marca 'sin pedidos'" : "Marcar como sin pedidos"}
                        className={`text-[10px] leading-none mt-0.5 block mx-auto w-full ${
                          isMarked
                            ? "text-gray-400 cursor-pointer"
                            : "text-gray-200 hover:text-gray-400 cursor-pointer"
                        }`}
                      >
                        Ø
                      </button>
                    )}
                  </th>
                );
              })}
              <th className="px-2 py-1 text-center bg-muted font-bold min-w-[40px]">
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Worker rows */}
            {activeWorkers.map((worker) => {
              const dayMap = orderMap.get(worker.id);
              const rowTotal = dayMap
                ? Array.from(dayMap.values()).reduce((a, b) => a + b.length, 0)
                : 0;

              return (
                <tr key={worker.id} className="border-t hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background px-2 py-1 font-mono text-xs">
                    {worker.doc_number}
                  </td>
                  <td className="sticky left-[60px] z-10 bg-background px-2 py-1 font-medium whitespace-nowrap">
                    {worker.full_name}
                  </td>
                  {days.map((d, i) => {
                    const cellOrders = dayMap?.get(String(d)) ?? [];
                    const count = cellOrders.length;
                    const isWeekend =
                      dayOfWeek[i] === 0 || dayOfWeek[i] === 6;
                    const hasNotes = cellOrders.some((o) => o.notes);
                    const showTooltip = count > 1 || hasNotes;

                    return (
                      <td
                        key={d}
                        className={`px-1 py-1 text-center ${
                          isWeekend ? "bg-amber-50/50" : ""
                        } ${
                          count > 0
                            ? "text-green-700 font-bold"
                            : "text-muted-foreground/30"
                        }`}
                      >
                        {count > 0 ? (
                          showTooltip ? (
                            <CellTooltip
                              content={buildTooltipText(cellOrders)}
                            >
                              {count}
                            </CellTooltip>
                          ) : (
                            count
                          )
                        ) : (
                          ""
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center font-bold border-l">
                    {rowTotal || ""}
                  </td>
                </tr>
              );
            })}

            {/* NN row (only for APT and PRODUCCION) */}
            {showNNRow && (
              <tr className="border-t bg-amber-50/30">
                <td className="sticky left-0 z-10 bg-amber-50/30 px-2 py-1"></td>
                <td className="sticky left-[60px] z-10 bg-amber-50/30 px-2 py-1 font-medium">
                  NN
                </td>
                {days.map((d) => (
                  <td
                    key={d}
                    className="px-1 py-1 text-center text-muted-foreground"
                  >
                    {/* NN values would come from unmatched orders */}
                  </td>
                ))}
                <td className="px-2 py-1 text-center font-bold border-l"></td>
              </tr>
            )}

            {/* ADICIONALES row */}
            <tr className="border-t bg-blue-50/30">
              <td className="sticky left-0 z-10 bg-blue-50/30 px-2 py-1"></td>
              <td className="sticky left-[60px] z-10 bg-blue-50/30 px-2 py-1 font-medium">
                ADICIONALES
              </td>
              {days.map((d, i) => {
                const count = adicPerDay[i] || 0;
                const waCount = adicWaPerDay[i] || 0;
                const manualOrders = adicManualByDay.get(d) ?? [];
                const needsTooltip = count > 0 && (waCount > 0 && manualOrders.length > 0 || manualOrders.some((o) => o.notes));
                const tooltipLines: string[] = [`${count} adicional${count !== 1 ? "es" : ""}`];
                if (waCount > 0) tooltipLines.push(`- WhatsApp: ${waCount}`);
                if (manualOrders.length > 0) {
                  const notes = manualOrders.flatMap((o) => (o.notes ? [o.notes] : []));
                  tooltipLines.push(notes.length > 0
                    ? `- Manual: ${manualOrders.length} — ${notes.join("; ")}`
                    : `- Manual: ${manualOrders.length}`
                  );
                }
                return (
                  <td
                    key={d}
                    className="px-1 py-1 text-center text-blue-700 font-medium"
                  >
                    {count > 0 ? (
                      needsTooltip ? (
                        <CellTooltip content={tooltipLines.join("\n")}>{count}</CellTooltip>
                      ) : count
                    ) : ""}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-bold border-l text-blue-700">
                {adicPerDay.reduce((a, b) => a + b, 0) || ""}
              </td>
            </tr>

            {/* Manual product rows */}
            {manualProducts.map((row) => {
              const rowTotal = Object.values(row.dailyEntries).reduce(
                (sum, entries) => sum + entries.reduce((s, e) => s + e.qty, 0), 0
              );
              return (
                <tr key={row.productName} className="border-t bg-purple-50/30">
                  <td className="sticky left-0 z-10 bg-purple-50/30 px-2 py-1"></td>
                  <td className="sticky left-[60px] z-10 bg-purple-50/30 px-2 py-1 font-medium text-purple-800 whitespace-nowrap">
                    {row.productName.toUpperCase()}
                  </td>
                  {days.map((d) => {
                    const entries = row.dailyEntries[String(d)] ?? [];
                    const qty = entries.reduce((s, e) => s + e.qty, 0);
                    if (qty === 0) return <td key={d} className="px-1 py-1 text-center text-purple-700 font-medium"></td>;
                    const tooltipLines = [`${row.productName}: ${qty} unidad${qty !== 1 ? "es" : ""}`];
                    for (const e of entries) {
                      tooltipLines.push(e.notes ? `— ${e.qty} × ${e.notes}` : `— ${e.qty} unidad${e.qty !== 1 ? "es" : ""}`);
                    }
                    return (
                      <td key={d} className="px-1 py-1 text-center text-purple-700 font-medium">
                        <CellTooltip content={tooltipLines.join("\n")}>{qty}</CellTooltip>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center font-bold border-l text-purple-700">
                    {rowTotal || ""}
                  </td>
                </tr>
              );
            })}

            {/* TOTALS row */}
            <tr className="border-t-2 bg-muted font-bold">
              <td className="sticky left-0 z-10 bg-muted px-2 py-1"></td>
              <td className="sticky left-[60px] z-10 bg-muted px-2 py-1">
                {group.name.includes("CENA") ? "CENAS" : "ALMUERZOS"}
              </td>
              {days.map((d, i) => {
                const total = dayTotals[i] + (adicPerDay[i] || 0);
                const isMarked = noOrderDays?.has(d) ?? false;
                return (
                  <td
                    key={d}
                    className={`px-1 py-1 text-center ${total === 0 && isMarked ? "bg-gray-100 text-gray-400" : ""}`}
                  >
                    {total > 0 ? total : isMarked ? "Ø" : ""}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center border-l">
                {dayTotals.reduce((a, b) => a + b, 0) +
                  adicPerDay.reduce((a, b) => a + b, 0) || ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
