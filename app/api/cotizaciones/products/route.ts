import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

function requireAdmin(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const brandId = searchParams.get("brand_id") ?? "";

    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = await createServerSupabaseClientSSR();
    let query = supabase
      .from("products")
      .select("*, brands(id, name)")
      .order("description");

    if (!includeInactive) query = query.eq("is_active", true);

    if (search) {
      query = query.or(`description.ilike.%${search}%,code.ilike.%${search}%`);
    }
    if (brandId) {
      query = query.eq("brand_id", brandId);
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/products:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const body = await req.json();

    // Support batch insert (array) or single insert
    if (Array.isArray(body)) {
      const rows = body.filter((r) => r.description?.trim());
      if (rows.length === 0) return Response.json({ error: "Sin filas válidas" }, { status: 400 });

      const supabase = await createServerSupabaseClientSSR();
      const { data, error } = await supabase.from("products").insert(rows).select();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json(data, { status: 201 });
    }

    if (!body.description?.trim()) {
      return Response.json({ error: "La descripción es requerida" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClientSSR();
    const { data, error } = await supabase
      .from("products")
      .insert({
        code: body.code?.trim() || null,
        description: body.description.trim(),
        unit: body.unit?.trim() || null,
        brand_id: body.brand_id || null,
        product_type: body.product_type?.trim() || null,
        unit_price: body.unit_price ?? null,
        currency: body.currency ?? "PEN",
      })
      .select("*, brands(id, name)")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/cotizaciones/products:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const body = await req.json();
    if (!body.id) return Response.json({ error: "id requerido" }, { status: 400 });

    const supabase = await createServerSupabaseClientSSR();
    const update: Record<string, unknown> = {};
    if (body.code !== undefined) update.code = body.code?.trim() || null;
    if (body.description !== undefined) update.description = body.description.trim();
    if (body.unit !== undefined) update.unit = body.unit?.trim() || null;
    if (body.brand_id !== undefined) update.brand_id = body.brand_id || null;
    if (body.product_type !== undefined) update.product_type = body.product_type?.trim() || null;
    if (body.unit_price !== undefined) update.unit_price = body.unit_price ?? null;
    if (body.currency !== undefined) update.currency = body.currency;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("id", body.id)
      .select("*, brands(id, name)")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in PUT /api/cotizaciones/products:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const permanent = searchParams.get("permanent") === "true";
    if (!id) return Response.json({ error: "id requerido" }, { status: 400 });

    const supabase = await createServerSupabaseClientSSR();

    if (permanent) {
      if (ctx!.profile.role !== "super_admin") {
        return Response.json({ error: "Solo super_admin puede eliminar permanentemente" }, { status: 403 });
      }
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Error in DELETE /api/cotizaciones/products:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
