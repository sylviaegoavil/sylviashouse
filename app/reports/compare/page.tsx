"use client";

import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTHS = [
  { value: 1, label: "Ene" }, { value: 2, label: "Feb" },
  { value: 3, label: "Mar" }, { value: 4, label: "Abr" },
  { value: 5, label: "May" }, { value: 6, label: "Jun" },
  { value: 7, label: "Jul" }, { value: 8, label: "Ago" },
  { value: 9, label: "Set" }, { value: 10, label: "Oct" },
  { value: 11, label: "Nov" }, { value: 12, label: "Dic" },
];

const FULL_MONTHS = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const GROUP_COLORS = ["#b45309", "#d97706", "#f59e0b", "#fbbf24", "#84cc16", "#22c55e"];

interface ChartPoint {
  day: number;
  [group: string]: number;
}

interface Group { id: string; name: string; excel_group: string; }

export default function ComparePage() {
  const [monthA, setMonthA] = useState(CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1);
  const [yearA, setYearA] = useState(CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR);
  const [monthB, setMonthB] = useState(CURRENT_MONTH);
  const [yearB, setYearB] = useState(CURRENT_YEAR);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dataA, setDataA] = useState<ChartPoint[]>([]);
  const [dataB, setDataB] = useState<ChartPoint[]>([]);
  const [totalsA, setTotalsA] = useState<Record<string, number>>({});
  const [totalsB, setTotalsB] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGroups() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.from("groups").select("id, name, excel_group").order("name");
      setGroups(data || []);
    }
    loadGroups();
  }, []);

  async function loadMonthData(year: number, month: number): Promise<{ points: ChartPoint[]; totals: Record<string, number> }> {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const supabase = createBrowserSupabaseClient();
    const _all: { group_id: string; order_date: string }[] = [];
    {
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: chunk } = await supabase
          .from("orders")
          .select("group_id, order_date")
          .gte("order_date", startDate)
          .lte("order_date", endDate)
          .range(from, from + PAGE - 1);
        if (chunk) _all.push(...chunk);
        if (!chunk || chunk.length < PAGE) break;
        from += PAGE;
      }
    }
    const orders = _all;

    const points: ChartPoint[] = [];
    const totals: Record<string, number> = {};

    for (let d = 1; d <= lastDay; d++) {
      const ds = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const point: ChartPoint = { day: d };
      for (const g of groups) {
        const count = (orders || []).filter((o) => o.group_id === g.id && o.order_date === ds).length;
        point[g.name] = count;
        totals[g.name] = (totals[g.name] || 0) + count;
      }
      points.push(point);
    }
    return { points, totals };
  }

  useEffect(() => {
    if (!groups.length) return;
    setLoading(true);
    Promise.all([
      loadMonthData(yearA, monthA),
      loadMonthData(yearB, monthB),
    ]).then(([a, b]) => {
      setDataA(a.points);
      setTotalsA(a.totals);
      setDataB(b.points);
      setTotalsB(b.totals);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, monthA, yearA, monthB, yearB]);

  const MonthPicker = ({ month, year, onMonthChange, onYearChange }: { month: number; year: number; onMonthChange: (v: number) => void; onYearChange: (v: number) => void; }) => (
    <div className="flex gap-2">
      <select value={month} onChange={(e) => onMonthChange(Number(e.target.value))}
        className="rounded border border-input px-2 py-1.5 text-sm">
        {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}
        className="rounded border border-input px-2 py-1.5 text-sm">
        {Array.from({ length: 10 }, (_, i) => 2026 + i).map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Comparador Mensual</h1>
        <p className="text-muted-foreground">Compara la evolución de pedidos entre dos meses.</p>
      </div>

      {/* Period selectors */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium mb-2">Mes A</p>
            <MonthPicker month={monthA} year={yearA} onMonthChange={setMonthA} onYearChange={setYearA} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium mb-2">Mes B</p>
            <MonthPicker month={monthB} year={yearB} onMonthChange={setMonthB} onYearChange={setYearB} />
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando...</div>
      ) : (
        <>
          {/* Totals comparison */}
          <Card className="mb-8">
            <CardHeader><CardTitle className="text-base">Totales por grupo</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Grupo</th>
                      <th className="text-center py-2">{FULL_MONTHS[monthA]} {yearA}</th>
                      <th className="text-center py-2">{FULL_MONTHS[monthB]} {yearB}</th>
                      <th className="text-center py-2">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => {
                      const a = totalsA[g.name] || 0;
                      const b = totalsB[g.name] || 0;
                      const diff = b - a;
                      return (
                        <tr key={g.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{g.name}</td>
                          <td className="py-2 text-center">{a}</td>
                          <td className="py-2 text-center">{b}</td>
                          <td className={`py-2 text-center font-medium ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            {diff > 0 ? "+" : ""}{diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {[
            { label: `${FULL_MONTHS[monthA]} ${yearA}`, data: dataA },
            { label: `${FULL_MONTHS[monthB]} ${yearB}`, data: dataB },
          ].map(({ label, data }) => (
            <Card key={label} className="mb-6">
              <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {groups.map((g, i) => (
                      <Bar key={g.id} dataKey={g.name} fill={GROUP_COLORS[i % GROUP_COLORS.length]} stackId="a" />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
