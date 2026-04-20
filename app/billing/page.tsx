"use client";

import React, { useEffect, useState } from "react";
import { DollarSign, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { DEFAULT_PRICES } from "@/lib/prices";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTHS = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" }, { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" }, { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

const IGV = 0.18;

const EXCEL_GROUPS = ["APT", "PRODUCCION", "PATIO"];
const GROUP_TO_EXCEL: Record<string, string> = {
  "APT ALMUERZOS": "APT",
  "APT CENAS": "APT",
  "PRODUCCION": "PRODUCCION",
  "STAFF": "PRODUCCION",
  "PATIO ALMUERZOS": "PATIO",
  "PATIO CENAS": "PATIO",
};
const FIXED_CENAS_PRODUCCION = 25;
const FIXED_CAFE_PRODUCCION = 2;

interface BillingLine {
  concept: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface ExcelBilling {
  lines: BillingLine[];
  subtotal: number;
  igv: number;
  total: number;
}

export default function BillingPage() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [billing, setBilling] = useState<Record<string, ExcelBilling>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const days = lastDay;

      const supabase = createBrowserSupabaseClient();
      const [{ data: groups }, { data: manualProds }, { data: groupPricesRaw }, { data: mptPricesRaw }] =
        await Promise.all([
          supabase.from("groups").select("id, name, excel_group"),
          supabase.from("manual_products").select(`product_date, quantity, product_type_id, manual_product_types(name, unit_price), group_id`).gte("product_date", startDate).lte("product_date", endDate),
          supabase.from("group_prices").select("group_id, concept, unit_price").lte("effective_from", startDate).order("effective_from", { ascending: false }),
          supabase.from("manual_product_type_prices").select("product_type_id, unit_price").lte("effective_from", startDate).order("effective_from", { ascending: false }),
        ]);

      // Paginate orders to avoid the 1000-row Supabase limit
      const PAGE = 1000;
      const orders: { group_id: string; is_additional: boolean; special_price: number | null; special_label: string | null }[] = [];
      let from = 0;
      while (true) {
        const { data: chunk } = await supabase
          .from("orders")
          .select("group_id, is_additional, special_price, special_label")
          .gte("order_date", startDate)
          .lte("order_date", endDate)
          .range(from, from + PAGE - 1);
        if (chunk) orders.push(...chunk);
        if (!chunk || chunk.length < PAGE) break;
        from += PAGE;
      }

      // Historical product type price map
      const mptPriceMap = new Map<string, number>();
      for (const row of mptPricesRaw ?? []) {
        if (!mptPriceMap.has(row.product_type_id)) mptPriceMap.set(row.product_type_id, row.unit_price);
      }

      const prices: Record<string, number> = { ...DEFAULT_PRICES };
      const seenGP = new Set<string>();
      for (const gp of groupPricesRaw || []) {
        if (!seenGP.has(gp.concept)) { prices[gp.concept] = gp.unit_price; seenGP.add(gp.concept); }
      }

      // Regular orders (exclude additionals and special-price orders)
      const ordersByGroup: Record<string, number> = {};
      for (const o of orders) {
        if (o.is_additional || o.special_price != null) continue;
        ordersByGroup[o.group_id] = (ordersByGroup[o.group_id] || 0) + 1;
      }

      // Special orders grouped by group_id → label+price
      const specialByGroup: Record<string, Map<string, { label: string; price: number; qty: number }>> = {};
      for (const o of orders) {
        if (o.is_additional || o.special_price == null) continue;
        if (!specialByGroup[o.group_id]) specialByGroup[o.group_id] = new Map();
        const label = o.special_label?.trim() || "Pedido especial";
        const key = `${label}\x00${o.special_price}`;
        const existing = specialByGroup[o.group_id].get(key);
        if (existing) { existing.qty++; }
        else { specialByGroup[o.group_id].set(key, { label, price: o.special_price, qty: 1 }); }
      }

      const result: Record<string, ExcelBilling> = {};

      for (const eg of EXCEL_GROUPS) {
        const excelGroups = (groups || []).filter((g) => GROUP_TO_EXCEL[g.name] === eg);
        const lines: BillingLine[] = [];

        for (const g of excelGroups) {
          const qty = ordersByGroup[g.id] || 0;
          const concept = g.name.includes("CENAS") ? "CENA" : "ALMUERZO";
          const unitPrice = prices[concept] || 0;
          if (qty > 0) lines.push({ concept: g.name, quantity: qty, unitPrice, subtotal: qty * unitPrice });
        }

        // Fixed values for PRODUCCION
        if (eg === "PRODUCCION") {
          lines.push({ concept: "CENAS (fijas)", quantity: FIXED_CENAS_PRODUCCION * days, unitPrice: prices["CENA"] || 0, subtotal: FIXED_CENAS_PRODUCCION * days * (prices["CENA"] || 0) });
          lines.push({ concept: "CAFÉ (fijo)", quantity: FIXED_CAFE_PRODUCCION * days, unitPrice: prices["CAFÉ"] || 30, subtotal: FIXED_CAFE_PRODUCCION * days * (prices["CAFÉ"] || 30) });
        }

        // Special-price orders
        for (const g of excelGroups) {
          const specials = specialByGroup[g.id];
          if (!specials) continue;
          for (const { label, price, qty } of specials.values()) {
            lines.push({ concept: `${g.name} — ${label}`, quantity: qty, unitPrice: price, subtotal: qty * price });
          }
        }

        // Manual products
        const excelGroupIds = new Set(excelGroups.map((g) => g.id));
        const mps = (manualProds || []).filter((mp: { group_id: string }) => excelGroupIds.has(mp.group_id));
        const ptTotals: Record<string, { qty: number; price: number }> = {};
        for (const mp of mps) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pt = (mp as any).manual_product_types;
          if (!pt) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const historicalPrice = mptPriceMap.get((mp as any).product_type_id) ?? pt.unit_price;
          if (!ptTotals[pt.name]) ptTotals[pt.name] = { qty: 0, price: historicalPrice };
          ptTotals[pt.name].qty += mp.quantity;
        }
        for (const [name, { qty, price }] of Object.entries(ptTotals)) {
          if (qty > 0) lines.push({ concept: name, quantity: qty, unitPrice: price, subtotal: qty * price });
        }

        const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
        const igv = subtotal * IGV;
        result[eg] = { lines, subtotal, igv, total: subtotal + igv };
      }

      setBilling(result);
      setLoading(false);
    }
    load();
  }, [month, year]);

  const grandTotal = Object.values(billing).reduce((s, b) => s + b.total, 0);
  const grandSubtotal = Object.values(billing).reduce((s, b) => s + b.subtotal, 0);
  const grandIgv = Object.values(billing).reduce((s, b) => s + b.igv, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Facturación</h1>
        <p className="text-muted-foreground">Totales a facturar por los 3 Excel con desglose por concepto.</p>
      </div>

      {/* Period selector */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4 flex gap-4 flex-wrap">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded border border-input px-3 py-2 text-sm">
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded border border-input px-3 py-2 text-sm">
            {Array.from({ length: 10 }, (_, i) => 2026 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Calculando...</div>
      ) : (
        <>
          {/* Grand total */}
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-amber-800 font-medium mb-1">Subtotal</p>
                <p className="text-2xl font-bold text-amber-900">S/.{grandSubtotal.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="pt-5 pb-5">
                <p className="text-sm text-orange-800 font-medium mb-1">IGV (18%)</p>
                <p className="text-2xl font-bold text-orange-900">S/.{grandIgv.toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-700" />
                  <p className="text-sm text-green-800 font-medium">TOTAL</p>
                </div>
                <p className="text-2xl font-bold text-green-900">S/.{grandTotal.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-excel breakdown */}
          <div className="space-y-6">
            {EXCEL_GROUPS.map((eg) => {
              const b = billing[eg];
              if (!b) return null;
              return (
                <Card key={eg}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-amber-700" />
                      Excel {eg}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm mb-3">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-1.5">Concepto</th>
                          <th className="text-right py-1.5">Cantidad</th>
                          <th className="text-right py-1.5">P. Unit.</th>
                          <th className="text-right py-1.5">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.lines.map((line, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2">{line.concept}</td>
                            <td className="py-2 text-right">{line.quantity}</td>
                            <td className="py-2 text-right">S/.{line.unitPrice.toFixed(2)}</td>
                            <td className="py-2 text-right font-medium">S/.{line.subtotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="border-t pt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>S/.{b.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IGV (18%)</span>
                        <span>S/.{b.igv.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-1">
                        <span>TOTAL</span>
                        <span className="text-green-700">S/.{b.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
