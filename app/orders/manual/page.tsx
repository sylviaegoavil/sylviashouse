"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface Group { id: string; name: string; }
interface Worker { id: string; full_name: string; doc_number: string; group_id: string; }
interface Order {
  id: string;
  order_date: string;
  source: string;
  notes: string | null;
  is_additional: boolean;
  special_price: number | null;
  special_label: string | null;
  workers: { full_name: string; doc_number: string } | null;
  groups: { name: string } | null;
}

export default function ManualOrdersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [selGroup, setSelGroup] = useState("");
  const [selWorker, setSelWorker] = useState("");
  const [selDate, setSelDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isAdditional, setIsAdditional] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isSpecial, setIsSpecial] = useState(false);
  const [specialPrice, setSpecialPrice] = useState("");
  const [specialLabel, setSpecialLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const todayStr = new Date().toISOString().split("T")[0];

  const loadOrders = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("orders")
      .select(`id, order_date, source, notes, is_additional, special_price, special_label, workers(full_name, doc_number), groups(name)`)
      .eq("source", "manual")
      .eq("order_date", selDate || todayStr)
      .order("created_at", { ascending: false });
    setOrders((data || []) as unknown as Order[]);
  }, [selDate, todayStr]);

  useEffect(() => {
    async function loadBase() {
      const supabase = createBrowserSupabaseClient();
      const [{ data: grps }, { data: wrks }] = await Promise.all([
        supabase.from("groups").select("id, name").order("name"),
        supabase.from("workers").select("id, full_name, doc_number, group_id").eq("is_active", true).order("full_name"),
      ]);
      setGroups(grps || []);
      setWorkers(wrks || []);
      if (grps?.length) setSelGroup(grps[0].id);
      setLoading(false);
    }
    loadBase();
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const filteredWorkers = workers
    .filter((w) => w.group_id === selGroup)
    .filter((w) =>
      !search || w.full_name.toLowerCase().includes(search.toLowerCase()) || w.doc_number.includes(search)
    );

  async function saveOrder() {
    if (!selDate) { toast.error("Selecciona una fecha"); return; }
    if (!isAdditional && !selWorker) { toast.error("Selecciona un trabajador"); return; }
    if (!isAdditional && isSpecial) {
      const price = parseFloat(specialPrice);
      if (!specialPrice || isNaN(price) || price <= 0) { toast.error("Ingresa un precio especial válido"); return; }
    }

    setSaving(true);
    try {
      const supabase = createBrowserSupabaseClient();

      if (isAdditional) {
        const rows = Array.from({ length: quantity }, () => ({
          worker_id: null,
          group_id: selGroup,
          order_date: selDate,
          source: "manual",
          notes: notes || null,
          is_additional: true,
        }));
        const { error } = await supabase.from("orders").insert(rows);
        if (error) { toast.error(error.message); return; }
        toast.success(`${quantity} adicional${quantity !== 1 ? "es" : ""} registrado${quantity !== 1 ? "s" : ""}`);
        setQuantity(1);
      } else {
        const price = isSpecial ? parseFloat(specialPrice) : null;
        const { error } = await supabase.from("orders").insert({
          worker_id: selWorker,
          group_id: selGroup,
          order_date: selDate,
          source: "manual",
          notes: notes || null,
          is_additional: false,
          special_price: price,
          special_label: isSpecial && specialLabel.trim() ? specialLabel.trim() : null,
        });
        if (error) { toast.error(error.message); return; }
        toast.success(isSpecial ? "Pedido especial registrado" : "Pedido manual guardado");
      }

      setNotes("");
      loadOrders();
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder(id: string) {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (!error) { toast.success("Pedido eliminado"); loadOrders(); }
    else toast.error(error.message);
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Pedidos Manuales</h1>
        <p className="text-muted-foreground">Registra pedidos individuales que no llegaron por WhatsApp.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader><CardTitle className="text-base">Nuevo pedido</CardTitle></CardHeader>
          <CardContent className="space-y-4">

            {/* Adicional toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none rounded-md border px-3 py-2.5 hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={isAdditional}
                onChange={(e) => {
                  setIsAdditional(e.target.checked);
                  setSelWorker("");
                  setSearch("");
                  setQuantity(1);
                  if (e.target.checked) { setIsSpecial(false); setSpecialPrice(""); setSpecialLabel(""); }
                }}
                className="h-4 w-4 rounded border-input accent-amber-700"
              />
              <div>
                <p className="text-sm font-medium leading-none">Es un adicional</p>
                <p className="text-xs text-muted-foreground mt-0.5">Invitado o persona no registrada</p>
              </div>
            </label>

            {/* Special price toggle — only when not adicional */}
            {!isAdditional && (
              <label className="flex items-center gap-3 cursor-pointer select-none rounded-md border px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={isSpecial}
                  onChange={(e) => {
                    setIsSpecial(e.target.checked);
                    if (!e.target.checked) { setSpecialPrice(""); setSpecialLabel(""); }
                  }}
                  className="h-4 w-4 rounded border-input accent-purple-700"
                />
                <div>
                  <p className="text-sm font-medium leading-none">Precio especial</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Almuerzo / cena con precio diferente al estándar</p>
                </div>
              </label>
            )}

            {/* Special price fields */}
            {!isAdditional && isSpecial && (
              <div className="grid grid-cols-2 gap-3 rounded-md border border-purple-200 bg-purple-50/40 p-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-purple-900">Precio sin IGV (S/)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Ej: 15.00"
                    value={specialPrice}
                    onChange={(e) => setSpecialPrice(e.target.value)}
                    className="rounded-md border border-purple-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-purple-900">Etiqueta (opcional)</label>
                  <input
                    placeholder="Ej: Almuerzo ejecutivo"
                    value={specialLabel}
                    onChange={(e) => setSpecialLabel(e.target.value)}
                    className="rounded-md border border-purple-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Grupo</label>
              <select value={selGroup} onChange={(e) => { setSelGroup(e.target.value); setSelWorker(""); }}
                className="rounded-md border border-input px-3 py-2 text-sm">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            {/* Worker selector — hidden when isAdditional */}
            {!isAdditional && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">Buscar trabajador</label>
                  <input
                    placeholder="Nombre o DNI..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded-md border border-input px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">Trabajador</label>
                  <select value={selWorker} onChange={(e) => setSelWorker(e.target.value)}
                    className="rounded-md border border-input px-3 py-2 text-sm h-32">
                    <option value="">Seleccionar...</option>
                    {filteredWorkers.map((w) => (
                      <option key={w.id} value={w.id}>{w.full_name} — {w.doc_number}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Quantity — only for adicionales */}
            {isAdditional && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="rounded-md border border-input px-3 py-2 text-sm w-24"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Fecha</label>
              <input type="date" value={selDate} onChange={(e) => setSelDate(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Notas (opcional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. pedido tarde, reposición, etc."
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>

            <Button onClick={saveOrder} disabled={saving} className="w-full bg-amber-700 hover:bg-amber-800 text-white">
              <Plus className="h-4 w-4 mr-2" />
              {saving ? "Guardando..." : isAdditional ? `Registrar ${quantity} adicional${quantity !== 1 ? "es" : ""}` : isSpecial ? "Registrar pedido especial" : "Registrar pedido"}
            </Button>
          </CardContent>
        </Card>

        {/* Orders of the day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Pedidos manuales
              <Badge variant="secondary">{orders.length}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {new Date(selDate + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin pedidos manuales este día</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <div key={o.id} className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                    o.is_additional ? "border-blue-200 bg-blue-50/40" :
                    o.special_price != null ? "border-purple-200 bg-purple-50/40" : ""
                  }`}>
                    <div>
                      {o.is_additional ? (
                        <p className="text-sm font-medium text-blue-700">ADICIONAL</p>
                      ) : (
                        <p className="text-sm font-medium">{o.workers?.full_name ?? "—"}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {o.groups?.name ?? "—"}
                        {!o.is_additional && o.workers?.doc_number ? ` · ${o.workers.doc_number}` : ""}
                        {o.special_price != null && (
                          <span className="text-purple-700 font-medium">
                            {` · Especial S/${o.special_price.toFixed(2)}`}
                            {o.special_label ? ` — ${o.special_label}` : ""}
                          </span>
                        )}
                        {o.notes ? ` · ${o.notes}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0"
                      onClick={() => deleteOrder(o.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
