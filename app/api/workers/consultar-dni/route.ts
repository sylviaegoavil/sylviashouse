import { getAuthContext } from "@/lib/auth";
import { consultarDni } from "@/lib/services/dniLookup";

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dni = searchParams.get("dni")?.trim() ?? "";
    if (!/^\d{8}$/.test(dni)) {
      return Response.json({ error: "El DNI debe tener exactamente 8 dígitos numéricos" }, { status: 400 });
    }

    const result = await consultarDni(dni);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({ dni, fullName: result.fullName, provider: result.provider });
  } catch (err) {
    console.error("Error in GET /api/workers/consultar-dni:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
