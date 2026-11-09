import { createServiceRoleSupabaseClient } from "@/lib/supabase-server";

// Evita el cache: cada llamada debe tocar la base de datos.
export const dynamic = "force-dynamic";

// Keep-alive para Supabase (plan gratuito pausa tras 7 días sin actividad).
// Lo invoca Vercel Cron una vez al día (ver vercel.json).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Vercel envía automáticamente "Authorization: Bearer <CRON_SECRET>".
  // Si CRON_SECRET no está configurado, se rechaza todo (falla cerrado).
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleSupabaseClient();
    // Consulta mínima de solo lectura: cuenta filas sin traer datos.
    const { error } = await supabase
      .from("groups")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("keep-alive: error de Supabase:", error.message);
      return Response.json({ ok: false }, { status: 500 });
    }

    return Response.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (err) {
    console.error("keep-alive: error inesperado:", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
