"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { AttendanceGrid } from "@/components/AttendanceGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
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

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
        // Transform into ManualProductRow[]
        const entriesMap = new Map<string, Record<string, Array<{ qty: number; notes: string | null }>>>();
        for (const mp of mpData) {
          const name: string = mp.manual_product_types?.name ?? "Desconocido";
          const day = String(parseInt(mp.product_date.split("-")[2], 10));
          if (!entriesMap.has(name)) entriesMap.set(name, {});
          const dayEntries = entriesMap.get(name)!;
          if (!dayEntries[day]) dayEntries[day] = [];
          dayEntries[day].push({ qty: mp.quantity, notes: mp.notes ?? null });
        }
        setManualProducts(
          Array.from(entriesMap.entries()).map(([productName, dailyEntries]) => ({
            productName,
            dailyEntries,
          }))
        );
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

  async function handleDeleteMonth() {
    const [year, monthNum] = month.split("-").map(Number);
    setDeleting(true);
    try {
      const res = await fetch("/api/orders/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, year, month: monthNum }),
      });
      if (!res.ok) {
        toast.error((await res.json()).error ?? "Error al borrar pedidos");
        return;
      }
      const { deleted } = await res.json();
      toast.success(`Se eliminaron ${deleted} pedidos de ${group?.name} — ${MONTHS_ES[monthNum]} ${year}`);
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
            extraHeaderActions={
              isSuperAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 h-8"
                  onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Borrar mes
                </Button>
              ) : undefined
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
                  ¿Estás seguro de borrar <strong>TODOS</strong> los pedidos de{" "}
                  <strong>{group.name}</strong> del mes <strong>{label}</strong>?
                </p>
                <p className="text-sm text-muted-foreground">
                  Se eliminarán <strong>{orders.length} pedidos</strong>. Esta acción no se puede deshacer.
                </p>
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
                    disabled={deleteConfirmText !== "BORRAR" || deleting}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? "Borrando..." : "Borrar pedidos"}
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
