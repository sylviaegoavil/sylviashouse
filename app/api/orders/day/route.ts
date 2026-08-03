import { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { groupId, date } = await request.json();
    if (!groupId || !date) {
      return Response.json({ error: "Faltan parámetros: groupId, date" }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("order_date", date);

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("group_id", groupId)
      .eq("order_date", date);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAudit("delete_day_orders", "orders", groupId, {
      date,
      deletedCount: count ?? 0,
      deletedBy: ctx.profile.email,
    });

    return Response.json({ deleted: count ?? 0 });
  } catch (err) {
    console.error("Error in DELETE /api/orders/day:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
