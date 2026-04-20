"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const ERROR_TYPE_LABELS: Record<string, string> = {
  wrong_dni: "DNI incorrecto",
  wrong_name: "Nombre incorrecto",
  missing_dni: "Falta DNI",
  missing_name: "Falta nombre",
  unmatched: "Sin coincidencia",
  bad_format: "Formato inválido",
};

const ERROR_TYPE_COLOR: Record<string, string> = {
  wrong_dni: "bg-red-100 text-red-800",
  wrong_name: "bg-orange-100 text-orange-800",
  missing_dni: "bg-yellow-100 text-yellow-800",
  missing_name: "bg-yellow-100 text-yellow-800",
  unmatched: "bg-gray-100 text-gray-800",
  bad_format: "bg-purple-100 text-purple-800",
};

interface ErrorRow {
  worker_id: string | null;
  raw_text: string;
  error_type: string;
  expected_value: string | null;
  actual_value: string | null;
  order_date: string;
  workers?: { full_name: string; doc_number: string } | null;
  groups?: { name: string } | null;
}

interface WorkerErrorCount {
  workerId: string | null;
  workerName: string;
  docNumber: string;
  groupName: string;
  count: number;
  errors: ErrorRow[];
}

export default function ErrorReportPage() {
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [ranking, setRanking] = useState<WorkerErrorCount[]>([]);
  const [selected, setSelected] = useState<WorkerErrorCount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from("parsing_errors")
        .select(`
          worker_id, raw_text, error_type, expected_value, actual_value, order_date,
          workers(full_name, doc_number),
          groups(name)
        `)
        .gte("order_date", startDate)
        .lte("order_date", endDate)
        .order("order_date");

      if (!error && data) {
        const map = new Map<string, WorkerErrorCount>();
        for (const e of data as unknown as ErrorRow[]) {
          const key = e.worker_id ?? `unmatched:${e.raw_text.slice(0, 30)}`;
          if (!map.has(key)) {
            map.set(key, {
              workerId: e.worker_id,
              workerName: e.workers?.full_name ?? "(Sin identificar)",
              docNumber: e.workers?.doc_number ?? "—",
              groupName: e.groups?.name ?? "—",
              count: 0,
              errors: [],
            });
          }
          const entry = map.get(key)!;
          entry.count++;
          entry.errors.push(e);
        }
        const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);
        setRanking(sorted);
      }
      setLoading(false);
    }
    load();
  }, [month, year]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Reporte de Errores</h1>
        <p className="text-muted-foreground">Trabajadores con más errores de pedido en el mes.</p>
      </div>

      {/* Filter */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4 flex gap-4 flex-wrap">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded border border-input px-3 py-2 text-sm">
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded border border-input px-3 py-2 text-sm">
            {[CURRENT_YEAR - 1, CURRENT_YEAR].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando...</div>
      ) : ranking.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Sin errores registrados este mes</div>
      ) : (
        <div className="space-y-3">
          {ranking.map((entry, idx) => (
            <Card
              key={entry.workerId ?? idx}
              className={`cursor-pointer transition-shadow hover:shadow-md ${selected === entry ? "ring-2 ring-amber-600" : ""}`}
              onClick={() => setSelected(selected === entry ? null : entry)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-amber-700 w-8 text-center">#{idx + 1}</span>
                    <div>
                      <p className="font-semibold">{entry.workerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.docNumber} · {entry.groupName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="font-bold text-orange-600 text-lg">{entry.count}</span>
                    <span className="text-sm text-muted-foreground">errores</span>
                  </div>
                </div>

                {selected === entry && (
                  <div className="mt-4 border-t pt-3 space-y-2">
                    {entry.errors.map((e, i) => (
                      <div key={i} className="rounded-md bg-muted/30 p-2 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded px-1.5 py-0.5 font-medium ${ERROR_TYPE_COLOR[e.error_type] || "bg-gray-100"}`}>
                            {ERROR_TYPE_LABELS[e.error_type] || e.error_type}
                          </span>
                          <span className="text-muted-foreground">{new Date(e.order_date + "T00:00:00").toLocaleDateString("es-PE")}</span>
                        </div>
                        <p className="font-mono text-xs text-foreground">{e.raw_text}</p>
                        {e.expected_value && (
                          <p className="text-muted-foreground mt-0.5">
                            Esperado: <span className="text-green-700">{e.expected_value}</span>
                            {e.actual_value && <> · Recibido: <span className="text-red-700">{e.actual_value}</span></>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
