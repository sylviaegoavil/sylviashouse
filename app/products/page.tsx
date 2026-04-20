"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createBrowserSupabaseClient } from "@/lib/supabase";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTHS = [
  { value: 1, label: "Enero" }, { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" }, { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" }, { value: 6, label: "Junio" },
  { value: 7, label: "Julio" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" }, { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" }, { value: 12, label: "Diciembre" },
];

interface ProductType { id: string; name: string; unit_price: number; is_active: boolean; }
interface Group { id: string; name: string; excel_group: string; }
interface ManualProduct {
  id: string;
  product_date: string;
  quantity: number;
  notes: string | null;
  group_id: string;
  manual_product_types: { id: string; name: string; unit_price: number };
  groups: { name: string };
}

export default function ProductsPage() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [products, setProducts] = useState<ManualProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formProductType, setFormProductType] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formQty, setFormQty] = useState(1);
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Table filters (client-side)
  const [filterDay, setFilterDay] = useState("");        // "YYYY-MM-DD" or ""
  const [filterProduct, setFilterProduct] = useState(""); // product type name or ""
  const [filterGroup, setFilterGroup] = useState("");     // group name or ""

  // Inline row editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPT, setEditPT] = useState("");
  const [editGrp, setEditGrp] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editQty, setEditQty] = useState(1);
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  function startEdit(p: ManualProduct) {
    setEditingId(p.id);
    setEditPT(p.manual_product_types.id);
    setEditGrp(p.group_id);
    setEditDate(p.product_date);
    setEditQty(p.quantity);
    setEditNotes(p.notes ?? "");
  }

  async function updateProduct() {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/manual-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          productTypeId: editPT,
          groupId: editGrp,
          productDate: editDate,
          quantity: editQty,
          notes: editNotes || null,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Actualizado");
      setEditingId(null);
      await loadProducts();
    } finally {
      setEditSaving(false);
    }
  }

  // Type management
  const [editType, setEditType] = useState<ProductType | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editTypePrice, setEditTypePrice] = useState(0);
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePrice, setNewTypePrice] = useState(0);

  const monthParam = `${year}-${String(month).padStart(2, "0")}`;

  const loadProducts = useCallback(async () => {
    const res = await fetch(`/api/manual-products?month=${monthParam}`);
    if (res.ok) setProducts(await res.json());
  }, [monthParam]);

  useEffect(() => {
    async function loadBase() {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const [{ data: pts }, { data: grps }] = await Promise.all([
        supabase.from("manual_product_types").select("*").eq("is_active", true).order("name"),
        supabase.from("groups").select("id, name, excel_group").order("name"),
      ]);
      setProductTypes(pts || []);
      setGroups(grps || []);
      if (pts?.length) setFormProductType(pts[0].id);
      if (grps?.length) setFormGroup(grps[0].id);
      setLoading(false);
    }
    loadBase();
  }, []);

  useEffect(() => { loadProducts(); setFilterDay(""); }, [loadProducts]);

  async function saveProduct() {
    if (!formProductType || !formGroup || !formDate || formQty < 1) {
      toast.error("Completa todos los campos");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/manual-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTypeId: formProductType,
          groupId: formGroup,
          productDate: formDate,
          quantity: formQty,
          notes: formNotes || null,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Producto guardado");
      setFormNotes("");
      await loadProducts();
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    const res = await fetch(`/api/manual-products?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Eliminado"); await loadProducts(); }
    else toast.error("Error al eliminar");
  }

  async function saveType() {
    if (!editType) return;
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("manual_product_types")
      .update({ name: editTypeName, unit_price: editTypePrice })
      .eq("id", editType.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tipo actualizado");
    setEditType(null);
    const { data } = await supabase.from("manual_product_types").select("*").eq("is_active", true).order("name");
    setProductTypes(data || []);
  }

  async function addType() {
    if (!newTypeName || newTypePrice <= 0) { toast.error("Completa nombre y precio"); return; }
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("manual_product_types").insert({ name: newTypeName.toUpperCase(), unit_price: newTypePrice });
    if (error) { toast.error(error.message); return; }
    toast.success("Tipo agregado");
    setNewTypeName(""); setNewTypePrice(0); setShowAddType(false);
    const { data } = await supabase.from("manual_product_types").select("*").eq("is_active", true).order("name");
    setProductTypes(data || []);
  }

  async function deactivateType(id: string) {
    const supabase = createBrowserSupabaseClient();
    await supabase.from("manual_product_types").update({ is_active: false }).eq("id", id);
    setProductTypes((prev) => prev.filter((p) => p.id !== id));
    toast.success("Tipo desactivado");
  }

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filterDay && p.product_date !== filterDay) return false;
      if (filterProduct && p.manual_product_types.name !== filterProduct) return false;
      if (filterGroup && p.groups?.name !== filterGroup) return false;
      return true;
    });
  }, [products, filterDay, filterProduct, filterGroup]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Productos Manuales</h1>
        <p className="text-muted-foreground">Registra café, tortas, gaseosas y otros productos por día y grupo.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Register form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar producto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Tipo de producto</label>
              <select
                value={formProductType}
                onChange={(e) => setFormProductType(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {productTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.name} — S/.{pt.unit_price}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Grupo</label>
              <select
                value={formGroup}
                onChange={(e) => setFormGroup(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Fecha</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Cantidad</label>
                <input
                  type="number"
                  min={1}
                  value={formQty}
                  onChange={(e) => setFormQty(Number(e.target.value))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Comentario (opcional)</label>
              <input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Ej. reposición, evento especial, etc."
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={saveProduct} disabled={saving} className="w-full bg-amber-700 hover:bg-amber-800 text-white">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </CardContent>
        </Card>

        {/* Product types management */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tipos de productos</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAddType(!showAddType)}>
              <Plus className="h-4 w-4 mr-1" /> Agregar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {showAddType && (
              <div className="rounded-md border p-3 bg-muted/30 space-y-2 mb-3">
                <input
                  placeholder="Nombre (ej. TORTA CHICA)"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full rounded border border-input px-3 py-1.5 text-sm"
                />
                <input
                  type="number"
                  placeholder="Precio unitario"
                  value={newTypePrice || ""}
                  onChange={(e) => setNewTypePrice(Number(e.target.value))}
                  className="w-full rounded border border-input px-3 py-1.5 text-sm"
                />
                <Button size="sm" onClick={addType} className="bg-amber-700 hover:bg-amber-800 text-white">Agregar</Button>
              </div>
            )}
            {productTypes.map((pt) => (
              <div key={pt.id} className="flex items-center gap-2">
                {editType?.id === pt.id ? (
                  <>
                    <input
                      value={editTypeName}
                      onChange={(e) => setEditTypeName(e.target.value)}
                      className="flex-1 rounded border border-input px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      value={editTypePrice}
                      onChange={(e) => setEditTypePrice(Number(e.target.value))}
                      className="w-20 rounded border border-input px-2 py-1 text-sm"
                    />
                    <Button size="sm" onClick={saveType}><Save className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditType(null)}>✕</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{pt.name}</span>
                    <Badge variant="outline" className="text-xs">S/.{pt.unit_price}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => { setEditType(pt); setEditTypeName(pt.name); setEditTypePrice(pt.unit_price); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deactivateType(pt.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Month products table */}
      <Card className="mt-8">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Registros del mes</CardTitle>
            {(filterDay || filterProduct || filterGroup) && (
              <button
                onClick={() => { setFilterDay(""); setFilterProduct(""); setFilterGroup(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Month & year */}
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded border border-input px-2 py-1.5 text-sm"
            >
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded border border-input px-2 py-1.5 text-sm"
            >
              {Array.from({ length: 10 }, (_, i) => 2026 + i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {/* Day filter */}
            <input
              type="date"
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              min={`${year}-${String(month).padStart(2, "0")}-01`}
              max={`${year}-${String(month).padStart(2, "0")}-31`}
              title="Filtrar por día"
              className="rounded border border-input px-2 py-1.5 text-sm"
            />
            {/* Product filter */}
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="rounded border border-input px-2 py-1.5 text-sm"
            >
              <option value="">Todos los productos</option>
              {productTypes.map((pt) => (
                <option key={pt.id} value={pt.name}>{pt.name}</option>
              ))}
            </select>
            {/* Group filter */}
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="rounded border border-input px-2 py-1.5 text-sm"
            >
              <option value="">Todos los grupos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {products.length === 0 ? "Sin registros para este mes" : "Sin registros con los filtros aplicados"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Fecha</th>
                    <th className="text-left py-2 font-medium">Producto</th>
                    <th className="text-left py-2 font-medium">Grupo</th>
                    <th className="text-right py-2 font-medium">Cantidad</th>
                    <th className="text-right py-2 font-medium">Subtotal</th>
                    <th className="text-left py-2 font-medium">Comentario</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    editingId === p.id ? (
                      <tr key={p.id} className="border-b bg-amber-50/40">
                        <td className="py-1.5">
                          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="py-1.5">
                          <select value={editPT} onChange={(e) => setEditPT(e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm w-full">
                            {productTypes.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5">
                          <select value={editGrp} onChange={(e) => setEditGrp(e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm w-full">
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 text-right">
                          <input type="number" min={1} value={editQty} onChange={(e) => setEditQty(Number(e.target.value))}
                            className="rounded border border-input px-2 py-1 text-sm w-20 text-right" />
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground text-sm">—</td>
                        <td className="py-1.5">
                          <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Comentario"
                            className="rounded border border-input px-2 py-1 text-sm w-full" />
                        </td>
                        <td className="py-1.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-700" onClick={updateProduct} disabled={editSaving}>
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                              ✕
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2">{new Date(p.product_date + "T00:00:00").toLocaleDateString("es-PE")}</td>
                        <td className="py-2 font-medium">{p.manual_product_types.name}</td>
                        <td className="py-2 text-muted-foreground">{p.groups?.name ?? ""}</td>
                        <td className="py-2 text-right">{p.quantity}</td>
                        <td className="py-2 text-right">
                          S/.{(p.quantity * p.manual_product_types.unit_price).toFixed(2)}
                        </td>
                        <td className="py-2 text-sm text-muted-foreground max-w-[180px] truncate">
                          {p.notes ?? ""}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(p)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => deleteProduct(p.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
