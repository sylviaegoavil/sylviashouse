import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.profile.role !== "super_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClientSSR();

  const [groupsRes, workersRes] = await Promise.all([
    supabase.from("groups").select("id, client_id"),
    supabase.from("workers").select("group_id, groups!inner(client_id)").eq("is_active", true),
  ]);

  const stats: Record<string, { groups: number; workers: number }> = {};

  for (const g of groupsRes.data ?? []) {
    if (!stats[g.client_id]) stats[g.client_id] = { groups: 0, workers: 0 };
    stats[g.client_id].groups++;
  }

  for (const w of workersRes.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientId: string = (w as any).groups?.client_id;
    if (!clientId) continue;
    if (!stats[clientId]) stats[clientId] = { groups: 0, workers: 0 };
    stats[clientId].workers++;
  }

  return Response.json(stats);
}
