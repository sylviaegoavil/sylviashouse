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
    const onlyActive = searchParams.get("active") === "true";

    const supabase = await createServerSupabaseClientSSR();
    let query = supabase.from("brands").select("*").order("name");
    if (onlyActive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/brands:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const body = await req.json();
    if (!body.name?.trim()) {
      return Response.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClientSSR();
    const { data, error } = await supabase
      .from("brands")
      .insert({ name: body.name.trim(), logo_url: body.logo_url ?? null })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/cotizaciones/brands:", err);
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
    if (body.name !== undefined) update.name = body.name;
    if (body.logo_url !== undefined) update.logo_url = body.logo_url;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    const { data, error } = await supabase
      .from("brands")
      .update(update)
      .eq("id", body.id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in PUT /api/cotizaciones/brands:", err);
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
      // Only super_admin can permanently delete
      if (ctx!.profile.role !== "super_admin") {
        return Response.json({ error: "Solo super_admin puede eliminar permanentemente" }, { status: 403 });
      }
      const { error } = await supabase.from("brands").delete().eq("id", id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // Soft-delete (deactivate)
    const { error } = await supabase
      .from("brands")
      .update({ is_active: false })
      .eq("id", id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Error in DELETE /api/cotizaciones/brands:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
