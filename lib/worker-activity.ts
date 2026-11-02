/**
 * Worker activity helpers — shared by the dashboard and /workers.
 *
 * The last order of a worker is computed over ALL orders (no date window) by the
 * `worker_last_orders` SQL function (see supabase-worker-last-order.sql), so
 * "Nunca" only appears for workers that really have no order at all.
 */

import type { createBrowserSupabaseClient } from "@/lib/supabase";

type BrowserClient = ReturnType<typeof createBrowserSupabaseClient>;

export interface WorkerActivityRow {
  id: string;
  full_name: string;
  doc_number: string;
  group_id: string;
  is_active: boolean;
}

export interface WorkerLastOrder {
  lastOrder: string; // YYYY-MM-DD
  orderCount: number;
}

const PAGE = 1000;

/** worker_id → last order date + order count. Workers without orders are absent. */
export async function fetchWorkerLastOrders(
  supabase: BrowserClient,
  groupIds: string[]
): Promise<Map<string, WorkerLastOrder>> {
  const map = new Map<string, WorkerLastOrder>();
  let from = 0;
  while (true) {
    // Stable order so pages never skip/repeat rows (one row per worker_id).
    const { data, error } = await supabase
      .rpc("worker_last_orders", { p_group_ids: groupIds })
      .order("worker_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { worker_id: string; last_order_date: string; order_count: number }[];
    for (const r of rows) {
      map.set(r.worker_id, { lastOrder: r.last_order_date, orderCount: Number(r.order_count) });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

/**
 * Workers of the given groups, paginated with a stable order.
 * Active only by default; includeInactive also returns deactivated rows (used to judge
 * a DNI's history across all of its worker rows).
 */
export async function fetchActiveWorkers(
  supabase: BrowserClient,
  groupIds: string[],
  includeInactive = false
): Promise<WorkerActivityRow[]> {
  const all: WorkerActivityRow[] = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from("workers")
      .select("id, full_name, doc_number, group_id, is_active")
      .in("group_id", groupIds);
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as WorkerActivityRow[]));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** YYYY-MM-DD of "today minus N months". */
export function cutoffDateFor(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0];
}

/** "15/03/2026" for a YYYY-MM-DD date. */
export function formatOrderDate(date: string): string {
  return new Date(date + "T12:00:00").toLocaleDateString("es-PE");
}
