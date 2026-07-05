import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

function requireAdmin(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

// GET ?q=... — search by RUC prefix or business_name substring (for autocomplete)
export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    const supabase = await createServerSupabaseClientSSR();

    let query = supabase
      .from("clients_cache")
      .select("ruc, business_name, address, attention, phone, email, reference")
      .order("business_name");

    // "all" = no filter (used by the clients list page)
    // empty string = autocomplete with no input → return nothing
    if (q === "") return Response.json([]);
    if (q !== "all") {
      query = query.or(`ruc.ilike.${q}%,business_name.ilike.%${q}%`);
      query = query.limit(8);
    }

    const { data, error } = await query;

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/clients-cache:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// DELETE ?ruc=... — remove a client from cache (super_admin only)
export async function DELETE(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "super_admin") {
      return Response.json({ error: "Solo super_admin puede eliminar clientes del caché" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const ruc = searchParams.get("ruc")?.trim();
    if (!ruc) return Response.json({ error: "ruc requerido" }, { status: 400 });

    const supabase = await createServerSupabaseClientSSR();
    const { error } = await supabase.from("clients_cache").delete().eq("ruc", ruc);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Error in DELETE /api/cotizaciones/clients-cache:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// POST — upsert a client into cache
export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const body = await req.json();
    if (!body.ruc || !body.business_name) {
      return Response.json({ error: "ruc y business_name son requeridos" }, { status: 400 });
    }
    if (!/^\d{11}$/.test(body.ruc)) {
      return Response.json({ error: "RUC inválido" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClientSSR();
    const { error } = await supabase.from("clients_cache").upsert(
      {
        ruc: body.ruc,
        business_name: body.business_name,
        address:    body.address    ?? null,
        attention:  body.attention  ?? null,
        phone:      body.phone      ?? null,
        email:      body.email      ?? null,
        reference:  body.reference  ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ruc" }
    );

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Error in POST /api/cotizaciones/clients-cache:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
