import { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const orderId = params.id;
    if (!orderId) {
      return Response.json({ error: "Falta el id del pedido" }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();

    // Fetch order first to log context
    const { data: order } = await supabase
      .from("orders")
      .select("id, group_id, worker_id, order_date")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAudit("delete_order", "orders", order.group_id, {
      orderId,
      date: order.order_date,
      workerId: order.worker_id,
      deletedBy: ctx.profile.email,
    });

    return Response.json({ deleted: 1 });
  } catch (err) {
    console.error("Error in DELETE /api/orders/[id]:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
