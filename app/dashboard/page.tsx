"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle, CheckCircle, BarChart2, TrendingUp, Users, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";

const MONTHS_ES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const GROUP_COLORS = [
  "#d97706", "#ea580c", "#ca8a04", "#16a34a", "#0284c7", "#7c3aed",
  "#db2777", "#059669",
];

interface GroupInfo {
  id: string;
  name: string;
  excel_group: string;
}

interface OrderRow {
  group_id: string;
  order_date: string;
}

interface WorkerRow {
  id: string;
  full_name: string;
  doc_number: string;
  group_id: string;
}


const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i); // 2026–2035

async function fetchAllOrderPages(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  select: string,
  groupIds: string[],
  gte: string,
  lte: string,
): Promise<OrderRow[]> {
  const PAGE = 1000;
  const all: OrderRow[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("orders")
      .select(select)
      .in("group_id", groupIds)
      .gte("order_date", gte)
      .lte("order_date", lte)
      .range(from, from + PAGE - 1);
    if (data) all.push(...(data as unknown as OrderRow[]));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const isReadonly = profile?.role === "readonly";

  const nowRef = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(nowRef.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(nowRef.getMonth() + 1);
  const [inactiveMonths, setInactiveMonths] = useState(3);
  const [inactiveGroupFilter, setInactiveGroupFilter] = useState("");

  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [prevOrders, setPrevOrders] = useState<OrderRow[]>([]);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [lastOrderMap, setLastOrderMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingInactive, setLoadingInactive] = useState(false);
  // groupId → Set<"YYYY-MM-DD"> of no-order days for selected month
  const [noOrderDaysByGroup, setNoOrderDaysByGroup] = useState<Map<string, Set<string>>>(new Map());
  // groupId → { productName → totalQty }
  const [manualProductsByGroup, setManualProductsByGroup] = useState<Map<string, Record<string, number>>>(new Map());

  // Derived date values for selected month
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
  const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  // Previous month (for comparison chart + deadline alert when viewing current month)
  const prevMonthDate = new Date(selectedYear, selectedMonth - 2, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;
  const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
  const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevEndDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(prevDaysInMonth).padStart(2, "0")}`;

  // Effect 1: groups + current/prev month orders + workers
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();

      // Load groups first so we can filter orders by group_id
      const groupsRes = await fetch("/api/groups");
      if (cancelled) return;
      const groupsData: GroupInfo[] = groupsRes.ok ? await groupsRes.json() : [];
      const groupIds = groupsData.map((g) => g.id);
      setGroups(groupsData);

      if (groupIds.length === 0) {
        setOrders([]);
        setPrevOrders([]);
        setWorkers([]);
        setLoading(false);
        return;
      }

      // Fetch current month, previous month, workers, and no-order days in parallel
      const [currOrders, prevOrdersData, workersRes, nodRes, mpRes] = await Promise.all([
        fetchAllOrderPages(supabase, "group_id, order_date", groupIds, startDate, endDate),
        fetchAllOrderPages(supabase, "group_id, order_date", groupIds, prevStartDate, prevEndDate),
        supabase.from("workers").select("id, full_name, doc_number, group_id")
          .eq("is_active", true).in("group_id", groupIds).order("full_name"),
        supabase.from("no_order_days")
          .select("group_id, no_order_date")
          .in("group_id", groupIds)
          .gte("no_order_date", startDate)
          .lte("no_order_date", endDate),
        supabase.from("manual_products")
          .select("group_id, quantity, manual_product_types(name)")
          .in("group_id", groupIds)
          .gte("product_date", startDate)
          .lte("product_date", endDate),
      ]);

      if (cancelled) return;
      setOrders(currOrders);
      setPrevOrders(prevOrdersData);
      setWorkers(workersRes.data ?? []);

      // Build per-group map of no-order date strings
      const nodMap = new Map<string, Set<string>>();
      for (const row of nodRes.data ?? []) {
        if (!nodMap.has(row.group_id)) nodMap.set(row.group_id, new Set());
        nodMap.get(row.group_id)!.add(row.no_order_date);
      }
      setNoOrderDaysByGroup(nodMap);

      // Build per-group manual product totals: groupId → { productName → qty }
      const mpMap = new Map<string, Record<string, number>>();
      for (const row of mpRes.data ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name: string = (row as any).manual_product_types?.name ?? "?";
        if (!mpMap.has(row.group_id)) mpMap.set(row.group_id, {});
        const totals = mpMap.get(row.group_id)!;
        totals[name] = (totals[name] ?? 0) + row.quantity;
      }
      setManualProductsByGroup(mpMap);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth]);

  // Effect 2: inactive workers — reloads when groups or inactiveMonths changes
  useEffect(() => {
    if (groups.length === 0) return;
    let cancelled = false;
    async function loadInactive() {
      setLoadingInactive(true);
      const supabase = createBrowserSupabaseClient();
      const groupIds = groups.map((g) => g.id);

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - inactiveMonths);
      const cutoffStr = cutoff.toISOString().split("T")[0];

      const PAGE = 1000;
      const lom = new Map<string, string>();
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("orders")
          .select("worker_id, order_date")
          .in("group_id", groupIds)
          .gte("order_date", cutoffStr)
          .range(from, from + PAGE - 1);
        for (const o of data ?? []) {
          const existing = lom.get(o.worker_id);
          if (!existing || o.order_date > existing) lom.set(o.worker_id, o.order_date);
        }
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }

      if (cancelled) return;
      setLastOrderMap(lom);
      setLoadingInactive(false);
    }
    loadInactive();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, inactiveMonths]);

  // Progress metrics for selected month
  const workdays = daysInMonth;
  const daysLoaded = useMemo(() => {
    const allNoOrderDates = new Set<string>();
    for (const dates of noOrderDaysByGroup.values()) dates.forEach((d) => allNoOrderDates.add(d));
    const orderDates = new Set(orders.map((o) => o.order_date));
    return new Set([...orderDates, ...allNoOrderDates]).size;
  }, [orders, noOrderDaysByGroup]);
  const progressPct = workdays > 0 ? Math.round((daysLoaded / workdays) * 100) : 0;

  const progressColor = progressPct > 90 ? "bg-green-500" : progressPct >= 50 ? "bg-yellow-400" : "bg-red-500";
  const progressTextColor = progressPct > 90 ? "text-green-700" : progressPct >= 50 ? "text-yellow-700" : "text-red-700";
  const progressBg = progressPct > 90 ? "bg-green-50 border-green-200" : progressPct >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";

  const isCurrentMonth = selectedYear === nowRef.getFullYear() && selectedMonth === nowRef.getMonth() + 1;
  const selectedDateObj = new Date(selectedYear, selectedMonth - 1, 1);
  const isPastMonth = selectedDateObj < new Date(nowRef.getFullYear(), nowRef.getMonth(), 1);

  // Past month incomplete alert (shown in progress card)
  const showPastAlert = isPastMonth && progressPct < 100;
  const missingDays = workdays - daysLoaded;
  const deadlineMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
  const deadlineYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;

  // Deadline banner: admin only, first 10 days of month, previous month < 100%, viewing current month
  const prevWorkdays = prevDaysInMonth;
  const prevDaysLoaded = useMemo(() => new Set(prevOrders.map((o) => o.order_date)).size, [prevOrders]);
  const prevProgressPct = prevWorkdays > 0 ? Math.round((prevDaysLoaded / prevWorkdays) * 100) : 100;
  const prevMissingDays = prevWorkdays - prevDaysLoaded;
  const showDeadlineBanner = !isReadonly && isCurrentMonth && nowRef.getDate() <= 10 && prevProgressPct < 100;

  // Group summary cards
  const groupCards = useMemo(() => groups.map((g) => {
    const gOrders = orders.filter((o) => o.group_id === g.id);
    const gOrderDates = new Set(gOrders.map((o) => o.order_date));
    const gNoOrderDates = noOrderDaysByGroup.get(g.id) ?? new Set<string>();
    const gDays = new Set([...gOrderDates, ...gNoOrderDates]).size;
    const gManualProducts = manualProductsByGroup.get(g.id) ?? {};
    return { ...g, orderCount: gOrders.length, daysLoaded: gDays, isComplete: gDays >= workdays, manualProducts: gManualProducts };
  }), [groups, orders, noOrderDaysByGroup, manualProductsByGroup, workdays]);

  // Stacked bar chart data (per day)
  const barData = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const row: Record<string, string | number> = { day: d };
      for (const g of groups) {
        row[g.name] = orders.filter(
          (o) => o.group_id === g.id && parseInt(o.order_date.split("-")[2], 10) === d
        ).length;
      }
      return row;
    });
  }, [orders, groups, daysInMonth]);

  // Days with zero orders (before today if current month)
  const missingWorkdays = useMemo(() => {
    const limit = isCurrentMonth ? nowRef.getDate() : daysInMonth;
    return Array.from({ length: limit }, (_, i) => i + 1).filter((d) => {
      const total = groups.reduce((s, g) => s + (Number(barData[d - 1]?.[g.name]) || 0), 0);
      return total === 0;
    });
  }, [barData, groups, daysInMonth, isCurrentMonth, nowRef]);

  // Line chart data (daily totals, selected vs previous month)
  const lineData = useMemo(() => {
    const maxDays = Math.max(daysInMonth, prevDaysInMonth);
    return Array.from({ length: maxDays }, (_, i) => {
      const d = i + 1;
      const curr = orders.filter((o) => parseInt(o.order_date.split("-")[2], 10) === d).length;
      const prev = prevOrders.filter((o) => parseInt(o.order_date.split("-")[2], 10) === d).length;
      return { day: d, current: curr > 0 || d <= daysInMonth ? curr : null, previous: prev > 0 || d <= prevDaysInMonth ? prev : null };
    });
  }, [orders, prevOrders, daysInMonth, prevDaysInMonth]);

  const totalCurrent = orders.length;
  const totalPrev = prevOrders.length;
  const diffPct = totalPrev > 0 ? (((totalCurrent - totalPrev) / totalPrev) * 100).toFixed(1) : null;

  // Inactive workers
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - inactiveMonths);
    return d.toISOString().split("T")[0];
  }, [inactiveMonths]);

  const inactiveWorkers = useMemo(() => {
    return workers
      .filter((w) => {
        const last = lastOrderMap.get(w.id);
        return !last || last < cutoffDate;
      })
      .map((w) => ({
        ...w,
        groupName: groups.find((g) => g.id === w.group_id)?.name ?? "—",
        lastOrder: lastOrderMap.get(w.id) ?? null,
      }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.full_name.localeCompare(b.full_name));
  }, [workers, lastOrderMap, cutoffDate, groups]);

  const filteredInactiveWorkers = useMemo(() =>
    inactiveGroupFilter
      ? inactiveWorkers.filter((w) => w.group_id === inactiveGroupFilter)
      : inactiveWorkers,
  [inactiveWorkers, inactiveGroupFilter]);

  const inactiveByGroup = useMemo(() => {
    return filteredInactiveWorkers.reduce<Record<string, typeof filteredInactiveWorkers>>((acc, w) => {
      (acc[w.groupName] ??= []).push(w);
      return acc;
    }, {});
  }, [filteredInactiveWorkers]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">

      {/* Deadline banner */}
      {showDeadlineBanner && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">
            <span className="font-semibold">Recordatorio:</span> La información de {MONTHS_ES[prevMonth]} {prevYear}{" "}
            debe estar lista antes del 10 de {MONTHS_ES[nowRef.getMonth() + 1]}.
            {prevMissingDays > 0 && (
              <span> Faltan <span className="font-semibold">{prevMissingDays} día{prevMissingDays > 1 ? "s" : ""}</span> por cargar.</span>
            )}
          </p>
        </div>
      )}

      {/* Header + month selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visión general del sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="rounded-md border border-input px-3 py-2 text-sm bg-white"
          >
            {MONTHS_ES.slice(1).map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-md border border-input px-3 py-2 text-sm bg-white"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Month progress bar */}
      <Card className={`border ${progressBg}`}>
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="font-semibold">
              {MONTHS_ES[selectedMonth]} {selectedYear} — {progressPct}% completado
            </p>
            <span className={`text-sm font-medium ${progressTextColor}`}>
              {daysLoaded} de {workdays} días cargados
            </span>
          </div>
          <div className="w-full h-3 bg-white/70 rounded-full overflow-hidden border border-white/50">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {showPastAlert && missingDays > 0 && (
            <p className="text-sm text-red-700 mt-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Faltan <strong>{missingDays} día{missingDays > 1 ? "s" : ""}</strong> por cargar para{" "}
              {MONTHS_ES[selectedMonth]}. Fecha límite de entrega: 10 de {MONTHS_ES[deadlineMonth]} {deadlineYear}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Group cards */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando datos...</div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-amber-700" />
              Resumen por grupo
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupCards.map((g, i) => {
                const color = GROUP_COLORS[i % GROUP_COLORS.length];
                const pct = workdays > 0 ? Math.min(100, (g.daysLoaded / workdays) * 100) : 0;
                return (
                  <Link key={g.id} href={`/groups/${g.id}`}>
                    <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between mb-3 gap-2">
                          <p className="font-bold text-sm leading-snug">{g.name}</p>
                          {g.isComplete ? (
                            <Badge className="bg-green-100 text-green-700 border-0 shrink-0 text-xs">✓ Completo</Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-700 border-0 shrink-0 text-xs">⏳ Pendiente</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Pedidos</p>
                            <p className="font-bold text-2xl" style={{ color }}>{g.orderCount.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Días cargados</p>
                            <p className="font-bold text-2xl">
                              {g.daysLoaded}
                              <span className="text-sm font-normal text-muted-foreground">/{workdays}</span>
                            </p>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${g.isComplete ? "bg-green-500" : "bg-yellow-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {Object.keys(g.manualProducts).length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                            {Object.entries(g.manualProducts).map(([name, qty]) => `${name}: ${qty}`).join("  ·  ")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Stacked bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-amber-700" />
                Pedidos por día — {MONTHS_ES[selectedMonth]} {selectedYear}
              </CardTitle>
              {missingWorkdays.length > 0 && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Sin datos: días {missingWorkdays.join(", ")}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {groups.map((g, i) => (
                    <Bar
                      key={g.id}
                      dataKey={g.name}
                      stackId="a"
                      fill={GROUP_COLORS[i % GROUP_COLORS.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Line chart: comparison */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-700" />
                  Comparativo mensual
                </CardTitle>
                <div className="text-xs space-y-0.5 text-right">
                  <p>
                    <span className="font-semibold" style={{ color: "#d97706" }}>
                      {MONTHS_ES[selectedMonth]} {selectedYear}:
                    </span>{" "}
                    {totalCurrent.toLocaleString()} pedidos
                  </p>
                  <p>
                    <span className="font-semibold text-gray-400">
                      {MONTHS_ES[prevMonth]} {prevYear}:
                    </span>{" "}
                    {totalPrev.toLocaleString()} pedidos
                    {diffPct && (
                      <span className={parseFloat(diffPct) >= 0 ? "text-green-600 ml-1" : "text-red-600 ml-1"}>
                        ({parseFloat(diffPct) >= 0 ? "+" : ""}{diffPct}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={lineData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name={`${MONTHS_ES[selectedMonth]} ${selectedYear}`}
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="previous"
                    name={`${MONTHS_ES[prevMonth]} ${prevYear}`}
                    stroke="#9ca3af"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 3"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Inactive workers */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-amber-700" />
                Trabajadores sin actividad
                {filteredInactiveWorkers.length > 0 && (
                  <Badge variant="secondary">{filteredInactiveWorkers.length}</Badge>
                )}
              </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <select
                  value={inactiveGroupFilter}
                  onChange={(e) => setInactiveGroupFilter(e.target.value)}
                  className="rounded-md border border-input px-2 py-1 text-sm bg-white"
                >
                  <option value="">Todos los grupos</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <span>·</span>
                <span>Sin pedidos en los últimos</span>
                <select
                  value={inactiveMonths}
                  onChange={(e) => setInactiveMonths(Number(e.target.value))}
                  className="rounded-md border border-input px-2 py-1 text-sm bg-white"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? "mes" : "meses"}</option>
                  ))}
                </select>
              </div>
            </div>

            {loadingInactive ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Cargando...</div>
            ) : inactiveWorkers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  Todos los trabajadores tienen actividad reciente
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {Object.entries(inactiveByGroup).map(([groupName, ws]) => (
                  <Card key={groupName}>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm text-muted-foreground font-semibold">
                        {groupName} — {ws.length} trabajador{ws.length !== 1 ? "es" : ""}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3">
                      <div className="divide-y divide-border">
                        {ws.map((w) => (
                          <div key={w.id} className="flex items-center justify-between py-2">
                            <div>
                              <p className="text-sm font-medium">{w.full_name}</p>
                              <p className="text-xs text-muted-foreground">{w.doc_number}</p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {w.lastOrder
                                ? `Último pedido: ${new Date(w.lastOrder + "T12:00:00").toLocaleDateString("es-PE")}`
                                : "Nunca"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
