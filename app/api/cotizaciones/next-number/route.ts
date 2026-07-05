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
      .from("quote_counter")
      .select("year, last_number")
      .eq("id", 1)
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const currentYear = new Date().getFullYear();
    const nextNumber = data.year === currentYear ? data.last_number + 1 : 1;
    const formatted = `${currentYear}-${String(nextNumber).padStart(4, "0")}`;

    return Response.json({ number: formatted });
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/next-number:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
