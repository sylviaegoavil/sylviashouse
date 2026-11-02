"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/components/AuthProvider";
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

type Dialog = "delete" | "deactivate" | null;

/**
 * "Trabajadores sin actividad" — same calculation as the dashboard (lib/worker-activity.ts).
 * super_admin can select workers and deactivate / delete them in bulk. The UI is only a guide:
 * /api/workers/bulk re-verifies every DNI before deleting anything.
 */
export function InactiveWorkersPanel({ groups }: { groups: Group[] }) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";

  const [groupFilter, setGroupFilter] = useState("");
  const [months, setMonths] = useState(3);
  const [workers, setWorkers] = useState<WorkerActivityRow[]>([]);
  const [lastOrders, setLastOrders] = useState<Map<string, WorkerLastOrder>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const groupKey = groups.map((g) => g.id).join(",");

  const load = useCallback(async () => {
    if (groups.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const groupIds = groups.map((g) => g.id);
      // Inactive rows are loaded too, only to judge each DNI's history across all its rows.
      const [w, last] = await Promise.all([
        fetchActiveWorkers(supabase, groupIds, true),
        fetchWorkerLastOrders(supabase, groupIds),
      ]);
      setWorkers(w);
      setLastOrders(last);
    } catch (e) {
      // Never show a list built from a failed calculation: everyone would read "Nunca".
      setError(e instanceof Error ? e.message : "Error al calcular la actividad");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  useEffect(() => {
    load();
  }, [load]);

  const cutoff = useMemo(() => cutoffDateFor(months), [months]);

  // Orders per DNI across every worker row (any group, active or not) known to the panel
  const dniTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const w of workers) {
      totals.set(w.doc_number, (totals.get(w.doc_number) ?? 0) + (lastOrders.get(w.id)?.orderCount ?? 0));
    }
    return totals;
  }, [workers, lastOrders]);

  const rows = useMemo(() => {
    return workers
      .filter((w) => w.is_active && (!groupFilter || w.group_id === groupFilter))
      .map((w) => {
        const last = lastOrders.get(w.id) ?? null;
        const own = last?.orderCount ?? 0;
        const dniTotal = dniTotals.get(w.doc_number) ?? own;
        return {
          ...w,
          groupName: groups.find((g) => g.id === w.group_id)?.name ?? "—",
          last,
          dniTotal,
          otherCount: Math.max(dniTotal - own, 0),
          hasHistory: dniTotal > 0,
        };
      })
      .filter((w) => !w.last || w.last.lastOrder < cutoff)
      .sort(
        (a, b) =>
          a.groupName.localeCompare(b.groupName) || a.full_name.localeCompare(b.full_name)
      );
  }, [workers, lastOrders, dniTotals, groupFilter, cutoff, groups]);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const deletable = selectedRows.filter((r) => !r.hasHistory);
  const blocked = selectedRows.filter((r) => r.hasHistory);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function closeDialog() {
    setDialog(null);
    setConfirmText("");
  }

  async function runBulk(action: "delete" | "deactivate", ids: string[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/workers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error en la acción masiva");
        return;
      }
      if (action === "delete") {
        const skipped = (data.skipped ?? []) as unknown[];
        toast.success(
          `${(data.deleted ?? []).length} eliminados` +
            (skipped.length > 0 ? ` · ${skipped.length} omitidos por tener historial` : "")
        );
      } else {
        toast.success(`${(data.updated ?? []).length} desactivados`);
      }
      setSelected(new Set());
      closeDialog();
      await load();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setBusy(false);
    }
  }

  const colSpan = isSuperAdmin ? 5 : 4;

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
        {isSuperAdmin && !loading && !error && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={selectedRows.length === 0}
              onClick={() => setDialog("deactivate")}
            >
              <UserX className="h-4 w-4 mr-1.5" />
              Desactivar seleccionados ({selectedRows.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={selectedRows.length === 0}
              onClick={() => setDialog("delete")}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Eliminar seleccionados ({selectedRows.length})
            </Button>
          </div>
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
                  {isSuperAdmin && (
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Nombre completo</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Último pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                      Todos los trabajadores tienen actividad reciente
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((w) => (
                  <TableRow key={w.id}>
                    {isSuperAdmin && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${w.full_name}`}
                          checked={selected.has(w.id)}
                          onChange={() => toggle(w.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{w.full_name}</TableCell>
                    <TableCell className="font-mono">{w.doc_number}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {w.groupName}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="whitespace-nowrap">
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
                      </div>
                      {w.hasHistory && (
                        <div className="mt-0.5">
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                            Tiene historial - solo desactivar
                          </Badge>
                          {w.otherCount > 0 && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {w.last ? "" : "0 pedidos aquí · "}{w.otherCount} en otro grupo
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Deactivate confirmation (reversible: no typed confirmation) */}
      {dialog === "deactivate" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <UserX className="h-4 w-4" /> Desactivar trabajadores
            </h2>
            <p className="text-sm">
              Se desactivarán <strong>{selectedRows.length}</strong> trabajador
              {selectedRows.length !== 1 ? "es" : ""}. Conservan su historial y se pueden reactivar.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeDialog} disabled={busy}>
                Cancelar
              </Button>
              <Button
                onClick={() => runBulk("deactivate", selectedRows.map((r) => r.id))}
                disabled={busy || selectedRows.length === 0}
              >
                {busy ? "Desactivando..." : "Desactivar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {dialog === "delete" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" /> Eliminar trabajadores
            </h2>
            {deletable.length > 0 ? (
              <p className="text-sm">
                Se eliminarán <strong>{deletable.length}</strong> trabajador
                {deletable.length !== 1 ? "es" : ""} sin ningún pedido registrado en ningún grupo.
                No se puede deshacer.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ninguno de los seleccionados se puede eliminar.
              </p>
            )}
            {blocked.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                <p>
                  <strong>{blocked.length}</strong> tiene{blocked.length !== 1 ? "n" : ""} historial de
                  pedidos y <strong>NO se eliminará{blocked.length !== 1 ? "n" : ""}</strong>:
                </p>
                <ul className="max-h-24 overflow-auto text-xs text-muted-foreground list-disc pl-4">
                  {blocked.map((b) => (
                    <li key={b.id}>
                      {b.full_name} ({b.doc_number}) · {b.dniTotal} pedido{b.dniTotal !== 1 ? "s" : ""}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => runBulk("deactivate", blocked.map((b) => b.id))}
                >
                  Desactivar esos {blocked.length} en su lugar
                </Button>
              </div>
            )}
            {deletable.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Escribe <span className="font-mono font-bold text-red-600">BORRAR</span> para confirmar
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full rounded-md border border-input px-3 py-2 text-sm"
                  placeholder="BORRAR"
                  autoFocus
                />
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeDialog} disabled={busy}>
                Cancelar
              </Button>
              {deletable.length > 0 && (
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={confirmText !== "BORRAR" || busy}
                  onClick={() => runBulk("delete", selectedRows.map((r) => r.id))}
                >
                  {busy ? "Eliminando..." : `Eliminar ${deletable.length}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
