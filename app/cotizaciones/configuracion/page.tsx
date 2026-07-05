"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, Plus, Trash2, Upload } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface BankAccount {
  banco: string;
  cuenta: string;
  cci: string;
  moneda: string;
}

interface CompanySettings {
  id?: string;
  company_name: string;
  trade_name: string;
  ruc: string;
  address: string;
  district: string;
  phone: string;
  email: string;
  advisor_name: string;
  advisor_role: string;
  advisor_phone: string;
  bank_accounts: BankAccount[];
  logo_url: string | null;
}

const EMPTY: CompanySettings = {
  company_name: "",
  trade_name: "",
  ruc: "",
  address: "",
  district: "",
  phone: "",
  email: "",
  advisor_name: "",
  advisor_role: "",
  advisor_phone: "",
  bank_accounts: [],
  logo_url: null,
};

export default function ConfiguracionPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<CompanySettings>(EMPTY);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role !== "super_admin") {
      router.replace("/dashboard");
    }
  }, [profile, loading, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/cotizaciones/company-settings");
    if (res.ok) {
      const data = await res.json();
      if (data) {
        setForm({
          ...EMPTY,
          ...data,
          bank_accounts: Array.isArray(data.bank_accounts) ? data.bank_accounts : [],
          logo_url: data.logo_url ?? null,
        });
      }
    }
    setFetching(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function set(field: keyof CompanySettings, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addAccount() {
    setForm((prev) => ({
      ...prev,
      bank_accounts: [...prev.bank_accounts, { banco: "", cuenta: "", cci: "", moneda: "PEN" }],
    }));
  }

  function updateAccount(i: number, field: keyof BankAccount, value: string) {
    setForm((prev) => {
      const accs = [...prev.bank_accounts];
      accs[i] = { ...accs[i], [field]: value };
      return { ...prev, bank_accounts: accs };
    });
  }

  function removeAccount(i: number) {
    setForm((prev) => ({
      ...prev,
      bank_accounts: prev.bank_accounts.filter((_, idx) => idx !== i),
    }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    setUploading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const path = `logos/company-logo.${ext}`;
      const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
      if (error) { toast.error(error.message); return; }
      const { data: pub } = supabase.storage.from("assets").getPublicUrl(path);
      setForm((prev) => ({ ...prev, logo_url: pub.publicUrl + `?t=${Date.now()}` }));
      toast.success("Logo subido");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function save() {
    if (!form.company_name.trim() || !form.ruc.trim()) {
      toast.error("Razón social y RUC son requeridos");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cotizaciones/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Configuración guardada");
      load();
    } finally {
      setSaving(false);
    }
  }

  if (loading || fetching) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuración del emisor</h1>
          <p className="text-muted-foreground mt-1">Datos de Sylvia&apos;s House para encabezados de cotizaciones.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>

      {/* Empresa */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos de la empresa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Razón social *</label>
              <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)}
                placeholder="EGOAVIL MALDONADO SYLVIA LORENA"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Nombre comercial</label>
              <input value={form.trade_name} onChange={(e) => set("trade_name", e.target.value)}
                placeholder="SYLVIA HOUSE"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">RUC *</label>
              <input value={form.ruc} onChange={(e) => set("ruc", e.target.value)}
                placeholder="10062514898" maxLength={11}
                className="rounded-md border border-input px-3 py-2 text-sm font-mono" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Distrito</label>
              <input value={form.district} onChange={(e) => set("district", e.target.value)}
                placeholder="San Borja"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Dirección</label>
            <input value={form.address} onChange={(e) => set("address", e.target.value)}
              placeholder="Av. ..."
              className="rounded-md border border-input px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Teléfono</label>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="986381354"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Correo</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="sylvia.egoavil@outlook.com"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Asesor */}
      <Card>
        <CardHeader><CardTitle className="text-base">Asesor / Contacto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Nombre</label>
              <input value={form.advisor_name} onChange={(e) => set("advisor_name", e.target.value)}
                placeholder="Sylvia Egoavil"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Cargo</label>
              <input value={form.advisor_role} onChange={(e) => set("advisor_role", e.target.value)}
                placeholder="Gerente"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Teléfono</label>
              <input value={form.advisor_phone} onChange={(e) => set("advisor_phone", e.target.value)}
                placeholder="986381354"
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cuentas bancarias */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Cuentas bancarias</CardTitle>
          <Button size="sm" variant="outline" onClick={addAccount}>
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.bank_accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin cuentas registradas.</p>
          )}
          {form.bank_accounts.map((acc, i) => (
            <div key={i} className="rounded-md border p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Banco</label>
                  <input value={acc.banco} onChange={(e) => updateAccount(i, "banco", e.target.value)}
                    placeholder="BBVA"
                    className="rounded border border-input px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Cuenta</label>
                  <input value={acc.cuenta} onChange={(e) => updateAccount(i, "cuenta", e.target.value)}
                    placeholder="0011-0933-..."
                    className="rounded border border-input px-2 py-1.5 text-sm font-mono" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">CCI</label>
                  <input value={acc.cci} onChange={(e) => updateAccount(i, "cci", e.target.value)}
                    placeholder="011-933-..."
                    className="rounded border border-input px-2 py-1.5 text-sm font-mono" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Moneda</label>
                  <select value={acc.moneda} onChange={(e) => updateAccount(i, "moneda", e.target.value)}
                    className="rounded border border-input px-2 py-1.5 text-sm">
                    <option value="PEN">PEN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => removeAccount(i)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo empresa" className="h-20 object-contain border rounded-md p-2 bg-white" />
          )}
          <div>
            <label className="block text-sm font-medium mb-2">Subir logo (PNG, JPG, SVG)</label>
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-input px-3 py-2 text-sm hover:bg-muted transition-colors">
              <Upload className="h-4 w-4" />
              {uploading ? "Subiendo..." : "Seleccionar archivo"}
              <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden"
                onChange={handleLogoUpload} disabled={uploading} />
            </label>
            <p className="text-xs text-muted-foreground mt-1">El archivo reemplaza el logo actual.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
