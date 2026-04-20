import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { groupId, year, month } = await request.json();
    if (!groupId || !year || !month) {
      return Response.json({ error: "Faltan parámetros: groupId, year, month" }, { status: 400 });
    }

    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      return Response.json({ error: "year o month inválido" }, { status: 400 });
    }

    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const supabase = createServerSupabaseClient();

    // Count before deleting (for audit + response)
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .gte("order_date", startDate)
      .lte("order_date", endDate);

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("group_id", groupId)
      .gte("order_date", startDate)
      .lte("order_date", endDate);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAudit("bulk_delete", "orders", groupId, {
      groupId,
      year: y,
      month: m,
      startDate,
      endDate,
      deletedCount: count ?? 0,
      deletedBy: ctx.profile.email,
    });

    return Response.json({ deleted: count ?? 0 });
  } catch (err) {
    console.error("Error in DELETE /api/orders/bulk:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
