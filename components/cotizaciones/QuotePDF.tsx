"use client";

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

export interface QuoteItem {
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

export interface BankAccount {
  banco: string;
  cuenta: string;
  cci: string;
  moneda: string;
}

export interface CompanyData {
  company_name: string;
  trade_name?: string | null;
  ruc: string;
  address?: string | null;
  district?: string | null;
  phone?: string | null;
  email?: string | null;
  advisor_name?: string | null;
  advisor_role?: string | null;
  advisor_phone?: string | null;
  bank_accounts: BankAccount[];
}

export interface BrandLogo {
  name: string;
  logoBase64: string | null;
}

export interface QuotePDFProps {
  quoteNumber: string;
  issueDate: string;
  currency: string;
  company: CompanyData;
  logoBase64: string | null;
  brandLogos?: BrandLogo[];
  clientRuc: string;
  clientBusinessName: string;
  clientAddress: string;
  clientAttention: string;
  clientPhone: string;
  clientEmail: string;
  reference: string;
  paymentTerms: string;
  deliveryTime: string;
  offerValidity: string;
  deliveryPlace: string;
  items: QuoteItem[];
  subtotal: number;
  igv: number;
  total: number;
}

// ── Palette ────────────────────────────────────────────────────────────────
const AMBER      = "#92400e";
const AMBER_LIGHT = "#fef9f0";
const BORDER     = "#d1d5db";
const GRAY_BG    = "#f9fafb";

// ── Column widths (portrait A4, usable ≈ 535pt) ───────────────────────────
// Fixed cols: 20+46+28+72+72 = 238  →  description flex fills ~297pt
const COL = {
  it:  20,
  qty: 46,
  um:  28,
  vvu: 72,
  vv:  72,
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#111827",
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 30,
    paddingRight: 30,
    flexDirection: "column",
    gap: 10,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  headerLeft: { flex: 1, flexDirection: "column", gap: 3 },
  headerRight: {
    width: 170,
    borderWidth: 2,
    borderColor: AMBER,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  logo: { height: 76, maxWidth: 220, objectFit: "contain", marginBottom: 5 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: AMBER },
  companyDetail: { fontSize: 10.5, color: "#374151" },
  rucBoxLabel: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  quoteLabel: { fontFamily: "Helvetica-Bold", fontSize: 22, color: AMBER },
  quoteNumber: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#111827" },
  quoteDate: { fontSize: 10.5, color: "#6b7280" },

  // ── Client table ─────────────────────────────────────────────────────────
  clientTable: { borderWidth: 1, borderColor: BORDER },
  clientRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER },
  clientRowLast: { flexDirection: "row" },
  cCell: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  cCellLast: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  label: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  cValue: { fontSize: 10.5 },

  // ── Intro ─────────────────────────────────────────────────────────────────
  intro: { fontSize: 11, color: "#374151" },

  // ── Products table ────────────────────────────────────────────────────────
  productsTable: { borderWidth: 1, borderColor: BORDER },
  thRow: {
    flexDirection: "row",
    backgroundColor: AMBER_LIGHT,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderColor: BORDER,
    textAlign: "center",
  },
  thLast: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 5,
    textAlign: "center",
  },
  tdRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  tdRowLast: { flexDirection: "row" },
  td: {
    fontSize: 10.5,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRightWidth: 1,
    borderColor: BORDER,
  },
  tdLast: {
    fontSize: 10.5,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },

  // ── Bottom: conditions + totals ───────────────────────────────────────────
  bottom: { flexDirection: "row", gap: 10 },
  condBox: {
    flex: 3,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 9,
    gap: 5,
  },
  condTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginBottom: 2 },
  condLine: { fontSize: 10.5 },
  totalsBox: {
    flex: 2,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 9,
    gap: 6,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 11 },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingTop: 5,
    marginTop: 2,
  },
  totalFinalText: { fontFamily: "Helvetica-Bold", fontSize: 13 },

  // ── Footer: advisor + banks ───────────────────────────────────────────────
  footer: { flexDirection: "row", gap: 14 },
  footerAdvisor: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    gap: 3,
  },
  footerBanks: {
    flex: 3,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    gap: 3,
  },
  footerTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 2 },
  footerText: { fontSize: 10.5 },

  // ── Brand logo band ───────────────────────────────────────────────────────
  brandBand: {
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },
  brandLogo: { height: 35, maxWidth: 95, objectFit: "contain" },
});

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number, sym: string) { return `${sym} ${n.toFixed(2)}`; }
function fmtQty(n: number) { return Number.isInteger(n) ? String(n) : n.toString(); }

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ── Table header row — extracted so it can be rendered twice (fixed repeat) ─
function TableHeader() {
  return (
    <View style={s.thRow} fixed>
      <Text style={[s.th, { width: COL.it }]}>It</Text>
      <Text style={[s.th, { width: COL.qty }]}>Cant.</Text>
      <Text style={[s.th, { width: COL.um }]}>U/M</Text>
      <Text style={[s.th, { flex: 1 }]}>Descripción</Text>
      <Text style={[s.th, { width: COL.vvu }]}>V.V. Unitario</Text>
      <Text style={[s.thLast, { width: COL.vv }]}>V. Venta</Text>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function QuotePDFDocument(props: QuotePDFProps) {
  const {
    quoteNumber, issueDate, currency, company, logoBase64, brandLogos,
    clientRuc, clientBusinessName, clientAddress, clientAttention,
    clientPhone, clientEmail, reference,
    paymentTerms, deliveryTime, offerValidity, deliveryPlace,
    items, subtotal, igv, total,
  } = props;

  const sym = currency === "USD" ? "US$" : "S/";
  const currencyLabel = currency === "USD" ? "Dólares Americanos" : "Nuevos Soles";
  const visibleBrands = (brandLogos ?? []).filter(b => b.logoBase64);

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={s.page}>

        {/* ── HEADER ────────────────────────────────────────────────────── */}
        <View style={s.header} wrap={false}>
          <View style={s.headerLeft}>
            {logoBase64 && <Image src={logoBase64} style={s.logo} />}
            <Text style={s.companyName}>{company.company_name}</Text>
            {company.trade_name
              ? <Text style={s.companyDetail}>{company.trade_name}</Text>
              : null}
            <Text style={s.companyDetail}>RUC: {company.ruc}</Text>
            {company.address && (
              <Text style={s.companyDetail}>
                {company.address}{company.district ? `, ${company.district}` : ""}
              </Text>
            )}
            {company.phone && <Text style={s.companyDetail}>Tel: {company.phone}</Text>}
            {company.email && <Text style={s.companyDetail}>{company.email}</Text>}
          </View>
          <View style={s.headerRight}>
            <Text style={s.rucBoxLabel}>RUC: {company.ruc}</Text>
            <Text style={s.quoteLabel}>COTIZACIÓN</Text>
            <Text style={s.quoteNumber}>Nro. {quoteNumber}</Text>
            <Text style={s.quoteDate}>{formatDate(issueDate)}</Text>
          </View>
        </View>

        {/* ── CLIENT ───────────────────────────────────────────────────── */}
        <View style={s.clientTable} wrap={false}>
          <View style={[s.clientRow, { backgroundColor: GRAY_BG }]}>
            <View style={[s.cCell, { flex: 2.2 }]}>
              <Text style={s.label}>Señores: </Text>
              <Text style={s.cValue}>{clientBusinessName}</Text>
            </View>
            <View style={s.cCell}>
              <Text style={s.label}>RUC: </Text>
              <Text style={s.cValue}>{clientRuc}</Text>
            </View>
            <View style={s.cCellLast}>
              <Text style={s.label}>Atención: </Text>
              <Text style={s.cValue}>{clientAttention}</Text>
            </View>
          </View>
          {clientAddress ? (
            <View style={[s.clientRow, {}]}>
              <View style={[s.cCell, { flex: 1, borderRightWidth: 0 }]}>
                <Text style={s.label}>Dirección: </Text>
                <Text style={s.cValue}>{clientAddress}</Text>
              </View>
            </View>
          ) : null}
          <View style={s.clientRowLast}>
            <View style={s.cCell}>
              <Text style={s.label}>Teléfono: </Text>
              <Text style={s.cValue}>{clientPhone}</Text>
            </View>
            <View style={s.cCell}>
              <Text style={s.label}>Moneda: </Text>
              <Text style={s.cValue}>{currencyLabel}</Text>
            </View>
            <View style={s.cCell}>
              <Text style={s.label}>Referencia: </Text>
              <Text style={s.cValue}>{reference}</Text>
            </View>
            <View style={s.cCellLast}>
              <Text style={s.label}>E-Mail: </Text>
              <Text style={s.cValue}>{clientEmail}</Text>
            </View>
          </View>
        </View>

        {/* ── INTRO ────────────────────────────────────────────────────── */}
        <Text style={s.intro}>
          Estimados señores: En atención a su amable solicitud nos es grato ofrecerles lo siguiente:
        </Text>

        {/* ── PRODUCTS TABLE ───────────────────────────────────────────── */}
        <View style={s.productsTable}>
          <TableHeader />
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <View
                key={item.id}
                style={isLast ? s.tdRowLast : s.tdRow}
                wrap={false}
              >
                <Text style={[s.td, { width: COL.it, textAlign: "center" }]}>
                  {item.position}
                </Text>
                <Text style={[s.td, { width: COL.qty, textAlign: "right" }]}>
                  {fmtQty(item.quantity)}
                </Text>
                <Text style={[s.td, { width: COL.um }]}>{item.unit}</Text>
                <Text style={[s.td, { flex: 1 }]}>{item.description}</Text>
                <Text style={[s.td, { width: COL.vvu, textAlign: "right" }]}>
                  {fmt(item.unitPrice, sym)}
                </Text>
                <Text style={[s.tdLast, { width: COL.vv, textAlign: "right" }]}>
                  {fmt(item.lineTotal, sym)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── CONDITIONS + TOTALS ───────────────────────────────────────── */}
        <View style={s.bottom} wrap={false}>
          <View style={s.condBox}>
            <Text style={s.condTitle}>CONDICIONES COMERCIALES</Text>
            {paymentTerms
              ? <Text style={s.condLine}><Text style={s.label}>Forma de Pago: </Text>{paymentTerms}</Text>
              : null}
            {deliveryTime
              ? <Text style={s.condLine}><Text style={s.label}>Tiempo de Entrega: </Text>{deliveryTime}</Text>
              : null}
            {offerValidity
              ? <Text style={s.condLine}><Text style={s.label}>Validez de Oferta: </Text>{offerValidity}</Text>
              : null}
            {deliveryPlace
              ? <Text style={s.condLine}><Text style={s.label}>Lugar de Entrega: </Text>{deliveryPlace}</Text>
              : null}
          </View>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text>Sub-Total:</Text>
              <Text>{fmt(subtotal, sym)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text>I.G.V. (18%):</Text>
              <Text>{fmt(igv, sym)}</Text>
            </View>
            <View style={s.totalFinal}>
              <Text style={s.totalFinalText}>Total:</Text>
              <Text style={s.totalFinalText}>{fmt(total, sym)}</Text>
            </View>
          </View>
        </View>

        {/* ── FOOTER: ADVISOR + BANKS ───────────────────────────────────── */}
        <View style={s.footer} wrap={false}>
          {(company.advisor_name || company.advisor_role || company.advisor_phone) && (
            <View style={s.footerAdvisor}>
              <Text style={s.footerTitle}>Asesor de Ventas</Text>
              {company.advisor_name && (
                <Text style={[s.footerText, { fontFamily: "Helvetica-Bold" }]}>
                  {company.advisor_name}
                </Text>
              )}
              {company.advisor_role && <Text style={s.footerText}>{company.advisor_role}</Text>}
              {company.advisor_phone && (
                <Text style={s.footerText}>Tel: {company.advisor_phone}</Text>
              )}
            </View>
          )}
          {company.bank_accounts.length > 0 && (
            <View style={s.footerBanks}>
              <Text style={s.footerTitle}>Datos Bancarios</Text>
              {company.bank_accounts.map((acc, i) => (
                <Text key={i} style={s.footerText}>
                  {acc.banco} | Cta. {acc.cuenta} | CCI {acc.cci} | {acc.moneda}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* ── BRAND LOGO BAND ───────────────────────────────────────────── */}
        {visibleBrands.length > 0 && (
          <View style={s.brandBand} wrap={false}>
            {visibleBrands.map(b => (
              <Image key={b.name} src={b.logoBase64!} style={s.brandLogo} />
            ))}
          </View>
        )}

      </Page>
    </Document>
  );
}
