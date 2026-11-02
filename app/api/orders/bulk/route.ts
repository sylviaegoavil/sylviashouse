import { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type DeleteMode = "txt" | "all";

function monthRange(year: unknown, month: unknown) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { y, m, startDate, endDate };
}

/**
 * GET /api/orders/bulk?groupId&year&month
 * Preview counts for the "Borrar mes" dialog (super_admin only).
 * is_additional is nullable, so "not additional" means NULL or false.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const groupId = searchParams.get("groupId");
    const range = monthRange(searchParams.get("year"), searchParams.get("month"));
    if (!groupId || !range) {
      return Response.json({ error: "Faltan parámetros: groupId, year, month" }, { status: 400 });
    }
    const { startDate, endDate } = range;

    const supabase = createServiceRoleSupabaseClient();

    const countOrders = (source: "whatsapp" | "manual", additional: boolean) => {
      let q = supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("source", source)
        .gte("order_date", startDate)
        .lte("order_date", endDate);
      q = additional ? q.eq("is_additional", true) : q.or("is_additional.is.null,is_additional.eq.false");
      return q;
    };

    const [txtOrders, txtAdicionales, manualOrders, manualAdicionales, manualProducts] =
      await Promise.all([
        countOrders("whatsapp", false),
        countOrders("whatsapp", true),
        countOrders("manual", false),
        countOrders("manual", true),
        supabase
          .from("manual_products")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
          .gte("product_date", startDate)
          .lte("product_date", endDate),
      ]);

    const failed = [txtOrders, txtAdicionales, manualOrders, manualAdicionales, manualProducts].find(
      (r) => r.error
    );
    if (failed?.error) {
      return Response.json({ error: failed.error.message }, { status: 500 });
    }

    return Response.json({
      txtOrders: txtOrders.count ?? 0,
      txtAdicionales: txtAdicionales.count ?? 0,
      manualOrders: manualOrders.count ?? 0,
      manualAdicionales: manualAdicionales.count ?? 0,
      manualProducts: manualProducts.count ?? 0,
    });
  } catch (err) {
    console.error("Error in GET /api/orders/bulk:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

/**
 * DELETE /api/orders/bulk  { groupId, year, month, mode }
 *  - mode "txt": only orders with source='whatsapp' (pedidos + adicionales del TXT).
 *                Never touches source='manual' orders or manual_products.
 *  - mode "all": every order of the month + manual_products of the month.
 */
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { groupId, year, month, mode } = await request.json();
    if (!groupId || !year || !month) {
      return Response.json({ error: "Faltan parámetros: groupId, year, month" }, { status: 400 });
    }
    if (mode !== "txt" && mode !== "all") {
      return Response.json({ error: 'mode inválido: use "txt" o "all"' }, { status: 400 });
    }
    const deleteMode: DeleteMode = mode;

    const range = monthRange(year, month);
    if (!range) {
      return Response.json({ error: "year o month inválido" }, { status: 400 });
    }
    const { y, m, startDate, endDate } = range;

    const supabase = createServiceRoleSupabaseClient();

    // orders.source is NOT NULL with CHECK IN ('whatsapp','manual'), so "all" = both values.
    const sources = deleteMode === "txt" ? ["whatsapp"] : ["whatsapp", "manual"];

    // Count before deleting (for audit + response)
    const { count: ordersCount, error: countErr } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .in("source", sources)
      .gte("order_date", startDate)
      .lte("order_date", endDate);
    if (countErr) return Response.json({ error: countErr.message }, { status: 500 });

    let productsCount = 0;
    if (deleteMode === "all") {
      const { count, error } = await supabase
        .from("manual_products")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .gte("product_date", startDate)
        .lte("product_date", endDate);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      productsCount = count ?? 0;
    }

    const { error: delErr } = await supabase
      .from("orders")
      .delete()
      .eq("group_id", groupId)
      .in("source", sources)
      .gte("order_date", startDate)
      .lte("order_date", endDate);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

    if (deleteMode === "all") {
      const { error: mpErr } = await supabase
        .from("manual_products")
        .delete()
        .eq("group_id", groupId)
        .gte("product_date", startDate)
        .lte("product_date", endDate);
      if (mpErr) {
        return Response.json(
          { error: `Pedidos borrados, pero falló el borrado de productos manuales: ${mpErr.message}` },
          { status: 500 }
        );
      }
    }

    await logAudit(deleteMode === "txt" ? "bulk_delete_txt" : "bulk_delete_all", "orders", groupId, {
      groupId,
      year: y,
      month: m,
      startDate,
      endDate,
      mode: deleteMode,
      deletedOrders: ordersCount ?? 0,
      deletedManualProducts: productsCount,
      deletedBy: ctx.profile.email,
    });

    return Response.json({
      deleted: (ordersCount ?? 0) + productsCount,
      deletedOrders: ordersCount ?? 0,
      deletedManualProducts: productsCount,
    });
  } catch (err) {
    console.error("Error in DELETE /api/orders/bulk:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
