"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Save, X, Download, Upload, FileDown, Trash2, Loader2 } from "lucide-react";

interface Product {
  id: string;
  code: string | null;
  description: string;
  unit: string | null;
  unit_price: number | null;
  currency: string;
  is_active: boolean;
}

const EMPTY_FORM = {
  description: "", unit: "", unit_price: "", currency: "PEN",
};

// Auto-generate next code from existing products
function nextCode(products: Product[]): string {
  const nums = products
    .map((p) => p.code)
    .filter((c): c is string => !!c && /^P-\d+$/.test(c))
    .map((c) => parseInt(c.slice(2)));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `P-${String(max + 1).padStart(3, "0")}`;
}

export default function ProductosCotizacionesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "client_admin" || profile?.role === "super_admin";
  const isSuperAdmin = profile?.role === "super_admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]); // for code generation
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New product form
  const [showForm, setShowForm] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM, code: "" });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import
  const [importing, setImporting] = useState(false);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async (q = search) => {
    const params = new URLSearchParams({ include_inactive: "true" });
    if (q) params.set("search", q);
    const res = await fetch(`/api/cotizaciones/products?${params}`);
    if (res.ok) {
      const data: Product[] = await res.json();
      setProducts(data);
      if (!q) setAllProducts(data); // keep full list for code generation
    }
  }, [search]);

  useEffect(() => {
    loadProducts("").then(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadProducts(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, loadProducts]);

  function openNewForm() {
    const code = nextCode(allProducts);
    setGeneratedCode(code);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }
  function setEditField(field: string, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setEditForm({
      code: p.code ?? "",
      description: p.description,
      unit: p.unit ?? "",
      unit_price: p.unit_price != null ? String(p.unit_price) : "",
      currency: p.currency,
    });
  }

  async function addProduct() {
    if (!form.description.trim()) { toast.error("La descripción es requerida"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: generatedCode,
          description: form.description.trim(),
          unit: form.unit || null,
          unit_price: form.unit_price ? parseFloat(form.unit_price) : null,
          currency: form.currency,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Producto creado");
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      loadProducts(search);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editId || !editForm.description.trim()) { toast.error("La descripción es requerida"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          description: editForm.description.trim(),
          unit: editForm.unit || null,
          unit_price: editForm.unit_price ? parseFloat(editForm.unit_price) : null,
          currency: editForm.currency,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Actualizado");
      setEditId(null);
      loadProducts(search);
    } finally {
      setEditSaving(false);
    }
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/cotizaciones/products?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Producto desactivado"); loadProducts(search); }
    else toast.error("Error al desactivar");
  }

  async function reactivate(id: string) {
    const res = await fetch("/api/cotizaciones/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: true }),
    });
    if (res.ok) { toast.success("Producto reactivado"); loadProducts(search); }
    else toast.error("Error al reactivar");
  }

  async function permanentDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cotizaciones/products?id=${id}&permanent=true`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Producto eliminado permanentemente");
      setDeleteTarget(null);
      loadProducts(search);
    } finally {
      setDeleting(false);
    }
  }

  async function importFromExisting() {
    setImporting(true);
    try {
      const res = await fetch("/api/cotizaciones/products/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(`${data.imported} importados, ${data.skipped} ya existían`);
      if (data.imported > 0) loadProducts(search);
    } finally {
      setImporting(false);
    }
  }

  async function handleXlsxImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingXlsx(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) { toast.error("No se encontró hoja en el archivo"); return; }

      const rawRows: { description: string; unit: string | null; unit_price: number | null; currency: string }[] = [];
      ws.eachRow((row, ri) => {
        if (ri === 1) return;
        const description = String(row.getCell(1).value ?? "").trim();
        const unit = String(row.getCell(2).value ?? "").trim();
        const priceVal = row.getCell(3).value;
        const currency = String(row.getCell(4).value ?? "PEN").trim() || "PEN";
        if (!description) return;
        rawRows.push({
          description,
          unit: unit || null,
          unit_price: priceVal != null && priceVal !== "" ? parseFloat(String(priceVal)) : null,
          currency,
        });
      });

      if (rawRows.length === 0) { toast.error("No se encontraron filas válidas"); return; }

      // Auto-generate sequential codes continuing from existing products
      let baseMax = Math.max(
        0,
        ...allProducts
          .map((p) => p.code)
          .filter((c): c is string => !!c && /^P-\d+$/.test(c))
          .map((c) => parseInt(c.slice(2)))
      );
      const rows = rawRows.map((r) => ({
        ...r,
        code: `P-${String(++baseMax).padStart(3, "0")}`,
      }));

      const res = await fetch("/api/cotizaciones/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success(`${rows.length} productos importados`);
      loadProducts(search);
    } finally {
      setImportingXlsx(false);
      e.target.value = "";
    }
  }

  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Productos");
    ws.addRow(["Descripción", "U/M", "Precio", "Moneda"]);
    ws.getRow(1).font = { bold: true };
    ws.columns = [{ width: 40 }, { width: 10 }, { width: 12 }, { width: 10 }];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla-productos.xlsx"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo de productos</h1>
          <p className="text-muted-foreground mt-1">Productos disponibles para cotizaciones.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileDown className="h-4 w-4 mr-1.5" /> Plantilla
            </Button>
            <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
              <Upload className="h-4 w-4" />
              {importingXlsx ? "Importando..." : "Importar Excel"}
              <input ref={xlsxRef} type="file" accept=".xlsx" className="hidden"
                onChange={handleXlsxImport} disabled={importingXlsx} />
            </label>
            <Button variant="outline" size="sm" onClick={importFromExisting} disabled={importing}>
              <Download className="h-4 w-4 mr-1.5" />
              {importing ? "Importando..." : "Importar existentes"}
            </Button>
            <Button size="sm" className="bg-amber-700 hover:bg-amber-800 text-white" onClick={openNewForm}>
              <Plus className="h-4 w-4 mr-1.5" /> Nuevo
            </Button>
          </div>
        )}
      </div>

      {/* New product form */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              Nuevo producto — código: <span className="font-mono text-amber-700">{generatedCode}</span>
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Descripción *</label>
              <input value={form.description} onChange={(e) => setField("description", e.target.value)}
                placeholder="TORTA GRANDE 30 PORCIONES" autoFocus
                className="rounded border border-input px-2 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">U/M</label>
                <input value={form.unit} onChange={(e) => setField("unit", e.target.value)}
                  placeholder="UND"
                  className="rounded border border-input px-2 py-1.5 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Precio</label>
                <input type="number" min="0" step="0.01" value={form.unit_price}
                  onChange={(e) => setField("unit_price", e.target.value)}
                  placeholder="0.00"
                  className="rounded border border-input px-2 py-1.5 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Moneda</label>
                <select value={form.currency} onChange={(e) => setField("currency", e.target.value)}
                  className="rounded border border-input px-2 py-1.5 text-sm">
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={addProduct} disabled={saving}
                className="bg-amber-700 hover:bg-amber-800 text-white">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saving ? "Guardando..." : "Guardar"}
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por código o descripción..."
        className="w-full rounded-md border border-input px-3 py-2 text-sm max-w-sm"
      />

      {/* Products table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {products.length} producto{products.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin productos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-xs text-muted-foreground w-24">Código</th>
                    <th className="text-left py-2 font-medium text-xs text-muted-foreground">Descripción</th>
                    <th className="text-right py-2 font-medium text-xs text-muted-foreground w-28">Precio</th>
                    <th className="text-center py-2 font-medium text-xs text-muted-foreground w-20">Moneda</th>
                    <th className="text-center py-2 font-medium text-xs text-muted-foreground w-20">Estado</th>
                    {isAdmin && <th className="py-2 w-28"></th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) =>
                    editId === p.id ? (
                      // ── Edit row ───────────────────────────────────────────
                      <tr key={p.id} className="border-b bg-amber-50/40 dark:bg-amber-900/10">
                        <td className="py-1.5 pr-1 font-mono text-xs text-muted-foreground">
                          {p.code ?? "—"}
                        </td>
                        <td className="py-1.5 pr-1">
                          <input value={editForm.description}
                            onChange={(e) => setEditField("description", e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm w-full min-w-[200px]" />
                        </td>
                        <td className="py-1.5 pr-1">
                          <input type="number" min="0" step="0.01" value={editForm.unit_price}
                            onChange={(e) => setEditField("unit_price", e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm w-full text-right" />
                        </td>
                        <td className="py-1.5 pr-1 text-center">
                          <select value={editForm.currency}
                            onChange={(e) => setEditField("currency", e.target.value)}
                            className="rounded border border-input px-1 py-1 text-xs">
                            <option value="PEN">PEN</option>
                            <option value="USD">USD</option>
                          </select>
                        </td>
                        <td className="py-1.5 text-center text-xs text-muted-foreground">—</td>
                        <td className="py-1.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-700"
                              onClick={saveEdit} disabled={editSaving}>
                              {editSaving
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Save className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              onClick={() => setEditId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      // ── Read row ───────────────────────────────────────────
                      <tr key={p.id}
                        className={`border-b last:border-0 hover:bg-muted/30 ${!p.is_active ? "opacity-50" : ""}`}>
                        <td className="py-2 font-mono text-xs text-muted-foreground">{p.code ?? "—"}</td>
                        <td className="py-2 font-medium">{p.description}</td>
                        <td className="py-2 text-right">
                          {p.unit_price != null ? p.unit_price.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 text-center">
                          <Badge variant="outline" className="text-xs">{p.currency}</Badge>
                        </td>
                        <td className="py-2 text-center">
                          <Badge variant={p.is_active ? "secondary" : "outline"} className="text-xs">
                            {p.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        {isAdmin && (
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                title="Editar" onClick={() => startEdit(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {p.is_active ? (
                                <Button size="sm" variant="ghost"
                                  className="h-7 px-2 text-xs text-destructive"
                                  onClick={() => deactivate(p.id)}>
                                  Desactivar
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost"
                                  className="h-7 px-2 text-xs text-green-700"
                                  onClick={() => reactivate(p.id)}>
                                  Activar
                                </Button>
                              )}
                              {isSuperAdmin && (
                                <Button size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                  title="Eliminar permanentemente"
                                  onClick={() => setDeleteTarget(p)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  )}
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
              <Trash2 className="h-4 w-4" /> Eliminar producto
            </h2>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar permanentemente{" "}
              <strong>{deleteTarget.description}</strong>?{" "}
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => permanentDelete(deleteTarget.id)} disabled={deleting}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
