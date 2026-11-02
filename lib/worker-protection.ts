/**
 * Server-side protection for worker deletion.
 *
 * orders.worker_id is ON DELETE CASCADE, so deleting a worker row would delete its
 * orders. A person can have one worker row per group (same DNI), so history is judged
 * per DNI across ALL groups (active and inactive rows). Any read error fails closed.
 */

import type { createServiceRoleSupabaseClient } from "@/lib/supabase-server";

type ServiceClient = ReturnType<typeof createServiceRoleSupabaseClient>;

export interface WorkerLite {
  id: string;
  full_name: string;
  doc_number: string;
  group_id: string;
}

export interface SkippedWorker {
  worker: WorkerLite;
  orderCount: number; // orders of the DNI across all groups (0 = blocked by the DB guard)
}

const PAGE = 1000;
const DNI_CHUNK = 100;

/** worker_id → order count, for every worker that has orders (uses worker_last_orders). */
async function orderCountsByWorker(supabase: ServiceClient): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .rpc("worker_last_orders", { p_group_ids: null })
      .order("worker_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`No se pudo calcular el historial: ${error.message}`);
    const rows = (data ?? []) as { worker_id: string; order_count: number }[];
    for (const r of rows) counts.set(r.worker_id, Number(r.order_count));
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return counts;
}

/**
 * workerId → total orders of that worker's DNI in ANY group (including its own row and
 * every other row with the same doc_number). 0 means the DNI has no history anywhere.
 */
export async function getDniHistory(
  supabase: ServiceClient,
  workers: WorkerLite[]
): Promise<Map<string, number>> {
  const dnis = [...new Set(workers.map((w) => w.doc_number))];

  // Every worker row (any group, active or not) that shares one of these DNIs
  const idsByDni = new Map<string, string[]>();
  for (let i = 0; i < dnis.length; i += DNI_CHUNK) {
    const { data, error } = await supabase
      .from("workers")
      .select("id, doc_number")
      .in("doc_number", dnis.slice(i, i + DNI_CHUNK));
    if (error) throw new Error(`No se pudo leer trabajadores del DNI: ${error.message}`);
    for (const r of data ?? []) {
      const list = idsByDni.get(r.doc_number) ?? [];
      list.push(r.id);
      idsByDni.set(r.doc_number, list);
    }
  }

  const perWorker = await orderCountsByWorker(supabase);

  const result = new Map<string, number>();
  for (const w of workers) {
    const siblings = new Set([w.id, ...(idsByDni.get(w.doc_number) ?? [])]);
    let total = 0;
    for (const id of siblings) total += perWorker.get(id) ?? 0;
    result.set(w.id, total);
  }
  return result;
}

/**
 * Delete only the workers whose DNI has no orders anywhere. Two barriers:
 *  1. TypeScript pre-check (getDniHistory).
 *  2. delete_workers_without_orders(), which re-checks atomically inside the database.
 * Anything not deleted is returned in `skipped`. Throws (deleting nothing) on any error.
 */
export async function deleteIfNoHistory(
  supabase: ServiceClient,
  workers: WorkerLite[]
): Promise<{ deleted: WorkerLite[]; skipped: SkippedWorker[] }> {
  if (workers.length === 0) return { deleted: [], skipped: [] };

  const history = await getDniHistory(supabase, workers);
  const skipped: SkippedWorker[] = [];
  const eligible: WorkerLite[] = [];
  for (const w of workers) {
    const count = history.get(w.id) ?? 0;
    if (count > 0) skipped.push({ worker: w, orderCount: count });
    else eligible.push(w);
  }
  if (eligible.length === 0) return { deleted: [], skipped };

  const { data, error } = await supabase.rpc("delete_workers_without_orders", {
    p_ids: eligible.map((w) => w.id),
  });
  if (error) {
    throw new Error(
      `No se pudo eliminar (¿existe la función delete_workers_without_orders?): ${error.message}`
    );
  }

  const deletedIds = new Set(((data ?? []) as { deleted_id: string }[]).map((r) => r.deleted_id));
  const deleted: WorkerLite[] = [];
  for (const w of eligible) {
    if (deletedIds.has(w.id)) deleted.push(w);
    else skipped.push({ worker: w, orderCount: 0 }); // blocked by the database guard
  }
  return { deleted, skipped };
}
