"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { AttendanceGrid } from "@/components/AttendanceGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { Group, Worker, Order } from "@/lib/types";
import type { ManualProductRow } from "@/components/AttendanceGrid";
import { useAuth } from "@/components/AuthProvider";

const MONTHS_ES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === "super_admin";

  const [group, setGroup] = useState<Group | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [manualProducts, setManualProducts] = useState<ManualProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Default to current month
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);

  // Delete month modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"txt" | "all">("txt");
  const [deletePreview, setDeletePreview] = useState<{
    txtOrders: number;
    txtAdicionales: number;
    manualOrders: number;
    manualAdicionales: number;
    manualProducts: number;
  } | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);

  // Delete day modal state
  const [deleteDayTarget, setDeleteDayTarget] = useState<{ day: number; count: number; dateStr: string } | null>(null);
  const [deletingDay, setDeletingDay] = useState(false);

  // Delete single order modal state
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<{ id: string; workerName: string; dateStr: string } | null>(null);
  const [deletingOrder, setDeletingOrder] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // No-order days
  const [noOrderDays, setNoOrderDays] = useState<Set<number>>(new Set());
  const [confirmNoOrderDay, setConfirmNoOrderDay] = useState<number | null>(null);
  const canMarkNoOrder = profile?.role === "super_admin" || profile?.role === "client_admin";

  // Load group + workers (once per groupId)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupsRes, workersRes] = await Promise.all([
        fetch("/api/groups"),
        fetch(`/api/workers?groupId=${groupId}`),
      ]);

      const groupsData = await groupsRes.json();
      if (Array.isArray(groupsData)) {
        const found = groupsData.find((g: Group) => g.id === groupId);
        if (found) setGroup(found);
      }

      const workersData = await workersRes.json();
      if (Array.isArray(workersData)) setWorkers(workersData);
    } catch {
      toast.error("Error al cargar datos del grupo");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  // Load orders + manual products + no-order days whenever group or month changes
  const loadOrders = useCallback(async () => {
    try {
      const [ordersRes, mpRes, nodRes] = await Promise.all([
        fetch(`/api/orders?groupId=${groupId}&month=${month}`),
        fetch(`/api/manual-products?groupId=${groupId}&month=${month}`),
        fetch(`/api/no-order-days?groupId=${groupId}&month=${month}`),
      ]);

      if (nodRes.ok) {
        const dates: string[] = await nodRes.json();
        setNoOrderDays(new Set(dates.map((d) => parseInt(d.split("-")[2], 10))));
      }

      const ordersData = await ordersRes.json();
      if (Array.isArray(ordersData)) setOrders(ordersData as unknown as Order[]);

      const mpData = await mpRes.json();
      if (Array.isArray(mpData)) {
        // Group by product name so records from old/deactivated types with the
        // same name merge into a single row instead of showing duplicates.
        const entriesMap = new Map<string, Record<string, Array<{ qty: number; notes: string | null }>>>();
        for (const mp of mpData) {
          const name: string = mp.manual_product_types?.name ?? "Desconocido";
          const day = String(parseInt(mp.product_date.split("-")[2], 10));
          if (!entriesMap.has(name)) entriesMap.set(name, {});
          const daily = entriesMap.get(name)!;
          if (!daily[day]) daily[day] = [];
          daily[day].push({ qty: mp.quantity, notes: mp.notes ?? null });
        }
        const rows = Array.from(entriesMap.entries()).map(([name, daily]) => ({
          productName: name,
          dailyEntries: daily,
        }));
        setManualProducts(rows);
      }
    } catch {
      toast.error("Error al cargar pedidos");
    }
  }, [groupId, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function handleToggleNoOrderDay(day: number) {
    const [year, monthNum] = month.split("-").map(Number);
    const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (noOrderDays.has(day)) {
      // Unmark directly — no confirmation needed
      const res = await fetch("/api/no-order-days", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, date: dateStr }),
      });
      if (res.ok) {
        setNoOrderDays((prev) => { const next = new Set(prev); next.delete(day); return next; });
        toast.success(`Día ${day} desmarcado`);
      } else {
        toast.error((await res.json()).error ?? "Error al desmarcar");
      }
    } else {
      // Show confirmation modal
      setConfirmNoOrderDay(day);
    }
  }

  async function handleConfirmNoOrderDay() {
    if (confirmNoOrderDay === null) return;
    const [year, monthNum] = month.split("-").map(Number);
    const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(confirmNoOrderDay).padStart(2, "0")}`;
    const res = await fetch("/api/no-order-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, date: dateStr }),
    });
    if (res.ok) {
      setNoOrderDays((prev) => new Set([...prev, confirmNoOrderDay]));
      toast.success(`Día ${confirmNoOrderDay} marcado como sin pedidos`);
    } else {
      toast.error((await res.json()).error ?? "Error al marcar");
    }
    setConfirmNoOrderDay(null);
  }

  async function handleDeleteDay() {
    if (!deleteDayTarget) return;
    setDeletingDay(true);
    try {
      const res = await fetch("/api/orders/day", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, date: deleteDayTarget.dateStr }),
      });
      if (!res.ok) {
        toast.error((await res.json()).error ?? "Error al borrar pedidos del día");
        return;
      }
      const { deleted } = await res.json();
      toast.success(`Se eliminaron ${deleted} pedidos del día ${deleteDayTarget.day}`);
      setDeleteDayTarget(null);
      loadOrders();
    } finally {
      setDeletingDay(false);
    }
  }

  async function handleDeleteOrder() {
    if (!deleteOrderTarget) return;
    setDeletingOrder(true);
    try {
      const res = await fetch(`/api/orders/${deleteOrderTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error((await res.json()).error ?? "Error al eliminar pedido");
        return;
      }
      toast.success(`Pedido de ${deleteOrderTarget.workerName} eliminado`);
      setDeleteOrderTarget(null);
      loadOrders();
    } finally {
      setDeletingOrder(false);
    }
  }

  async function openDeleteModal() {
    const [year, monthNum] = month.split("-").map(Number);
    setShowDeleteModal(true);
    setDeleteConfirmText("");
    setDeleteMode("txt");
    setDeletePreview(null);
    setDeletePreviewLoading(true);
    try {
      const res = await fetch(`/api/orders/bulk?groupId=${groupId}&year=${year}&month=${monthNum}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al calcular los registros a borrar");
        setShowDeleteModal(false);
        return;
      }
      setDeletePreview(data);
    } catch {
      toast.error("Error de conexión al calcular los registros a borrar");
      setShowDeleteModal(false);
    } finally {
      setDeletePreviewLoading(false);
    }
  }

  async function handleDeleteMonth() {
    const [year, monthNum] = month.split("-").map(Number);
    setDeleting(true);
    try {
      const res = await fetch("/api/orders/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, year, month: monthNum, mode: deleteMode }),
      });
      if (!res.ok) {
        toast.error((await res.json()).error ?? "Error al borrar pedidos");
        return;
      }
      const { deletedOrders, deletedManualProducts } = await res.json();
      toast.success(
        deleteMode === "txt"
          ? `Se eliminaron ${deletedOrders} registros del TXT de ${group?.name} — ${MONTHS_ES[monthNum]} ${year}`
          : `Se eliminaron ${deletedOrders} pedidos y ${deletedManualProducts} productos manuales de ${group?.name} — ${MONTHS_ES[monthNum]} ${year}`
      );
      setShowDeleteModal(false);
      setDeleteConfirmText("");
      loadOrders();
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Grupo no encontrado
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
        <p className="text-muted-foreground mt-1">
          Excel: {group.excel_group} / Pestana: {group.excel_tab}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grilla de Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceGrid
            group={group}
            workers={workers}
            orders={orders}
            adicionales={{}}
            manualProducts={manualProducts}
            month={month}
            onMonthChange={setMonth}
            noOrderDays={noOrderDays}
            canMarkNoOrder={canMarkNoOrder}
            onToggleNoOrderDay={handleToggleNoOrderDay}
            isSuperAdmin={isSuperAdmin}
            onDeleteDay={(day, count, dateStr) => setDeleteDayTarget({ day, count, dateStr })}
            onDeleteOrder={(id, workerName, dateStr) => setDeleteOrderTarget({ id, workerName, dateStr })}
            extraHeaderActions={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  title="Actualizar datos"
                  onClick={async () => {
                    setRefreshing(true);
                    await loadOrders();
                    setRefreshing(false);
                  }}
                  disabled={refreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 h-8"
                    onClick={openDeleteModal}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Borrar mes
                  </Button>
                )}
              </div>
            }
          />
        </CardContent>
      </Card>

      {/* Delete confirmation modal */}
      {showDeleteModal && (() => {
        const [year, monthNum] = month.split("-").map(Number);
        const label = `${MONTHS_ES[monthNum]} ${year}`;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle className="text-base text-red-700 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Borrar pedidos del mes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  <strong>{group.name}</strong> — <strong>{label}</strong>
                </p>
                {deletePreviewLoading || !deletePreview ? (
                  <p className="text-sm text-muted-foreground">Calculando registros…</p>
                ) : (() => {
                  const p = deletePreview;
                  const txtTotal = p.txtOrders + p.txtAdicionales;
                  const allOrders = txtTotal + p.manualOrders + p.manualAdicionales;
                  return (
                    <>
                      <div className="space-y-2">
                        <label className={`flex gap-2 rounded-md border p-3 text-sm cursor-pointer ${deleteMode === "txt" ? "border-red-300 bg-red-50/50" : "border-input"}`}>
                          <input
                            type="radio"
                            name="deleteMode"
                            checked={deleteMode === "txt"}
                            onChange={() => setDeleteMode("txt")}
                            className="mt-1"
                          />
                          <span>
                            <strong>Borrar solo lo del TXT (WhatsApp)</strong>
                            <span className="block text-xs text-muted-foreground">
                              Pedidos y adicionales que vinieron del TXT. Conserva lo ingresado a mano.
                            </span>
                          </span>
                        </label>
                        <label className={`flex gap-2 rounded-md border p-3 text-sm cursor-pointer ${deleteMode === "all" ? "border-red-300 bg-red-50/50" : "border-input"}`}>
                          <input
                            type="radio"
                            name="deleteMode"
                            checked={deleteMode === "all"}
                            onChange={() => setDeleteMode("all")}
                            className="mt-1"
                          />
                          <span>
                            <strong>Borrar todo el mes</strong>
                            <span className="block text-xs text-muted-foreground">
                              Pedidos TXT, pedidos y adicionales manuales y productos manuales.
                            </span>
                          </span>
                        </label>
                      </div>
                      {deleteMode === "txt" ? (
                        <p className="text-sm text-muted-foreground">
                          Se borrarán <strong>{txtTotal} registros del TXT</strong> ({p.txtOrders} pedidos + {p.txtAdicionales} adicionales).
                          Se conservarán: {p.manualOrders} pedidos manuales, {p.manualAdicionales} adicionales manuales y los productos manuales ({p.manualProducts} registros).
                        </p>
                      ) : (
                        <p className="text-sm text-red-700">
                          Se borrarán <strong>{allOrders} pedidos</strong> ({txtTotal} del TXT + {p.manualOrders + p.manualAdicionales} manuales)
                          y <strong>{p.manualProducts} registros de productos manuales</strong>. No se conserva nada del mes.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
                    </>
                  );
                })()}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Escribe <span className="font-mono font-bold text-red-600">BORRAR</span> para confirmar
                  </label>
                  <input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                    placeholder="BORRAR"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={handleDeleteMonth}
                    disabled={deleteConfirmText !== "BORRAR" || deleting || !deletePreview}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? "Borrando..." : deleteMode === "txt" ? "Borrar lo del TXT" : "Borrar todo el mes"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); }}
                    disabled={deleting}
                  >
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Delete day modal */}
      {deleteDayTarget && (() => {
        const [year, monthNum] = month.split("-").map(Number);
        const label = `${deleteDayTarget.day} de ${MONTHS_ES[monthNum]} ${year}`;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-sm">
              <CardHeader>
                <CardTitle className="text-base text-red-700 flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Borrar pedidos del día
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  ¿Borrar todos los pedidos de <strong>{group?.name}</strong> del día <strong>{label}</strong>?
                  Se eliminarán <strong>{deleteDayTarget.count} pedidos</strong>. Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleDeleteDay}
                    disabled={deletingDay}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deletingDay ? "Borrando..." : "Borrar pedidos"}
                  </Button>
                  <Button variant="outline" onClick={() => setDeleteDayTarget(null)} disabled={deletingDay}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Delete single order modal */}
      {deleteOrderTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base text-red-700 flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Eliminar pedido
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                ¿Eliminar el pedido de <strong>{deleteOrderTarget.workerName}</strong> del día{" "}
                <strong>{parseInt(deleteOrderTarget.dateStr.split("-")[2], 10)}</strong>?
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleDeleteOrder}
                  disabled={deletingOrder}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deletingOrder ? "Eliminando..." : "Eliminar"}
                </Button>
                <Button variant="outline" onClick={() => setDeleteOrderTarget(null)} disabled={deletingOrder}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No-order day confirmation modal */}
      {confirmNoOrderDay !== null && (() => {
        const [year, monthNum] = month.split("-").map(Number);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-sm">
              <CardHeader>
                <CardTitle className="text-base">Confirmar día sin pedidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  ¿Confirmar que el <strong>día {confirmNoOrderDay}</strong> no tuvo pedidos para{" "}
                  <strong>{group.name}</strong>?
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleConfirmNoOrderDay} className="bg-amber-700 hover:bg-amber-800 text-white">
                    Confirmar
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmNoOrderDay(null)}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
