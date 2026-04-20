import { getAuthContext } from "@/lib/auth";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
  return Response.json({
    profile: ctx.profile,
    clients: ctx.clients,
    selectedClientId: ctx.selectedClientId,
  });
}
