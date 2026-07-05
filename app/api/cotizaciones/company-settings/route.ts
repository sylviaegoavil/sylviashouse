import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const supabase = await createServerSupabaseClientSSR();
    const { data, error } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/company-settings:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "super_admin") {
      return Response.json({ error: "Solo super_admin puede editar la configuración" }, { status: 403 });
    }

    const body = await req.json();
    const supabase = await createServerSupabaseClientSSR();

    // Get existing row id for upsert
    const { data: existing } = await supabase
      .from("company_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      ...(existing?.id ? { id: existing.id } : {}),
      company_name: body.company_name,
      trade_name: body.trade_name ?? null,
      ruc: body.ruc,
      address: body.address ?? null,
      district: body.district ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      advisor_name: body.advisor_name ?? null,
      advisor_role: body.advisor_role ?? null,
      advisor_phone: body.advisor_phone ?? null,
      bank_accounts: body.bank_accounts ?? [],
      logo_url: body.logo_url ?? null,
    };

    const { data, error } = await supabase
      .from("company_settings")
      .upsert(payload)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in PUT /api/cotizaciones/company-settings:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
