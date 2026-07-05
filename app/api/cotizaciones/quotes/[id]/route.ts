import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createServerSupabaseClientSSR();

    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", id)
      .single();

    if (qErr) return Response.json({ error: qErr.message }, { status: 404 });

    const { data: items, error: iErr } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", id)
      .order("position");

    if (iErr) return Response.json({ error: iErr.message }, { status: 500 });

    return Response.json({ ...quote, items: items ?? [] });
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/quotes/[id]:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "super_admin") {
      return Response.json({ error: "Solo super_admin puede eliminar cotizaciones" }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createServerSupabaseClientSSR();

    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Error in DELETE /api/cotizaciones/quotes/[id]:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
