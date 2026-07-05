"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Trash2, Loader2, Search, X, Download, Eye, ExternalLink } from "lucide-react";

interface Quote {
  id: string;
  quote_number: string;
  issue_date: string;
  currency: string;
  client_ruc: string | null;
  client_business_name: string;
  client_attention: string | null;
  reference: string | null;
  payment_terms: string | null;
  delivery_time: string | null;
  subtotal: number;
  igv: number;
  total: number;
  advisor_name: string | null;
  pdf_url: string | null;
  created_at: string;
}

interface QuoteDetail extends Quote {
  client_address: string | null;
  client_phone: string | null;
  client_email: string | null;
  offer_validity: string | null;
  delivery_place: string | null;
  items: {
    id: string;
    position: number;
    quantity: number;
    unit: string | null;
    product_type: string | null;
    brand_name: string | null;
    description: string;
    unit_price: number;
    line_total: number;
  }[];
}

const PAYMENT_OPTIONS = ["Contado", "Crédito 15 días", "Crédito 30 días", "Crédito 45 días", "Crédito 60 días"];

const fmtDate = (d: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function HistorialPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const isSuperAdmin = profile?.role === "super_admin";

  useEffect(() => {
    if (!authLoading && profile?.role !== "super_admin" && profile?.role !== "client_admin") {
      router.replace("/dashboard");
    }
  }, [profile, authLoading, router]);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // PDF iframe modal
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null);

  // PDF regenerate loading per row
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  // Detail modal
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<QuoteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async (q = search, df = dateFrom, dt = dateTo, pt = filterPayment) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (df) params.set("date_from", df);
    if (dt) params.set("date_to", dt);
    if (pt) params.set("payment_terms", pt);
    setLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/quotes?${params}`);
      if (res.ok) setQuotes(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, filterPayment]);

  useEffect(() => { load("", "", "", ""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { load(search, dateFrom, dateTo, filterPayment); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, dateFrom, dateTo, filterPayment, load]);

  function clearFilters() {
    setSearch(""); setDateFrom(""); setDateTo(""); setFilterPayment("");
  }

  const hasFilters = search || dateFrom || dateTo || filterPayment;

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cotizaciones/quotes/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Cotización eliminada");
      setDeleteId(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  // Generate PDF, upload to Storage, open modal
  async function handleViewPdf(quote: Quote) {
    if (quote.pdf_url) {
      setPdfModalUrl(quote.pdf_url);
      return;
    }
    // No PDF stored yet — generate + upload
    setPdfLoading(quote.id);
    try {
      const detailRes = await fetch(`/api/cotizaciones/quotes/${quote.id}`);
      if (!detailRes.ok) { toast.error("Error al cargar la cotización"); return; }
      const data = await detailRes.json();

      const csRes = await fetch("/api/cotizaciones/company-settings");
      const company = csRes.ok ? await csRes.json() : null;
      if (!company) { toast.error("Configura los datos del emisor primero"); return; }

      let logoBase64: string | null = null;
      if (company.logo_url) {
        try {
          const r = await fetch(company.logo_url);
          const blob = await r.blob();
          logoBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { /* skip */ }
      }

      const items = (data.items ?? []).map((i: {
        id: string; position: number; quantity: number; unit: string | null;
        product_type: string | null; brand_name: string | null; description: string;
        unit_price: number; line_total: number;
      }) => ({
        id: i.id, position: i.position, quantity: i.quantity,
        unit: i.unit ?? "", productType: i.product_type ?? "",
        brandName: i.brand_name ?? "", description: i.description,
        unitPrice: i.unit_price, lineTotal: i.line_total,
      }));

      const { pdf } = await import("@react-pdf/renderer");
      const { QuotePDFDocument } = await import("@/components/cotizaciones/QuotePDF");

      // Fetch brand logos
      const brandLogos: { name: string; logoBase64: string | null }[] = await (async () => {
        try {
          const bRes = await fetch("/api/cotizaciones/brands?active=true");
          if (!bRes.ok) return [];
          const brands: { name: string; logo_url: string | null }[] = await bRes.json();
          return Promise.all(
            brands.filter(b => b.logo_url).map(async b => {
              try {
                const r = await fetch(b.logo_url!);
                const bl = await r.blob();
                const logoBase64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(bl);
                });
                return { name: b.name, logoBase64 };
              } catch { return { name: b.name, logoBase64: null }; }
            })
          );
        } catch { return []; }
      })();

      const blob = await pdf(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        React.createElement(QuotePDFDocument, {
          quoteNumber: data.quote_number, issueDate: data.issue_date,
          currency: data.currency, company, logoBase64,
          brandLogos,
          clientRuc: data.client_ruc ?? "", clientBusinessName: data.client_business_name,
          clientAddress: data.client_address ?? "", clientAttention: data.client_attention ?? "",
          clientPhone: data.client_phone ?? "", clientEmail: data.client_email ?? "",
          reference: data.reference ?? "", paymentTerms: data.payment_terms ?? "",
          deliveryTime: data.delivery_time ?? "", offerValidity: data.offer_validity ?? "",
          deliveryPlace: data.delivery_place ?? "",
          items, subtotal: data.subtotal, igv: data.igv, total: data.total,
        }) as any
      ).toBlob();

      // Upload to Storage
      const fd = new FormData();
      fd.append("file", blob, `Cotizacion-${data.quote_number}.pdf`);
      const uploadRes = await fetch(`/api/cotizaciones/quotes/${quote.id}/pdf`, {
        method: "POST", body: fd,
      });

      if (uploadRes.ok) {
        const { pdf_url } = await uploadRes.json();
        setQuotes(prev => prev.map(q => q.id === quote.id ? { ...q, pdf_url } : q));
        setPdfModalUrl(pdf_url);
      } else {
        // Show from object URL as fallback
        const objUrl = URL.createObjectURL(blob);
        setPdfModalUrl(objUrl);
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al generar el PDF");
    } finally {
      setPdfLoading(null);
    }
  }

  async function handleDetail(id: string) {
    setDetailId(id);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/cotizaciones/quotes/${id}`);
      if (res.ok) setDetailData(await res.json());
      else toast.error("Error al cargar el detalle");
    } finally {
      setDetailLoading(false);
    }
  }

  if (authLoading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Historial de cotizaciones</h1>
        <p className="text-muted-foreground mt-1">Todas las cotizaciones emitidas.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por Nro., cliente, atención o referencia..."
                className="w-full rounded-md border border-input pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Desde</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Forma de pago</label>
              <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm">
                <option value="">Todas</option>
                {PAYMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="h-[38px]">
                <X className="h-4 w-4 mr-1" /> Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Cargando..." : `${quotes.length} cotización${quotes.length !== 1 ? "es" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {hasFilters ? "Sin resultados para los filtros aplicados" : "Sin cotizaciones registradas"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Fecha</th>
                    <th className="text-left py-2 font-medium">Nro.</th>
                    <th className="text-left py-2 font-medium">Cliente</th>
                    <th className="text-left py-2 font-medium">Atención</th>
                    <th className="text-left py-2 font-medium">Referencia</th>
                    <th className="text-left py-2 font-medium">Forma de pago</th>
                    <th className="text-left py-2 font-medium">Entrega</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="text-right py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => {
                    const sym = q.currency === "USD" ? "US$" : "S/";
                    return (
                      <tr key={q.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 text-muted-foreground whitespace-nowrap">{fmtDate(q.issue_date)}</td>
                        <td className="py-2 font-mono font-medium whitespace-nowrap">{q.quote_number}</td>
                        <td className="py-2 max-w-[180px] truncate">{q.client_business_name}</td>
                        <td className="py-2 text-muted-foreground max-w-[120px] truncate">{q.client_attention ?? "—"}</td>
                        <td className="py-2 text-muted-foreground max-w-[140px] truncate">{q.reference ?? "—"}</td>
                        <td className="py-2 whitespace-nowrap">
                          {q.payment_terms ? (
                            <Badge variant="secondary" className="text-xs">{q.payment_terms}</Badge>
                          ) : "—"}
                        </td>
                        <td className="py-2 text-muted-foreground whitespace-nowrap">{q.delivery_time ?? "—"}</td>
                        <td className="py-2 text-right font-semibold whitespace-nowrap">
                          {sym} {q.total.toFixed(2)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {/* Ver PDF */}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              title={q.pdf_url ? "Ver PDF" : "Generar y ver PDF"}
                              onClick={() => handleViewPdf(q)}
                              disabled={pdfLoading === q.id}>
                              {pdfLoading === q.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <FileText className="h-3.5 w-3.5" />}
                            </Button>
                            {/* Descargar */}
                            {q.pdf_url && (
                              <a href={q.pdf_url} download={`Cotizacion-${q.quote_number}.pdf`} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Descargar PDF">
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </a>
                            )}
                            {/* Ver detalle */}
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                              title="Ver detalle"
                              onClick={() => handleDetail(q.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {/* Eliminar */}
                            {isSuperAdmin && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                                title="Eliminar"
                                onClick={() => setDeleteId(q.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF iframe modal */}
      {pdfModalUrl && (
        <div className="fixed inset-0 bg-black/70 flex flex-col z-50">
          <div className="flex items-center justify-between px-4 py-2 bg-background border-b">
            <span className="text-sm font-medium">Vista previa del PDF</span>
            <div className="flex gap-2">
              <a href={pdfModalUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="gap-1">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir en pestaña
                </Button>
              </a>
              <Button size="sm" variant="ghost" onClick={() => setPdfModalUrl(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <iframe
            src={pdfModalUrl}
            className="flex-1 w-full"
            title="Cotización PDF"
          />
        </div>
      )}

      {/* Detail modal */}
      {detailId && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-3xl mt-8 mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-base">Detalle de cotización</h2>
              <Button size="sm" variant="ghost" onClick={() => { setDetailId(null); setDetailData(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6">
              {detailLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : detailData ? (
                <div className="space-y-5 text-sm">
                  {/* Header */}
                  <div className="flex flex-wrap justify-between gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cliente</p>
                      <p className="font-semibold">{detailData.client_business_name}</p>
                      {detailData.client_ruc && <p className="text-muted-foreground">RUC: {detailData.client_ruc}</p>}
                      {detailData.client_address && <p className="text-muted-foreground">{detailData.client_address}</p>}
                      {detailData.client_attention && <p className="text-muted-foreground">Attn.: {detailData.client_attention}</p>}
                      {detailData.client_phone && <p className="text-muted-foreground">Tel: {detailData.client_phone}</p>}
                      {detailData.client_email && <p className="text-muted-foreground">{detailData.client_email}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cotización</p>
                      <p className="font-mono font-bold text-base">{detailData.quote_number}</p>
                      <p className="text-muted-foreground">{fmtDate(detailData.issue_date)}</p>
                      {detailData.reference && <p className="text-muted-foreground mt-1">Ref: {detailData.reference}</p>}
                    </div>
                  </div>

                  {/* Conditions */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-muted/30 rounded p-3">
                    {detailData.payment_terms && (
                      <div><p className="text-muted-foreground">Forma de pago</p><p className="font-medium">{detailData.payment_terms}</p></div>
                    )}
                    {detailData.delivery_time && (
                      <div><p className="text-muted-foreground">Tiempo de entrega</p><p className="font-medium">{detailData.delivery_time}</p></div>
                    )}
                    {detailData.offer_validity && (
                      <div><p className="text-muted-foreground">Validez</p><p className="font-medium">{detailData.offer_validity}</p></div>
                    )}
                    {detailData.delivery_place && (
                      <div><p className="text-muted-foreground">Lugar de entrega</p><p className="font-medium">{detailData.delivery_place}</p></div>
                    )}
                  </div>

                  {/* Items */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1.5 font-medium w-8">#</th>
                          <th className="text-left py-1.5 font-medium">Descripción</th>
                          <th className="text-left py-1.5 font-medium">Tipo</th>
                          <th className="text-left py-1.5 font-medium">Marca</th>
                          <th className="text-right py-1.5 font-medium">Cant.</th>
                          <th className="text-left py-1.5 font-medium">U/M</th>
                          <th className="text-right py-1.5 font-medium">P. Unit.</th>
                          <th className="text-right py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.items.map((item) => {
                          const sym = detailData.currency === "USD" ? "US$" : "S/";
                          return (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="py-1.5 text-muted-foreground">{item.position}</td>
                              <td className="py-1.5">{item.description}</td>
                              <td className="py-1.5 text-muted-foreground">{item.product_type ?? "—"}</td>
                              <td className="py-1.5 text-muted-foreground">{item.brand_name ?? "—"}</td>
                              <td className="py-1.5 text-right">{item.quantity}</td>
                              <td className="py-1.5">{item.unit ?? ""}</td>
                              <td className="py-1.5 text-right">{sym} {item.unit_price.toFixed(2)}</td>
                              <td className="py-1.5 text-right font-medium">{sym} {item.line_total.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-48 space-y-1 text-xs">
                      {(() => {
                        const sym = detailData.currency === "USD" ? "US$" : "S/";
                        return (
                          <>
                            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{sym} {detailData.subtotal.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">IGV (18%)</span><span>{sym} {detailData.igv.toFixed(2)}</span></div>
                            <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{sym} {detailData.total.toFixed(2)}</span></div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">Error al cargar el detalle.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-sm p-6 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2 text-red-700">
              <Trash2 className="h-4 w-4" /> Eliminar cotización
            </h2>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar la cotización <strong>{quotes.find(q => q.id === deleteId)?.quote_number}</strong>?
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleDelete(deleteId)} disabled={deleting}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
