import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });

    const supabase = await createServerSupabaseClientSSR();
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .eq("client_id", ctx.selectedClientId)
      .order("name", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (error) {
    console.error("Error in GET /api/groups:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
