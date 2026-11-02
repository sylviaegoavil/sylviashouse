/**
 * POST /api/workers/bulk   (super_admin only)
 *
 * Body: { action: "deactivate" | "activate" | "delete", ids: string[] }
 *
 *  - deactivate / activate: set is_active (reversible; history is kept).
 *  - delete: removes only workers whose DNI has NO order in ANY group (re-verified here
 *    and again atomically by the delete_workers_without_orders SQL function). Workers
 *    with history are NOT deleted and come back in `skipped`.
 *
 * Every affected worker is written to audit_log.
 */

import { NextRequest } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteIfNoHistory, type WorkerLite } from "@/lib/worker-protection";

const MAX_IDS = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Action = "deactivate" | "activate" | "delete";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx || ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const action = body?.action as Action;
    const rawIds: unknown = body?.ids;

    if (action !== "deactivate" && action !== "activate" && action !== "delete") {
      return Response.json({ error: "action inválida" }, { status: 400 });
    }
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return Response.json({ error: "Falta ids" }, { status: 400 });
    }
    const ids = [...new Set(rawIds.map(String))];
    if (ids.length > MAX_IDS) {
      return Response.json({ error: `Máximo ${MAX_IDS} trabajadores por operación` }, { status: 400 });
    }
    if (!ids.every((id) => UUID_RE.test(id))) {
      return Response.json({ error: "ids inválidos" }, { status: 400 });
    }

    const supabase = createServiceRoleSupabaseClient();

    const { data: found, error: readErr } = await supabase
      .from("workers")
      .select("id, full_name, doc_number, group_id")
      .in("id", ids);
    if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
    const workers = (found ?? []) as WorkerLite[];

    const audit = (w: WorkerLite, auditAction: string) =>
      logAudit(auditAction, "workers", w.id, {
        fullName: w.full_name,
        docNumber: w.doc_number,
        groupId: w.group_id,
        bulk: true,
        by: ctx.profile.email,
      });

    if (action === "delete") {
      const { deleted, skipped } = await deleteIfNoHistory(supabase, workers);
      await Promise.all(deleted.map((w) => audit(w, "worker_delete")));
      return Response.json({
        deleted: deleted.map((w) => w.id),
        skipped: skipped.map((s) => ({
          id: s.worker.id,
          fullName: s.worker.full_name,
          docNumber: s.worker.doc_number,
          orderCount: s.orderCount,
        })),
      });
    }

    const isActive = action === "activate";
    const { error: updErr } = await supabase
      .from("workers")
      .update({ is_active: isActive })
      .in("id", workers.map((w) => w.id));
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    await Promise.all(workers.map((w) => audit(w, isActive ? "worker_activate" : "worker_deactivate")));
    return Response.json({ updated: workers.map((w) => w.id) });
  } catch (err) {
    console.error("Error in POST /api/workers/bulk:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error interno del servidor" },
      { status: 500 }
    );
  }
}
