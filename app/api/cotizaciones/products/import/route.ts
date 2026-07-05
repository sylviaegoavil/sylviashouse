import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const supabase = await createServerSupabaseClientSSR();

    const [{ data: source }, { data: existing }] = await Promise.all([
      supabase.from("manual_product_types").select("name, unit_price").eq("is_active", true),
      supabase.from("products").select("description"),
    ]);

    const existingNames = new Set(
      (existing ?? []).map((p: { description: string }) => p.description.toLowerCase())
    );

    const toInsert = (source ?? [])
      .filter((pt: { name: string }) => !existingNames.has(pt.name.toLowerCase()))
      .map((pt: { name: string; unit_price: number }) => ({
        description: pt.name,
        unit_price: pt.unit_price,
        currency: "PEN",
      }));

    if (toInsert.length === 0) {
      return Response.json({ imported: 0, skipped: (source ?? []).length });
    }

    const { error } = await supabase.from("products").insert(toInsert);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      imported: toInsert.length,
      skipped: (source ?? []).length - toInsert.length,
    });
  } catch (err) {
    console.error("Error in POST /api/cotizaciones/products/import:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
