import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR, createServiceRoleSupabaseClient } from "@/lib/supabase-server";
import { consultarRuc } from "@/lib/services/rucLookup";
import { consultarDni } from "@/lib/services/dniLookup";

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const doc = searchParams.get("ruc")?.trim() ?? "";
    const force = searchParams.get("force") === "true";

    const isRuc = /^\d{11}$/.test(doc);
    const isDni = /^\d{8}$/.test(doc);
    if (!isRuc && !isDni) {
      return Response.json({ error: "Ingresa un RUC (11 dígitos) o DNI (8 dígitos) válido" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClientSSR();

    // ── 1. Check cache first (unless force=true) ─────────────────────────
    if (!force) {
      const { data: cached } = await supabase
        .from("clients_cache")
        .select("ruc, business_name, address, attention, phone, email, reference")
        .eq("ruc", doc)
        .maybeSingle();

      if (cached) {
        return Response.json({
          ruc: cached.ruc,
          razonSocial: cached.business_name,
          direccion: cached.address ?? "",
          fromCache: true,
        });
      }
    }

    // ── 2. Call external provider (APIs Peru, con fallback a Decolecta) ──
    let razonSocial: string;
    let nombreComercial: string | null = null;
    let direccion = "";
    let estado: string | null = null;
    let condicion: string | null = null;

    if (isRuc) {
      const result = await consultarRuc(doc);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      razonSocial = result.razonSocial;
      nombreComercial = result.nombreComercial;
      direccion = result.direccion;
      estado = result.estado;
      condicion = result.condicion;
    } else {
      const result = await consultarDni(doc);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      razonSocial = result.fullName;
    }

    // ── 3. Save to cache using service role (bypasses RLS, no session needed) ─
    const serviceClient = createServiceRoleSupabaseClient();
    const { error: cacheError } = await serviceClient.from("clients_cache").upsert(
      {
        ruc:           doc,
        business_name: razonSocial,
        address:       direccion || null,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "ruc" }
    );
    if (cacheError) {
      console.error("[clients_cache] upsert failed after document lookup:", cacheError.message);
    }

    return Response.json({
      ruc: doc,
      razonSocial,
      nombreComercial,
      direccion,
      estado,
      condicion,
      fromCache: false,
    });
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/consultar-ruc:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
