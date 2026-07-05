"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, Save, FileText, Loader2, ExternalLink, X } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuoteItem {
  id: string;
  position: number;
  quantity: number;
  unit: string;
  productType: string;
  brandName: string;
  description: string;
  unitPrice: number;
  lineTotal: number;
}

interface CatalogProduct {
  id: string;
  code: string | null;
  description: string;
  unit: string | null;
  product_type: string | null;
  unit_price: number | null;
  brands: { name: string } | null;
}

interface CachedClient {
  ruc: string;
  business_name: string;
  address: string | null;
  attention: string | null;
  phone: string | null;
  email: string | null;
  reference: string | null;
}

interface CompanySettings {
  company_name: string;
  trade_name: string | null;
  ruc: string;
  address: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
  advisor_name: string | null;
  advisor_role: string | null;
  advisor_phone: string | null;
  bank_accounts: { banco: string; cuenta: string; cci: string; moneda: string }[];
  logo_url: string | null;
}

const PAYMENT_OPTIONS = [
  "Contado",
  "Crédito 15 días",
  "Crédito 30 días",
  "Crédito 45 días",
  "Crédito 60 días",
];

const todayStr = () => new Date().toISOString().split("T")[0];

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CotizacionGeneradorPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Guard
  useEffect(() => {
    if (!authLoading && profile?.role !== "super_admin" && profile?.role !== "client_admin") {
      router.replace("/dashboard");
    }
  }, [profile, authLoading, router]);

  // Company settings
  const [company, setCompany] = useState<CompanySettings | null>(null);

  // Document fields
  const [quoteNumber, setQuoteNumber] = useState("—");
  const [issueDate, setIssueDate] = useState(todayStr());
  const [currency, setCurrency] = useState("PEN");

  // Client fields
  const [clientRuc, setClientRuc] = useState("");
  const [clientBusinessName, setClientBusinessName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientAttention, setClientAttention] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [reference, setReference] = useState("");

  // Items
  const [items, setItems] = useState<QuoteItem[]>([]);

  // Conditions
  const [paymentTerms, setPaymentTerms] = useState("Contado");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [offerValidity, setOfferValidity] = useState("");
  const [deliveryPlace, setDeliveryPlace] = useState("");

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<CatalogProduct[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // UI state
  const [rucLoading, setRucLoading] = useState(false);
  const [rucFromCache, setRucFromCache] = useState(false);

  // Client autocomplete
  const [rucSuggestions, setRucSuggestions] = useState<CachedClient[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<CachedClient[]>([]);
  const [showRucDrop, setShowRucDrop] = useState(false);
  const [showNameDrop, setShowNameDrop] = useState(false);
  const rucDropRef = useRef<HTMLDivElement>(null);
  const nameDropRef = useRef<HTMLDivElement>(null);
  const rucSugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // ── Computed totals ──────────────────────────────────────────────────────
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.lineTotal, 0), [items]);
  const igv = useMemo(() => subtotal * 0.18, [subtotal]);
  const total = useMemo(() => subtotal + igv, [subtotal, igv]);
  const sym = currency === "USD" ? "US$" : "S/";

  // ── Load initial data ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [csRes, nnRes] = await Promise.all([
        fetch("/api/cotizaciones/company-settings"),
        fetch("/api/cotizaciones/next-number"),
      ]);
      if (csRes.ok) setCompany(await csRes.json());
      if (nnRes.ok) {
        const d = await nnRes.json();
        setQuoteNumber(d.number);
      }
    }
    init();
  }, []);

  // ── Product search ───────────────────────────────────────────────────────
  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setProductResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/products?search=${encodeURIComponent(q)}`);
      if (res.ok) setProductResults(await res.json());
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (productSearch.trim()) {
      searchTimer.current = setTimeout(() => { searchProducts(productSearch); }, 300);
      setShowDropdown(true);
    } else {
      setProductResults([]);
      setShowDropdown(false);
    }
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [productSearch, searchProducts]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Items management ─────────────────────────────────────────────────────
  function addFromCatalog(p: CatalogProduct) {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      position: prev.length + 1,
      quantity: 1,
      unit: p.unit ?? "",
      productType: p.product_type ?? "",
      brandName: p.brands?.name ?? "",
      description: p.description,
      unitPrice: p.unit_price ?? 0,
      lineTotal: p.unit_price ?? 0,
    }]);
    setProductSearch("");
    setShowDropdown(false);
  }

  function addManualItem() {
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      position: prev.length + 1,
      quantity: 1,
      unit: "",
      productType: "",
      brandName: "",
      description: "",
      unitPrice: 0,
      lineTotal: 0,
    }]);
  }

  function updateItem(id: string, field: keyof QuoteItem, raw: string) {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const val = (field === "quantity" || field === "unitPrice")
        ? parseFloat(raw) || 0
        : raw;
      const updated = { ...item, [field]: val };
      if (field === "quantity" || field === "unitPrice") {
        updated.lineTotal = updated.quantity * updated.unitPrice;
      }
      return updated;
    }));
  }

  function removeItem(id: string) {
    setItems(prev =>
      prev.filter(i => i.id !== id).map((i, idx) => ({ ...i, position: idx + 1 }))
    );
  }

  // ── RUC lookup ───────────────────────────────────────────────────────────
  async function lookupRuc(force = false) {
    const ruc = clientRuc.trim();
    if (!/^\d{11}$/.test(ruc)) { toast.error("El RUC debe tener 11 dígitos"); return; }
    setRucLoading(true);
    try {
      const url = `/api/cotizaciones/consultar-ruc?ruc=${ruc}${force ? "&force=true" : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setClientBusinessName(data.razonSocial ?? "");
      setClientAddress(data.direccion ?? "");
      setRucFromCache(!!data.fromCache);
      toast.success(data.fromCache ? "Cliente cargado desde caché" : "RUC consultado en SUNAT");
    } finally {
      setRucLoading(false);
    }
  }

  // ── Client autocomplete helpers ──────────────────────────────────────────
  async function searchClients(q: string): Promise<CachedClient[]> {
    if (!q.trim()) return [];
    try {
      const res = await fetch(`/api/cotizaciones/clients-cache?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  }

  function applyClient(c: CachedClient) {
    setClientRuc(c.ruc);
    setClientBusinessName(c.business_name);
    setClientAddress(c.address ?? "");
    setClientAttention(c.attention ?? "");
    setClientPhone(c.phone ?? "");
    setClientEmail(c.email ?? "");
    setReference(c.reference ?? "");
    setRucFromCache(true);
    setShowRucDrop(false);
    setShowNameDrop(false);
    setRucSuggestions([]);
    setNameSuggestions([]);
  }

  function onRucChange(val: string) {
    setClientRuc(val);
    setRucFromCache(false);
    if (rucSugTimer.current) clearTimeout(rucSugTimer.current);
    if (val.trim().length < 2) { setRucSuggestions([]); setShowRucDrop(false); return; }
    rucSugTimer.current = setTimeout(async () => {
      const results = await searchClients(val.trim());
      setRucSuggestions(results);
      setShowRucDrop(results.length > 0);
    }, 250);
  }

  function onNameChange(val: string) {
    setClientBusinessName(val);
    setRucFromCache(false);
    if (nameSugTimer.current) clearTimeout(nameSugTimer.current);
    if (val.trim().length < 2) { setNameSuggestions([]); setShowNameDrop(false); return; }
    nameSugTimer.current = setTimeout(async () => {
      const results = await searchClients(val.trim());
      setNameSuggestions(results);
      setShowNameDrop(results.length > 0);
    }, 250);
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (rucDropRef.current && !rucDropRef.current.contains(e.target as Node)) {
        setShowRucDrop(false);
      }
      if (nameDropRef.current && !nameDropRef.current.contains(e.target as Node)) {
        setShowNameDrop(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Shared: fetch logo as base64 ─────────────────────────────────────────
  async function fetchLogoBase64(): Promise<string | null> {
    if (!company?.logo_url) return null;
    try {
      const r = await fetch(company.logo_url);
      const blob = await r.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  // ── Shared: fetch brand logos as base64 ──────────────────────────────────
  async function fetchBrandLogos(): Promise<{ name: string; logoBase64: string | null }[]> {
    try {
      const res = await fetch("/api/cotizaciones/brands?active=true");
      if (!res.ok) return [];
      const brands: { name: string; logo_url: string | null }[] = await res.json();
      return Promise.all(
        brands
          .filter(b => b.logo_url)
          .map(async b => {
            try {
              const r = await fetch(b.logo_url!);
              const blob = await r.blob();
              const logoBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              return { name: b.name, logoBase64 };
            } catch { return { name: b.name, logoBase64: null }; }
          })
      );
    } catch { return []; }
  }

  // ── Shared: build PDF blob ────────────────────────────────────────────────
  async function buildPdfBlob(quoteNum: string, logoBase64: string | null): Promise<Blob> {
    const { pdf } = await import("@react-pdf/renderer");
    const { QuotePDFDocument } = await import("@/components/cotizaciones/QuotePDF");
    const brandLogos = await fetchBrandLogos();
    return pdf(
      React.createElement(QuotePDFDocument, {
        quoteNumber: quoteNum, issueDate, currency, company: company!, logoBase64,
        brandLogos,
        clientRuc, clientBusinessName, clientAddress,
        clientAttention, clientPhone, clientEmail, reference,
        paymentTerms, deliveryTime, offerValidity, deliveryPlace,
        items, subtotal, igv, total,
      })
    ).toBlob();
  }

  // ── Shared: upload PDF blob to Storage via server route ───────────────────
  async function uploadPdfBlob(quoteId: string, quoteNum: string, blob: Blob): Promise<string | null> {
    try {
      const fd = new FormData();
      fd.append("file", blob, `Cotizacion-${quoteNum}.pdf`);
      const res = await fetch(`/api/cotizaciones/quotes/${quoteId}/pdf`, {
        method: "POST", body: fd,
      });
      if (!res.ok) return null;
      const { pdf_url } = await res.json();
      return pdf_url as string;
    } catch { return null; }
  }

  // ── Save quote ────────────────────────────────────────────────────────────
  async function saveQuote() {
    if (!clientBusinessName.trim()) { toast.error("La razón social del cliente es requerida"); return; }
    if (items.length === 0) { toast.error("Agrega al menos un producto"); return; }
    if (!company) { toast.error("Carga la configuración del emisor primero"); return; }
    setSaving(true);
    try {
      // 1. Save quote to DB
      const res = await fetch("/api/cotizaciones/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueDate, currency,
          clientRuc, clientBusinessName, clientAddress,
          clientAttention, clientPhone, clientEmail, reference,
          paymentTerms, deliveryTime, offerValidity, deliveryPlace,
          subtotal, igv, total,
          advisorName: company?.advisor_name ?? "",
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }

      setQuoteNumber(data.quote_number);
      setSavedId(data.id);

      // 2. Generate PDF + upload to Storage
      try {
        const logoBase64 = await fetchLogoBase64();
        const blob = await buildPdfBlob(data.quote_number, logoBase64);
        const url = await uploadPdfBlob(data.id, data.quote_number, blob);
        if (url) setPdfUrl(url);
      } catch { /* PDF generation failure does not block save */ }

      toast.success(`Cotización ${data.quote_number} guardada`);
    } finally {
      setSaving(false);
    }
  }

  // ── Generate / re-generate PDF ────────────────────────────────────────────
  async function generatePdf() {
    if (!company) { toast.error("Carga la configuración del emisor primero"); return; }
    setGeneratingPdf(true);
    try {
      const logoBase64 = await fetchLogoBase64();
      const blob = await buildPdfBlob(quoteNumber, logoBase64);

      // If already saved, also re-upload to update Storage
      if (savedId) {
        const url = await uploadPdfBlob(savedId, quoteNumber, blob);
        if (url) setPdfUrl(url);
      }

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cotizacion-${quoteNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("Error al generar el PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (authLoading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva cotización</h1>
          <p className="text-muted-foreground mt-1">
            Nro. <span className="font-mono font-semibold text-amber-700">{quoteNumber}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveQuote} disabled={saving || !!savedId}
            className="bg-amber-700 hover:bg-amber-800 text-white">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? "Guardando..." : savedId ? "Guardada" : "Guardar cotización"}
          </Button>
          <Button onClick={generatePdf} disabled={generatingPdf} variant="outline">
            {generatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            {generatingPdf ? "Generando..." : "Generar PDF"}
          </Button>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" /> Ver PDF guardado
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── LEFT: FORM ───────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Documento */}
          <Card>
            <CardHeader><CardTitle className="text-base">Documento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Nro. cotización</label>
                  <input readOnly value={quoteNumber}
                    className="rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono text-muted-foreground" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Fecha de emisión</label>
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Moneda</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                    className="rounded-md border border-input px-3 py-2 text-sm">
                    <option value="PEN">Soles (PEN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card>
            <CardHeader><CardTitle className="text-base">Datos del cliente</CardTitle></CardHeader>
            <CardContent className="space-y-3">

              {/* RUC + autocomplete */}
              <div className="flex gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs font-medium">RUC</label>
                  <div className="relative" ref={rucDropRef}>
                    <input
                      value={clientRuc}
                      onChange={(e) => onRucChange(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && lookupRuc()}
                      onFocus={() => rucSuggestions.length > 0 && setShowRucDrop(true)}
                      placeholder="20100047218" maxLength={11}
                      className="w-full rounded-md border border-input px-3 py-2 text-sm font-mono"
                    />
                    {showRucDrop && rucSuggestions.length > 0 && (
                      <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-background border border-border rounded-md shadow-md overflow-hidden max-h-52 overflow-y-auto">
                        {rucSuggestions.map((c) => (
                          <li key={c.ruc}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                              onMouseDown={(e) => { e.preventDefault(); applyClient(c); }}
                            >
                              <span className="font-mono text-xs text-muted-foreground mr-2">{c.ruc}</span>
                              <span className="font-medium">{c.business_name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => lookupRuc()} disabled={rucLoading}
                    className="h-[38px]">
                    {rucLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1.5">Consultar RUC</span>
                  </Button>
                  {rucFromCache && (
                    <Button size="sm" variant="ghost" onClick={() => lookupRuc(true)} disabled={rucLoading}
                      className="h-[38px] text-xs text-muted-foreground" title="Forzar consulta a SUNAT">
                      Actualizar
                    </Button>
                  )}
                </div>
              </div>
              {rucFromCache && (
                <p className="text-xs text-green-700 -mt-1">✓ datos cargados desde caché</p>
              )}

              {/* Razón social + autocomplete */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Razón social *</label>
                <div className="relative" ref={nameDropRef}>
                  <input
                    value={clientBusinessName}
                    onChange={(e) => onNameChange(e.target.value)}
                    onFocus={() => nameSuggestions.length > 0 && setShowNameDrop(true)}
                    placeholder="EMPRESA SAC"
                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                  {showNameDrop && nameSuggestions.length > 0 && (
                    <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-background border border-border rounded-md shadow-md overflow-hidden max-h-52 overflow-y-auto">
                      {nameSuggestions.map((c) => (
                        <li key={c.ruc}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                            onMouseDown={(e) => { e.preventDefault(); applyClient(c); }}
                          >
                            <span className="font-medium block">{c.business_name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{c.ruc}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Dirección</label>
                <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Av. Principal 123, Lima"
                  className="rounded-md border border-input px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Atención</label>
                  <input value={clientAttention} onChange={(e) => setClientAttention(e.target.value)}
                    placeholder="Nombre del contacto"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Teléfono</label>
                  <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="987654321"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Email</label>
                  <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="contacto@empresa.com"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Referencia</label>
                  <input value={reference} onChange={(e) => setReference(e.target.value)}
                    placeholder="Ej. Cotización torta corporativa"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Productos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Productos y servicios</CardTitle>
              <Button size="sm" variant="outline" onClick={addManualItem}>
                <Plus className="h-4 w-4 mr-1" /> Línea manual
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Catalog search */}
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onFocus={() => productSearch && setShowDropdown(true)}
                    placeholder="Buscar producto del catálogo..."
                    className="w-full rounded-md border border-input pl-9 pr-3 py-2 text-sm"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {showDropdown && productResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors border-b last:border-0"
                        onClick={() => addFromCatalog(p)}
                      >
                        <span className="font-medium">{p.description}</span>
                        {p.brands?.name && <span className="text-muted-foreground ml-2">— {p.brands.name}</span>}
                        {p.unit_price != null && (
                          <span className="float-right text-muted-foreground">{sym} {p.unit_price.toFixed(2)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Items table */}
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin productos. Busca en el catálogo o agrega una línea manual.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1.5 font-medium w-7">#</th>
                        <th className="text-left py-1.5 font-medium w-16">Cant.</th>
                        <th className="text-left py-1.5 font-medium w-14">U/M</th>
                        <th className="text-left py-1.5 font-medium">Descripción</th>
                        <th className="text-right py-1.5 font-medium w-24">V.V.Unit.</th>
                        <th className="text-right py-1.5 font-medium w-24">V.Venta</th>
                        <th className="w-7"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-1 text-muted-foreground">{item.position}</td>
                          <td className="py-1 pr-1">
                            <input
                              type="number" min="0" step="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                              className="w-full rounded border border-input px-1.5 py-1 text-xs text-right"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                              className="w-full rounded border border-input px-1.5 py-1 text-xs"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              value={item.description}
                              onChange={(e) => updateItem(item.id, "description", e.target.value)}
                              className="w-full rounded border border-input px-1.5 py-1 text-xs"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="number" min="0" step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)}
                              className="w-full rounded border border-input px-1.5 py-1 text-xs text-right"
                            />
                          </td>
                          <td className="py-1 text-right font-medium">
                            {sym} {item.lineTotal.toFixed(2)}
                          </td>
                          <td className="py-1 pl-1">
                            <button onClick={() => removeItem(item.id)}
                              className="text-destructive hover:bg-destructive/10 rounded p-0.5">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              {items.length > 0 && (
                <div className="flex flex-col items-end gap-1 pt-2 border-t text-sm">
                  <div className="flex gap-6">
                    <span className="text-muted-foreground">Sub-Total:</span>
                    <span className="font-medium w-28 text-right">{sym} {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-6">
                    <span className="text-muted-foreground">I.G.V. (18%):</span>
                    <span className="font-medium w-28 text-right">{sym} {igv.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-6 text-base font-semibold">
                    <span>Total:</span>
                    <span className="w-28 text-right text-amber-700">{sym} {total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Condiciones comerciales */}
          <Card>
            <CardHeader><CardTitle className="text-base">Condiciones comerciales</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Forma de pago</label>
                  <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                    className="rounded-md border border-input px-3 py-2 text-sm">
                    {PAYMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Tiempo de entrega</label>
                  <input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}
                    placeholder="Ej. STOCK, 2 semanas"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Validez de oferta</label>
                  <input value={offerValidity} onChange={(e) => setOfferValidity(e.target.value)}
                    placeholder="Ej. 10 días"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">Lugar de entrega</label>
                  <input value={deliveryPlace} onChange={(e) => setDeliveryPlace(e.target.value)}
                    placeholder="Ej. EN SUS ALMACENES DE LIMA"
                    className="rounded-md border border-input px-3 py-2 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: LIVE PREVIEW ──────────────────────────────────────── */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Vista previa
                <Badge variant="secondary" className="text-xs font-normal">en tiempo real</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[85vh] p-4">
                <QuotePreview
                  quoteNumber={quoteNumber}
                  issueDate={issueDate}
                  currency={currency}
                  sym={sym}
                  company={company}
                  clientRuc={clientRuc}
                  clientBusinessName={clientBusinessName}
                  clientAddress={clientAddress}
                  clientAttention={clientAttention}
                  clientPhone={clientPhone}
                  clientEmail={clientEmail}
                  reference={reference}
                  items={items}
                  subtotal={subtotal}
                  igv={igv}
                  total={total}
                  paymentTerms={paymentTerms}
                  deliveryTime={deliveryTime}
                  offerValidity={offerValidity}
                  deliveryPlace={deliveryPlace}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Live preview component ───────────────────────────────────────────────────

interface PreviewProps {
  quoteNumber: string;
  issueDate: string;
  currency: string;
  sym: string;
  company: CompanySettings | null;
  clientRuc: string;
  clientBusinessName: string;
  clientAddress: string;
  clientAttention: string;
  clientPhone: string;
  clientEmail: string;
  reference: string;
  items: QuoteItem[];
  subtotal: number;
  igv: number;
  total: number;
  paymentTerms: string;
  deliveryTime: string;
  offerValidity: string;
  deliveryPlace: string;
}

function QuotePreview(p: PreviewProps) {
  const fmtDate = (d: string) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="bg-white text-gray-900 text-[10px] border rounded-lg p-5 min-w-[560px] font-sans shadow-sm">
      {/* HEADER */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1 space-y-0.5">
          {p.company?.logo_url && (
            <img src={p.company.logo_url} alt="logo" className="h-10 object-contain mb-2" />
          )}
          <p className="font-bold text-amber-800 text-xs">{p.company?.company_name ?? "—"}</p>
          {p.company?.trade_name && <p>{p.company.trade_name}</p>}
          <p>RUC: {p.company?.ruc ?? "—"}</p>
          {p.company?.address && <p>{p.company.address}{p.company.district ? `, ${p.company.district}` : ""}</p>}
          {p.company?.phone && <p>Tel: {p.company.phone}</p>}
        </div>
        <div className="border-2 border-amber-700 px-4 py-3 text-center flex flex-col items-center justify-center gap-1 min-w-[160px]">
          <p className="text-[9px]">RUC: {p.company?.ruc ?? "—"}</p>
          <p className="font-bold text-amber-700 text-base">COTIZACIÓN</p>
          <p className="font-semibold text-xs">Nro. {p.quoteNumber}</p>
        </div>
      </div>

      {/* CLIENT */}
      <table className="w-full border border-gray-200 text-[10px] mb-3">
        <tbody>
          <tr className="bg-gray-50">
            <td className="border border-gray-200 px-2 py-1.5" colSpan={2}>
              <span className="font-semibold">Señores: </span>{p.clientBusinessName || <span className="text-gray-400">—</span>}
            </td>
            <td className="border border-gray-200 px-2 py-1.5">
              <span className="font-semibold">RUC: </span>{p.clientRuc || "—"}
            </td>
            <td className="border border-gray-200 px-2 py-1.5">
              <span className="font-semibold">Atención: </span>{p.clientAttention || "—"}
            </td>
          </tr>
          <tr>
            <td className="border border-gray-200 px-2 py-1.5">
              <span className="font-semibold">Teléfono: </span>{p.clientPhone || "—"}
            </td>
            <td className="border border-gray-200 px-2 py-1.5">
              <span className="font-semibold">Fec. Emisión: </span>{fmtDate(p.issueDate)}
            </td>
            <td className="border border-gray-200 px-2 py-1.5">
              <span className="font-semibold">Moneda: </span>{p.currency === "USD" ? "Dólares" : "Soles"}
            </td>
            <td className="border border-gray-200 px-2 py-1.5">
              <span className="font-semibold">Referencia: </span>{p.reference || "—"}
            </td>
          </tr>
          {p.clientAddress && (
            <tr>
              <td className="border border-gray-200 px-2 py-1.5" colSpan={4}>
                <span className="font-semibold">Dirección: </span>{p.clientAddress}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="text-[9px] mb-3 text-gray-700">
        Estimados señores: En atención a su amable solicitud nos es grato ofrecerles lo siguiente:
      </p>

      {/* ITEMS */}
      {p.items.length > 0 ? (
        <table className="w-full border border-gray-200 text-[9px] mb-3">
          <thead className="bg-amber-50">
            <tr>
              <th className="border border-gray-200 px-2 py-1 text-center w-6">It</th>
              <th className="border border-gray-200 px-2 py-1 text-right w-12">Cant.</th>
              <th className="border border-gray-200 px-2 py-1 w-10">U/M</th>
              <th className="border border-gray-200 px-2 py-1 text-left">Descripción</th>
              <th className="border border-gray-200 px-2 py-1 w-14">Tipo</th>
              <th className="border border-gray-200 px-2 py-1 w-14">Marca</th>
              <th className="border border-gray-200 px-2 py-1 text-right w-20">V.V.Unit.</th>
              <th className="border border-gray-200 px-2 py-1 text-right w-20">V.Venta</th>
            </tr>
          </thead>
          <tbody>
            {p.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="px-2 py-1 text-center">{item.position}</td>
                <td className="px-2 py-1 text-right">{item.quantity.toFixed(2)}</td>
                <td className="px-2 py-1">{item.unit}</td>
                <td className="px-2 py-1 font-medium">{item.description}</td>
                <td className="px-2 py-1 text-gray-500">{item.productType}</td>
                <td className="px-2 py-1 text-gray-500">{item.brandName}</td>
                <td className="px-2 py-1 text-right">{p.sym} {item.unitPrice.toFixed(2)}</td>
                <td className="px-2 py-1 text-right font-medium">{p.sym} {item.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="border border-dashed border-gray-200 rounded py-4 text-center text-gray-400 text-[9px] mb-3">
          Sin productos
        </div>
      )}

      {/* BOTTOM */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1 border border-gray-200 p-3 space-y-1">
          <p className="font-bold text-[9px] mb-1">CONDICIONES COMERCIALES</p>
          {p.paymentTerms && <p><span className="font-semibold">Forma de Pago: </span>{p.paymentTerms}</p>}
          {p.deliveryTime && <p><span className="font-semibold">Tiempo de Entrega: </span>{p.deliveryTime}</p>}
          {p.offerValidity && <p><span className="font-semibold">Validez de Oferta: </span>{p.offerValidity}</p>}
          {p.deliveryPlace && <p><span className="font-semibold">Lugar de Entrega: </span>{p.deliveryPlace}</p>}
        </div>
        <div className="w-40 border border-gray-200 p-3 space-y-1">
          <div className="flex justify-between"><span>Sub-Total:</span><span>{p.sym} {p.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>I.G.V. (18%):</span><span>{p.sym} {p.igv.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold border-t pt-1 mt-1">
            <span>Total:</span>
            <span className="text-amber-700">{p.sym} {p.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      {p.company && (
        <div className="flex gap-4 text-[9px] border-t pt-2">
          {p.company.advisor_name && (
            <div>
              <p className="font-semibold">{p.company.advisor_name}</p>
              {p.company.advisor_role && <p>{p.company.advisor_role}</p>}
              {p.company.advisor_phone && <p>Tel: {p.company.advisor_phone}</p>}
            </div>
          )}
          {p.company.bank_accounts.length > 0 && (
            <div>
              <p className="font-semibold mb-0.5">Datos Bancarios:</p>
              {p.company.bank_accounts.map((acc, i) => (
                <p key={i}>{acc.banco} | Cta. {acc.cuenta} | CCI {acc.cci} | {acc.moneda}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
