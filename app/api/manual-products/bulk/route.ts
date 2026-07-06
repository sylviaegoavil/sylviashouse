import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productTypeId, groupId, month, year, quantity, onlyWithOrders, onConflict } = body;

    if (!productTypeId || !groupId || !month || !year || quantity === undefined) {
      return Response.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }
    if (Number(quantity) < 1) {
      return Response.json({ error: "La cantidad debe ser al menos 1" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const m = Number(month);
    const y = Number(year);
    const monthStr = String(m).padStart(2, "0");
    const daysInMonth = new Date(y, m, 0).getDate();
    const startDate = `${y}-${monthStr}-01`;
    const endDate   = `${y}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

    // Build full list of dates in the month
    let candidateDates: string[] = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${y}-${monthStr}-${String(d).padStart(2, "0")}`;
    });

    // Filter to days that have at least 1 order for this group
    if (onlyWithOrders) {
      const { data: orderRows } = await supabase
        .from("orders")
        .select("order_date")
        .eq("group_id", groupId)
        .gte("order_date", startDate)
        .lte("order_date", endDate);

      const orderDates = new Set((orderRows ?? []).map((o: { order_date: string }) => o.order_date));
      candidateDates = candidateDates.filter((d) => orderDates.has(d));
    }

    if (candidateDates.length === 0) {
      return Response.json({ created: 0, skipped: 0, overwritten: 0 });
    }

    // Fetch existing records for this product + group in the month
    const { data: existing } = await supabase
      .from("manual_products")
      .select("id, product_date")
      .eq("product_type_id", productTypeId)
      .eq("group_id", groupId)
      .gte("product_date", startDate)
      .lte("product_date", endDate);

    const existingMap = new Map<string, string>(); // date → row id
    for (const row of existing ?? []) {
      existingMap.set(row.product_date, row.id);
    }

    let created = 0, skipped = 0, overwritten = 0;

    for (const date of candidateDates) {
      const existingId = existingMap.get(date);
      if (existingId) {
        if (onConflict === "overwrite") {
          const { error } = await supabase
            .from("manual_products")
            .update({ quantity: Number(quantity) })
            .eq("id", existingId);
          if (!error) overwritten++;
        } else {
          skipped++;
        }
      } else {
        const { error } = await supabase.from("manual_products").insert({
          product_type_id: productTypeId,
          group_id: groupId,
          product_date: date,
          quantity: Number(quantity),
        });
        if (!error) created++;
      }
    }

    await logAudit("bulk_create", "manual_products", `bulk-${y}-${monthStr}`, {
      productTypeId, groupId, month: m, year: y, quantity,
      onlyWithOrders, onConflict, created, skipped, overwritten,
    });

    return Response.json({ created, skipped, overwritten });
  } catch (error) {
    console.error("Error in POST /api/manual-products/bulk:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
