"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Save, X, Building2 } from "lucide-react";

interface Client {
  id: string;
  name: string;
  ruc: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ClientsAdminPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRuc, setEditRuc] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRuc, setNewRuc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role !== "super_admin") {
      router.replace("/dashboard");
    }
  }, [profile, loading, router]);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/admin/clients");
    if (res.ok) setClients(await res.json());
    setFetching(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  async function saveClient(id?: string) {
    setSaving(true);
    try {
      const body = id
        ? { id, name: editName, ruc: editRuc, is_active: true }
        : { name: newName, ruc: newRuc };
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success(id ? "Cliente actualizado" : "Cliente creado");
      setEditingId(null);
      setShowAdd(false);
      setNewName(""); setNewRuc("");
      loadClients();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(client: Client) {
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: client.id, name: client.name, ruc: client.ruc, is_active: !client.is_active }),
    });
    if (res.ok) { toast.success(client.is_active ? "Desactivado" : "Activado"); loadClients(); }
    else toast.error("Error al actualizar");
  }

  if (loading || fetching) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;
  if (profile?.role !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Clientes</h1>
          <p className="text-muted-foreground">Empresas cliente del sistema.</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="bg-amber-700 hover:bg-amber-800 text-white">
          <Plus className="h-4 w-4 mr-2" /> Nuevo cliente
        </Button>
      </div>

      {showAdd && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Nuevo cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Nombre *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="EMPRESA ABC" className="rounded border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">RUC (opcional)</label>
                <input value={newRuc} onChange={(e) => setNewRuc(e.target.value)}
                  placeholder="20XXXXXXXXX" className="rounded border border-input px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveClient()} disabled={!newName || saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                {saving ? "Guardando..." : "Crear"}
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin clientes</p>
          ) : (
            <div className="divide-y">
              {clients.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  {editingId === c.id ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded border border-input px-2 py-1 text-sm" />
                      <input value={editRuc} onChange={(e) => setEditRuc(e.target.value)}
                        placeholder="RUC" className="w-32 rounded border border-input px-2 py-1 text-sm" />
                      <Button size="sm" onClick={() => saveClient(c.id)} disabled={saving} className="h-7 w-7 p-0">
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 w-7 p-0">
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{c.name}</p>
                        {c.ruc && <p className="text-xs text-muted-foreground">RUC: {c.ruc}</p>}
                      </div>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => { setEditingId(c.id); setEditName(c.name); setEditRuc(c.ruc ?? ""); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => toggleActive(c)}>
                        {c.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
