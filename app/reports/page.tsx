"use client";

import React, { useState } from "react";
import { Download, FileSpreadsheet, Archive } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

const EXCEL_TYPES = [
  {
    key: "APT",
    label: "Excel APT",
    description: "Consolidado + Almuerzos APT + Cenas APT",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
  },
  {
    key: "PRODUCCION",
    label: "Excel Producción",
    description: "Consolidado + Producción + Staff (con gaseosas automáticas)",
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200",
  },
  {
    key: "PATIO",
    label: "Excel Patio",
    description: "Consolidado + Almuerzos Patio + Cenas Patio",
    color: "text-yellow-700",
    bg: "bg-yellow-50 border-yellow-200",
  },
];

export default function ReportsPage() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState<string | null>(null);

  const monthParam = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = MONTHS.find((m) => m.value === month)?.label ?? "";

  async function downloadExcel(excelType: string) {
    setLoading(excelType);
    try {
      const res = await fetch("/api/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelType, month: monthParam }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Error al generar Excel");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${excelType}_${monthLabel.toUpperCase()}_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Excel ${excelType} descargado`);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(null);
    }
  }

  async function downloadAll() {
    setLoading("ZIP");
    try {
      const res = await fetch("/api/export-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthParam }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Error al generar ZIP");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SylviasHouse_${monthLabel.toUpperCase()}_${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP descargado con los 3 Excel");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Reportes</h1>
        <p className="text-muted-foreground">Genera y descarga los Excel mensuales con consolidados e IGV.</p>
      </div>

      {/* Month/Year selector */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Seleccionar período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Mes</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Año</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Array.from({ length: 10 }, (_, i) => 2026 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="text-sm text-muted-foreground pt-6">
              Período: <strong>{monthLabel} {year}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excel download cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {EXCEL_TYPES.map((et) => (
          <div
            key={et.key}
            className={`rounded-lg border p-5 flex flex-col gap-3 ${et.bg}`}
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className={`h-5 w-5 ${et.color}`} />
              <span className={`font-semibold text-sm ${et.color}`}>{et.label}</span>
            </div>
            <p className="text-xs text-muted-foreground flex-1">{et.description}</p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={loading !== null}
              onClick={() => downloadExcel(et.key)}
            >
              {loading === et.key ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Generando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Descargar
                </span>
              )}
            </Button>
          </div>
        ))}
      </div>

      {/* Download all ZIP */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="font-semibold">Exportar todo el mes</p>
              <p className="text-sm text-muted-foreground">
                Descarga los 3 Excel en un solo archivo ZIP — {monthLabel} {year}
              </p>
            </div>
            <Button
              onClick={downloadAll}
              disabled={loading !== null}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              {loading === "ZIP" ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Generando ZIP...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Exportar ZIP
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
