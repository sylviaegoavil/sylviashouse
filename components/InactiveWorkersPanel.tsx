"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  fetchActiveWorkers,
  fetchWorkerLastOrders,
  cutoffDateFor,
  formatOrderDate,
  type WorkerActivityRow,
  type WorkerLastOrder,
} from "@/lib/worker-activity";
import type { Group } from "@/lib/types";

const RANGES = [3, 6, 12];

/** "Trabajadores sin actividad" — same calculation as the dashboard (lib/worker-activity.ts). */
export function InactiveWorkersPanel({ groups }: { groups: Group[] }) {
  const [groupFilter, setGroupFilter] = useState("");
  const [months, setMonths] = useState(3);
  const [workers, setWorkers] = useState<WorkerActivityRow[]>([]);
  const [lastOrders, setLastOrders] = useState<Map<string, WorkerLastOrder>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const groupKey = groups.map((g) => g.id).join(",");

  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createBrowserSupabaseClient();
        const groupIds = groups.map((g) => g.id);
        const [w, last] = await Promise.all([
          fetchActiveWorkers(supabase, groupIds),
          fetchWorkerLastOrders(supabase, groupIds),
        ]);
        if (cancelled) return;
        setWorkers(w);
        setLastOrders(last);
      } catch (e) {
        // Never show a list built from a failed calculation: everyone would read "Nunca".
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al calcular la actividad");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  const cutoff = useMemo(() => cutoffDateFor(months), [months]);

  const rows = useMemo(() => {
    return workers
      .filter((w) => !groupFilter || w.group_id === groupFilter)
      .map((w) => ({
        ...w,
        groupName: groups.find((g) => g.id === w.group_id)?.name ?? "—",
        last: lastOrders.get(w.id) ?? null,
      }))
      .filter((w) => !w.last || w.last.lastOrder < cutoff)
      .sort(
        (a, b) =>
          a.groupName.localeCompare(b.groupName) || a.full_name.localeCompare(b.full_name)
      );
  }, [workers, lastOrders, groupFilter, cutoff, groups]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            Trabajadores sin actividad
            {!loading && !error && <Badge variant="secondary">{rows.length}</Badge>}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="rounded-md border border-input px-2 py-1 text-sm bg-background"
            >
              <option value="">Todos los grupos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <span>Sin pedidos en los últimos</span>
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded-md border border-input px-2 py-1 text-sm bg-background"
            >
              {RANGES.map((n) => (
                <option key={n} value={n}>{n} meses</option>
              ))}
            </select>
          </div>
        </div>
        {!loading && !error && (
          <p className="text-sm text-muted-foreground">
            {rows.length} trabajador{rows.length !== 1 ? "es" : ""} sin actividad
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
          </div>
        ) : error ? (
          <p className="text-center text-red-600 text-sm py-8">
            No se pudo calcular la actividad: {error}. Verifica que la función
            worker_last_orders exista en Supabase (supabase-worker-last-order.sql).
          </p>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre completo</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Último pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Todos los trabajadores tienen actividad reciente
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.full_name}</TableCell>
                    <TableCell className="font-mono">{w.doc_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {w.groupName}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {w.last ? (
                        <>
                          {formatOrderDate(w.last.lastOrder)}
                          <span className="text-xs text-muted-foreground">
                            {" "}· {w.last.orderCount} pedido{w.last.orderCount !== 1 ? "s" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Nunca</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
