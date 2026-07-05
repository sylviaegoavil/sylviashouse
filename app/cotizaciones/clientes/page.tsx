"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Search, X, Pencil, Save, Trash2, Loader2 } from "lucide-react";

interface Client {
  id?: string;
  ruc: string;
  business_name: string;
  address: string | null;
  attention: string | null;
  phone: string | null;
  email: string | null;
  reference: string | null;
}

const EMPTY_FORM: Omit<Client, "id"> = {
  ruc: "", business_name: "", address: "", attention: "", phone: "", email: "", reference: "",
};

export default function ClientesPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const isSuperAdmin = profile?.role === "super_admin";

  useEffect(() => {
    if (!authLoading && profile?.role !== "super_admin" && profile?.role !== "client_admin") {
      router.replace("/dashboard");
    }
  }, [profile, authLoading, router]);

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Search
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<Client, "id">>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (q = search) => {
    setLoading(true);
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "?q=all";
      const res = await fetch(`/api/cotizaciones/clients-cache${params}`);
      if (res.ok) {
        const data = await res.json();
        setClients(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, load]);

  function setFormField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }
  function setEditField(field: keyof typeof EMPTY_FORM, value: string) {
    setEditForm(f => ({ ...f, [field]: value }));
  }

  async function handleAdd() {
    if (!form.ruc.trim() || !/^\d{11}$/.test(form.ruc.trim())) {
      toast.error("El RUC debe tener 11 dígitos numéricos"); return;
    }
    if (!form.business_name.trim()) { toast.error("La razón social es requerida"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/clients-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruc:           form.ruc.trim(),
          business_name: form.business_name.trim(),
          address:       form.address   || null,
          attention:     form.attention || null,
          phone:         form.phone     || null,
          email:         form.email     || null,
          reference:     form.reference || null,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Cliente guardado");
      setForm(EMPTY_FORM);
      setShowForm(false);
      load(search);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: Client) {
    setEditId(c.ruc);
    setEditForm({
      ruc:           c.ruc,
      business_name: c.business_name,
      address:       c.address   ?? "",
      attention:     c.attention ?? "",
      phone:         c.phone     ?? "",
      email:         c.email     ?? "",
      reference:     c.reference ?? "",
    });
  }

  async function handleEdit() {
    if (!editForm.business_name.trim()) { toast.error("La razón social es requerida"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/clients-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruc:           editForm.ruc,
          business_name: editForm.business_name.trim(),
          address:       editForm.address   || null,
          attention:     editForm.attention || null,
          phone:         editForm.phone     || null,
          email:         editForm.email     || null,
          reference:     editForm.reference || null,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Cliente actualizado");
      setEditId(null);
      load(search);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(ruc: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cotizaciones/clients-cache?ruc=${ruc}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Cliente eliminado");
      setDeleteTarget(null);
      load(search);
    } finally {
      setDeleting(false);
    }
  }

  if (authLoading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
        <p className="text-muted-foreground mt-1">Caché de clientes para autocompletado en cotizaciones.</p>
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por RUC o razón social..."
            className="w-full rounded-md border border-input pl-9 pr-3 py-2 text-sm"
          />
        </div>
        {search && (
          <Button size="sm" variant="ghost" onClick={() => setSearch("")}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button
          className="bg-amber-700 hover:bg-amber-800 text-white ml-auto"
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }}
        >
          <Plus className="h-4 w-4 mr-1" /> Agregar cliente
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Nuevo cliente
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowForm(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">RUC *</label>
                <input value={form.ruc} onChange={(e) => setFormField("ruc", e.target.value)}
                  maxLength={11} placeholder="20100047218"
                  className="rounded-md border border-input px-3 py-2 text-sm font-mono" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Razón Social *</label>
                <input value={form.business_name} onChange={(e) => setFormField("business_name", e.target.value)}
                  placeholder="Empresa S.A.C."
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium">Dirección</label>
                <input value={form.address ?? ""} onChange={(e) => setFormField("address", e.target.value)}
                  placeholder="Av. Principal 123, Lima"
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Contacto / Atención</label>
                <input value={form.attention ?? ""} onChange={(e) => setFormField("attention", e.target.value)}
                  placeholder="Juan Pérez"
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Teléfono</label>
                <input value={form.phone ?? ""} onChange={(e) => setFormField("phone", e.target.value)}
                  placeholder="987654321"
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Email</label>
                <input value={form.email ?? ""} onChange={(e) => setFormField("email", e.target.value)}
                  type="email" placeholder="contacto@empresa.com"
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Referencia habitual</label>
                <input value={form.reference ?? ""} onChange={(e) => setFormField("reference", e.target.value)}
                  placeholder="Evento, proyecto..."
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleAdd} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clients table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Cargando..." : `${clients.length} cliente${clients.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clients.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {search ? "Sin resultados para la búsqueda" : "Sin clientes registrados"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium w-28">RUC</th>
                    <th className="text-left py-2 font-medium">Razón Social</th>
                    <th className="text-left py-2 font-medium">Dirección</th>
                    <th className="text-left py-2 font-medium w-32">Atención</th>
                    <th className="text-left py-2 font-medium w-28">Teléfono</th>
                    <th className="text-left py-2 font-medium w-40">Email</th>
                    <th className="text-right py-2 font-medium w-20">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.ruc} className="border-b last:border-0 hover:bg-muted/30 align-top">
                      {editId === c.ruc ? (
                        // ── Inline edit row ────────────────────────────────
                        <>
                          <td className="py-1.5 pr-1 font-mono text-xs">{c.ruc}</td>
                          <td className="py-1.5 pr-1">
                            <input value={editForm.business_name}
                              onChange={(e) => setEditField("business_name", e.target.value)}
                              className="w-full rounded border border-input px-2 py-1 text-xs" />
                          </td>
                          <td className="py-1.5 pr-1">
                            <input value={editForm.address ?? ""}
                              onChange={(e) => setEditField("address", e.target.value)}
                              className="w-full rounded border border-input px-2 py-1 text-xs" />
                          </td>
                          <td className="py-1.5 pr-1">
                            <input value={editForm.attention ?? ""}
                              onChange={(e) => setEditField("attention", e.target.value)}
                              className="w-full rounded border border-input px-2 py-1 text-xs" />
                          </td>
                          <td className="py-1.5 pr-1">
                            <input value={editForm.phone ?? ""}
                              onChange={(e) => setEditField("phone", e.target.value)}
                              className="w-full rounded border border-input px-2 py-1 text-xs" />
                          </td>
                          <td className="py-1.5 pr-1">
                            <input value={editForm.email ?? ""}
                              onChange={(e) => setEditField("email", e.target.value)}
                              className="w-full rounded border border-input px-2 py-1 text-xs" />
                          </td>
                          <td className="py-1.5 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-700"
                                onClick={handleEdit} disabled={editSaving}>
                                {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => setEditId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // ── Read row ───────────────────────────────────────
                        <>
                          <td className="py-2 font-mono text-xs">{c.ruc}</td>
                          <td className="py-2 font-medium max-w-[200px]">{c.business_name}</td>
                          <td className="py-2 text-muted-foreground text-xs max-w-[180px]">{c.address ?? "—"}</td>
                          <td className="py-2 text-muted-foreground text-xs">{c.attention ?? "—"}</td>
                          <td className="py-2 text-muted-foreground text-xs">{c.phone ?? "—"}</td>
                          <td className="py-2 text-muted-foreground text-xs">{c.email ?? "—"}</td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                title="Editar" onClick={() => startEdit(c)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {isSuperAdmin && (
                                <Button size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                  title="Eliminar" onClick={() => setDeleteTarget(c)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" /> Eliminar cliente
            </h2>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar a <strong>{deleteTarget.business_name}</strong> ({deleteTarget.ruc}) del caché?
              No afecta las cotizaciones existentes.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDelete(deleteTarget.ruc)} disabled={deleting}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
