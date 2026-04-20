/**
 * POST /api/export-excel
 *
 * Body: { excelType: 'APT' | 'PRODUCCION' | 'PATIO', month: 'YYYY-MM' }
 *
 * Returns the Excel file as a binary response.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateExcelAPT, generateExcelProduccion, generateExcelPatio, ExcelInput, WorkerOrder, ManualProductEntry, SpecialOrderSummary } from "@/lib/excel";
import { DEFAULT_PRICES } from "@/lib/prices";

const MONTH_NAMES: Record<number, string> = {
  1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL",
  5: "MAYO", 6: "JUNIO", 7: "JULIO", 8: "AGOSTO",
  9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE",
};

// Map excel type to group names
const EXCEL_GROUPS: Record<string, string[]> = {
  APT: ["APT ALMUERZOS", "APT CENAS"],
  PRODUCCION: ["PRODUCCION", "STAFF"],
  PATIO: ["PATIO ALMUERZOS", "PATIO CENAS"],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { excelType, month } = body as { excelType: string; month: string };

    if (!excelType || !month) {
      return Response.json({ error: "Se requieren excelType y month" }, { status: 400 });
    }

    const groupNames = EXCEL_GROUPS[excelType];
    if (!groupNames) {
      return Response.json({ error: "excelType inválido" }, { status: 400 });
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    if (!year || !monthNum) {
      return Response.json({ error: "Formato de mes inválido, use YYYY-MM" }, { status: 400 });
    }

    const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const supabase = createServerSupabaseClient();

    // Fetch all groups
    const { data: allGroups } = await supabase.from("groups").select("*");
    if (!allGroups) {
      return Response.json({ error: "No se pudieron cargar los grupos" }, { status: 500 });
    }

    const relevantGroups = allGroups.filter((g) => groupNames.includes(g.name));
    const groupIds = relevantGroups.map((g) => g.id);

    // Fetch workers for these groups
    const { data: allWorkers } = await supabase
      .from("workers")
      .select("id, group_id, full_name, doc_number")
      .in("group_id", groupIds)
      .eq("is_active", true)
      .order("full_name");

    // Fetch orders for this month (paginated — all groups can exceed 1000 rows/month)
    const _ordersAll: unknown[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: chunk } = await supabase
          .from("orders")
          .select("worker_id, group_id, order_date, is_additional, special_price, special_label")
          .in("group_id", groupIds)
          .gte("order_date", startDate)
          .lte("order_date", endDate)
          .range(from, from + PAGE - 1);
        if (chunk) _ordersAll.push(...chunk);
        if (!chunk || chunk.length < PAGE) break;
        from += PAGE;
      }
    }
    const allOrders = _ordersAll as { worker_id: string | null; group_id: string; order_date: string; is_additional: boolean; special_price: number | null; special_label: string | null }[];

    // Fetch manual products for this month
    const { data: manualProductsRaw } = await supabase
      .from("manual_products")
      .select("product_type_id, group_id, product_date, quantity, manual_product_types(name, unit_price)")
      .in("group_id", groupIds)
      .gte("product_date", startDate)
      .lte("product_date", endDate);

    // Fetch product type prices (historical: most recent <= startDate)
    const { data: mptPricesRaw } = await supabase
      .from("manual_product_type_prices")
      .select("product_type_id, unit_price")
      .lte("effective_from", startDate)
      .order("effective_from", { ascending: false });

    // Build historical product type price map (first = most recent <= startDate)
    const mptPriceMap = new Map<string, number>();
    for (const row of mptPricesRaw ?? []) {
      if (!mptPriceMap.has(row.product_type_id)) mptPriceMap.set(row.product_type_id, row.unit_price);
    }

    // Fetch current product type prices as fallback for the prices map
    const { data: productTypes } = await supabase
      .from("manual_product_types")
      .select("id, name, unit_price")
      .eq("is_active", true);

    // Fetch group prices (historical: most recent <= startDate)
    const { data: groupPricesRaw } = await supabase
      .from("group_prices")
      .select("group_id, concept, unit_price")
      .in("group_id", groupIds)
      .lte("effective_from", startDate)
      .order("effective_from", { ascending: false });

    // Fetch fixed values for PRODUCCION
    const { data: fixedValuesRaw } = await supabase
      .from("group_fixed_values")
      .select("group_id, concept, default_quantity")
      .in("group_id", groupIds);

    // Fetch fixed value overrides for this month
    const { data: overridesRaw } = await supabase
      .from("fixed_value_overrides")
      .select("group_id, concept, override_date, quantity")
      .in("group_id", groupIds)
      .gte("override_date", startDate)
      .lte("override_date", endDate);

    // Build data structures
    const workersByGroup: Record<string, { id: string; full_name: string; doc_number: string }[]> = {};
    for (const w of allWorkers || []) {
      const group = relevantGroups.find((g) => g.id === w.group_id);
      if (group) {
        if (!workersByGroup[group.name]) workersByGroup[group.name] = [];
        workersByGroup[group.name].push(w);
      }
    }

    // Build orders per worker per day (count multiple orders as higher value)
    const ordersByGroup: Record<string, WorkerOrder[]> = {};
    const orderCountMap: Record<string, Record<string, number>> = {}; // workerId+date -> count

    for (const o of allOrders || []) {
      if (o.is_additional || !o.worker_id) continue; // adicionales handled separately
      if (o.special_price != null) continue; // special orders go to their own rows
      const group = relevantGroups.find((g) => g.id === o.group_id);
      if (!group) continue;
      const key = `${o.worker_id}|${o.order_date}`;
      if (!orderCountMap[group.name]) orderCountMap[group.name] = {};
      orderCountMap[group.name][key] = (orderCountMap[group.name][key] || 0) + 1;
    }

    // Build special orders by group → label+price → daily quantities
    const _specialMap = new Map<string, { groupName: string; label: string; price: number; dailyQty: Record<string, number> }>();
    for (const o of allOrders || []) {
      if (o.is_additional || !o.worker_id || o.special_price == null) continue;
      const group = relevantGroups.find((g) => g.id === o.group_id);
      if (!group) continue;
      const label = o.special_label?.trim() || "Pedido especial";
      const mapKey = `${group.name}\x00${label}\x00${o.special_price}`;
      if (!_specialMap.has(mapKey)) {
        _specialMap.set(mapKey, { groupName: group.name, label, price: o.special_price, dailyQty: {} });
      }
      const entry = _specialMap.get(mapKey)!;
      entry.dailyQty[o.order_date] = (entry.dailyQty[o.order_date] || 0) + 1;
    }
    const specialOrders: SpecialOrderSummary[] = [..._specialMap.values()];

    for (const groupName of groupNames) {
      const workers = workersByGroup[groupName] || [];
      const countMap = orderCountMap[groupName] || {};
      ordersByGroup[groupName] = [];

      // Aggregate unique worker+date combos
      const seen = new Set<string>();
      for (const w of workers) {
        for (const [key, count] of Object.entries(countMap)) {
          const [wId, date] = key.split("|");
          if (wId === w.id && !seen.has(key)) {
            seen.add(key);
            ordersByGroup[groupName].push({
              workerId: w.id,
              workerName: w.full_name,
              docNumber: w.doc_number,
              orderDate: date,
              count,
            });
          }
        }
      }
    }

    // Build adicionales from orders with is_additional=true (includes manual adicionales)
    // These are already in allOrders — filter from the data we already fetched.
    const adicionalesByGroup: Record<string, Record<string, number>> = {};
    for (const o of allOrders || []) {
      if (!o.is_additional) continue;
      const group = relevantGroups.find((g) => g.id === o.group_id);
      if (!group) continue;
      if (!adicionalesByGroup[group.name]) adicionalesByGroup[group.name] = {};
      adicionalesByGroup[group.name][o.order_date] =
        (adicionalesByGroup[group.name][o.order_date] || 0) + 1;
    }

    // Build manual products list (use historical price if available, else current)
    const manualProducts: ManualProductEntry[] = [];
    for (const mp of manualProductsRaw || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pt = (mp as any).manual_product_types;
      if (pt) {
        manualProducts.push({
          productName: pt.name,
          quantity: mp.quantity,
          date: mp.product_date,
          unitPrice: mptPriceMap.get(mp.product_type_id) ?? pt.unit_price,
        });
      }
    }

    // Build prices map (historical product prices take priority over current unit_price)
    const prices: Record<string, number> = { ...DEFAULT_PRICES };
    if (productTypes) {
      for (const pt of productTypes) {
        prices[pt.name] = mptPriceMap.get(pt.id) ?? pt.unit_price;
      }
    }
    if (groupPricesRaw) {
      const seenConcepts = new Set<string>();
      for (const gp of groupPricesRaw) {
        if (!seenConcepts.has(gp.concept)) {
          prices[gp.concept] = gp.unit_price;
          seenConcepts.add(gp.concept);
        }
      }
    }

    // Fixed values for PRODUCCION
    let fixedCenas = 25;
    let fixedCafe = 2;
    if (fixedValuesRaw) {
      for (const fv of fixedValuesRaw) {
        if (fv.concept === "CENAS") fixedCenas = fv.default_quantity;
        if (fv.concept === "CAFÉ") fixedCafe = fv.default_quantity;
      }
    }

    const input: ExcelInput = {
      month: monthNum,
      year,
      orders: ordersByGroup,
      workers: workersByGroup,
      adicionales: adicionalesByGroup,
      manualProducts,
      specialOrders,
      fixedCenas,
      fixedCafe,
      prices,
    };

    let buffer: Buffer;
    let filename: string;
    const monthLabel = MONTH_NAMES[monthNum] || month;

    if (excelType === "APT") {
      buffer = await generateExcelAPT(input);
      filename = `APT_${monthLabel}_${year}.xlsx`;
    } else if (excelType === "PRODUCCION") {
      buffer = await generateExcelProduccion(input);
      filename = `PRODUCCION_${monthLabel}_${year}.xlsx`;
    } else {
      buffer = await generateExcelPatio(input);
      filename = `PATIO_${monthLabel}_${year}.xlsx`;
    }

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/export-excel:", error);
    return Response.json({ error: "Error al generar Excel" }, { status: 500 });
  }
}
