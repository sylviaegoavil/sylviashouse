"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Save, Upload, X, Trash2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
}

export default function MarcasPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "client_admin" || profile?.role === "super_admin";
  const isSuperAdmin = profile?.role === "super_admin";

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // New brand form
  const [newName, setNewName] = useState("");
  const [addingLogo, setAddingLogo] = useState(false);
  const [newLogoUrl, setNewLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Permanent delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/cotizaciones/brands");
    if (res.ok) setBrands(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleLogoUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    brandId?: string
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = brandId
      ? `logos/brand-${brandId}.${ext}`
      : `logos/brand-new-${Date.now()}.${ext}`;

    if (brandId) setEditSaving(true);
    else setAddingLogo(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
      if (error) { toast.error(error.message); return; }
      const { data: pub } = supabase.storage.from("assets").getPublicUrl(path);
      const url = pub.publicUrl + `?t=${Date.now()}`;

      if (brandId) {
        const res = await fetch("/api/cotizaciones/brands", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: brandId, logo_url: url }),
        });
        if (!res.ok) { toast.error((await res.json()).error); return; }
        toast.success("Logo actualizado");
        load();
      } else {
        setNewLogoUrl(url);
        toast.success("Logo listo");
      }
    } finally {
      setEditSaving(false);
      setAddingLogo(false);
      e.target.value = "";
    }
  }

  async function addBrand() {
    if (!newName.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), logo_url: newLogoUrl }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Marca creada");
      setNewName("");
      setNewLogoUrl(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) { toast.error("El nombre es requerido"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/brands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: editName.trim() }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Marca actualizada");
      setEditId(null);
      load();
    } finally {
      setEditSaving(false);
    }
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/cotizaciones/brands?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Marca desactivada"); load(); }
    else toast.error("Error al desactivar");
  }

  async function permanentDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cotizaciones/brands?id=${id}&permanent=true`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Marca eliminada permanentemente");
        setDeleteTarget(null);
        load();
      } else {
        toast.error((await res.json()).error);
      }
    } finally {
      setDeleting(false);
    }
  }

  async function reactivate(id: string) {
    const res = await fetch("/api/cotizaciones/brands", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: true }),
    });
    if (res.ok) { toast.success("Marca reactivada"); load(); }
    else toast.error("Error al reactivar");
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Marcas</h1>
        <p className="text-muted-foreground mt-1">Gestiona las marcas para el catálogo de cotizaciones.</p>
      </div>

      {/* New brand form */}
      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nueva marca</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-sm font-medium">Nombre</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBrand()}
                  placeholder="Ej. TORTAS SYLVIA"
                  className="rounded-md border border-input px-3 py-2 text-sm"
                />
              </div>
              {newLogoUrl ? (
                <div className="flex items-center gap-2">
                  <img src={newLogoUrl} alt="logo" className="h-9 w-9 object-contain border rounded" />
                  <button onClick={() => setNewLogoUrl(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-input px-3 py-2 text-sm hover:bg-muted transition-colors whitespace-nowrap">
                  <Upload className="h-4 w-4" />
                  {addingLogo ? "Subiendo..." : "Logo"}
                  <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden"
                    onChange={(e) => handleLogoUpload(e)} disabled={addingLogo} />
                </label>
              )}
              <Button onClick={addBrand} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                <Plus className="h-4 w-4 mr-1" />
                {saving ? "Guardando..." : "Agregar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Brands list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{brands.length} marca{brands.length !== 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin marcas registradas</p>
          ) : (
            <div className="space-y-2">
              {brands.map((b) => (
                <div key={b.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 ${!b.is_active ? "opacity-50" : ""}`}>
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={b.name} className="h-8 w-8 object-contain shrink-0" />
                  ) : (
                    <div className="h-8 w-8 rounded border bg-muted shrink-0" />
                  )}

                  {editId === b.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(b.id)}
                      autoFocus
                      className="flex-1 rounded border border-input px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium">{b.name}</span>
                  )}

                  <Badge variant={b.is_active ? "secondary" : "outline"} className="text-xs shrink-0">
                    {b.is_active ? "Activo" : "Inactivo"}
                  </Badge>

                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {editId === b.id ? (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-700"
                            onClick={() => saveEdit(b.id)} disabled={editSaving}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => setEditId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => { setEditId(b.id); setEditName(b.name); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <label className="inline-flex cursor-pointer rounded p-1.5 hover:bg-muted transition-colors">
                            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                            <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden"
                              onChange={(e) => handleLogoUpload(e, b.id)} disabled={editSaving} />
                          </label>
                          {b.is_active ? (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive"
                              onClick={() => deactivate(b.id)}>
                              Desactivar
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-700"
                              onClick={() => reactivate(b.id)}>
                              Activar
                            </Button>
                          )}
                          {isSuperAdmin && (
                            <Button size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              title="Eliminar permanentemente"
                              onClick={() => setDeleteTarget(b)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Permanent delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" /> Eliminar marca
            </h2>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar permanentemente la marca{" "}
              <strong>{deleteTarget.name}</strong>?{" "}
              Esta acción no se puede deshacer. Si tiene productos asociados, quedarán sin marca.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => permanentDelete(deleteTarget.id)}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
