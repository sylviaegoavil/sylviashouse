import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR, createServiceRoleSupabaseClient } from "@/lib/supabase-server";

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const ruc = searchParams.get("ruc")?.trim() ?? "";
    const force = searchParams.get("force") === "true";

    if (!ruc || ruc.length !== 11 || !/^\d{11}$/.test(ruc)) {
      return Response.json({ error: "El RUC debe tener exactamente 11 dígitos numéricos" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClientSSR();

    // ── 1. Check cache first (unless force=true) ─────────────────────────
    if (!force) {
      const { data: cached } = await supabase
        .from("clients_cache")
        .select("ruc, business_name, address, attention, phone, email, reference")
        .eq("ruc", ruc)
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

    // ── 2. Call APIS PERU ─────────────────────────────────────────────────
    const token = process.env.APIS_PERU_TOKEN;
    if (!token) {
      return Response.json(
        { error: "Token APIS_PERU_TOKEN no configurado en variables de entorno" },
        { status: 500 }
      );
    }

    let apiRes: Response;
    try {
      apiRes = await fetch(
        `https://dniruc.apisperu.com/api/v1/ruc/${ruc}?token=${token}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
      );
    } catch {
      return Response.json({ error: "Sin conexión con el servicio de consulta RUC" }, { status: 503 });
    }

    if (apiRes.status === 401) {
      return Response.json({ error: "Token APIS_PERU vencido o inválido" }, { status: 401 });
    }

    const json = await apiRes.json().catch(() => null);

    if (!apiRes.ok || !json) {
      return Response.json({ error: "Error al consultar el RUC" }, { status: 502 });
    }

    if (json.success === false || !json.razonSocial) {
      const msg = json.message ?? "RUC no encontrado en SUNAT";
      return Response.json({ error: msg }, { status: 404 });
    }

    const parts = [json.direccion, json.distrito, json.provincia, json.departamento]
      .filter(Boolean)
      .join(", ");

    // ── 3. Save to cache using service role (bypasses RLS, no session needed) ─
    const serviceClient = createServiceRoleSupabaseClient();
    const { error: cacheError } = await serviceClient.from("clients_cache").upsert(
      {
        ruc:           json.ruc,
        business_name: json.razonSocial,
        address:       parts || null,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "ruc" }
    );
    if (cacheError) {
      console.error("[clients_cache] upsert failed after RUC lookup:", cacheError.message);
    }

    return Response.json({
      ruc: json.ruc,
      razonSocial: json.razonSocial,
      nombreComercial: json.nombreComercial ?? null,
      direccion: parts,
      estado: json.estado ?? null,
      condicion: json.condicion ?? null,
      fromCache: false,
    });
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/consultar-ruc:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
