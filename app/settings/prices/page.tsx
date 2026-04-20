"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Save, ClipboardCopy, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DEFAULT_PRICES } from "@/lib/prices";

const MONTHS_ES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i);
const CONCEPTS = ["ALMUERZO", "CENA", "ALMUERZO ESPECIAL", "CENA ESPECIAL"];

interface Group { id: string; name: string; }
interface GPEntry { price: number; effectiveFrom: string | null; dirty: boolean; }
interface PPEntry { name: string; price: number; effectiveFrom: string | null; dirty: boolean; }

export default function PricesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [groups, setGroups] = useState<Group[]>([]);
  const [localGP, setLocalGP] = useState<Record<string, GPEntry>>({});
  const [localPP, setLocalPP] = useState<Record<string, PPEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startOfMonth = `${monthStr}-01`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prices?month=${monthStr}`);
      if (!res.ok) throw new Error();
      const data = await res.json();

      setGroups(data.groups);

      const gpMap: Record<string, GPEntry> = {};
      for (const g of data.groups as Group[]) {
        for (const concept of CONCEPTS) {
          const key = `${g.id}|${concept}`;
          const val = data.groupPrices[key] as { price: number; effectiveFrom: string } | undefined;
          gpMap[key] = {
            price: val?.price ?? DEFAULT_PRICES[concept] ?? 0,
            effectiveFrom: val?.effectiveFrom ?? null,
            dirty: false,
          };
        }
      }
      setLocalGP(gpMap);

      const ppMap: Record<string, PPEntry> = {};
      for (const [id, val] of Object.entries(
        data.productPrices as Record<string, { name: string; price: number; effectiveFrom: string | null }>
      )) {
        ppMap[id] = { name: val.name, price: val.price, effectiveFrom: val.effectiveFrom, dirty: false };
      }
      setLocalPP(ppMap);
    } catch {
      toast.error("Error al cargar precios");
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { load(); }, [load]);

  function inheritedLabel(effectiveFrom: string | null): string | null {
    if (!effectiveFrom || effectiveFrom === startOfMonth) return null;
    const [y, m] = effectiveFrom.split("-");
    return `heredado de ${MONTHS_ES[Number(m)]} ${y}`;
  }

  function setGP(key: string, price: number) {
    setLocalGP((prev) => ({ ...prev, [key]: { ...prev[key], price, dirty: true } }));
  }

  function setPP(id: string, price: number) {
    setLocalPP((prev) => ({ ...prev, [id]: { ...prev[id], price, dirty: true } }));
  }

  async function save() {
    const gpDirty: Record<string, number> = {};
    for (const [key, e] of Object.entries(localGP)) {
      if (e.dirty) gpDirty[key] = e.price;
    }
    const ppDirty: Record<string, number> = {};
    for (const [id, e] of Object.entries(localPP)) {
      if (e.dirty) ppDirty[id] = e.price;
    }

    if (!Object.keys(gpDirty).length && !Object.keys(ppDirty).length) {
      toast("No hay cambios para guardar");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthStr, groupPrices: gpDirty, productPrices: ppDirty }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      toast.success(`Precios de ${MONTHS_ES[month]} ${year} guardados`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function copyFromPrev() {
    setCopying(true);
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthStr, copyFromPrev: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error");
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      toast.success(`Precios de ${MONTHS_ES[prevM]} ${prevY} copiados a ${MONTHS_ES[month]} ${year}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al copiar");
    } finally {
      setCopying(false);
    }
  }

  const hasDirty = Object.values(localGP).some((e) => e.dirty) || Object.values(localPP).some((e) => e.dirty);
  const productEntries = Object.entries(localPP).sort(([, a], [, b]) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Precios por mes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cada mes tiene sus propios precios. Si un mes no tiene precio propio, hereda del mes anterior más reciente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-md border border-input px-3 py-2 text-sm bg-white">
            {MONTHS_ES.slice(1).map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-input px-3 py-2 text-sm bg-white">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving || !hasDirty} className="bg-amber-700 hover:bg-amber-800 text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {saving ? "Guardando..." : "Guardar precios del mes"}
            </Button>
            <Button variant="outline" onClick={copyFromPrev} disabled={copying || saving}>
              {copying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardCopy className="h-4 w-4 mr-2" />}
              {copying ? "Copiando..." : "Copiar del mes anterior"}
            </Button>
          </div>

          {/* Group prices */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Precios por grupo — {MONTHS_ES[month]} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium pr-4">Grupo</th>
                      {CONCEPTS.map((c) => (
                        <th key={c} className="text-center py-2 font-medium px-3 min-w-[150px]">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.id} className="border-b last:border-0">
                        <td className="py-3 font-medium pr-4 whitespace-nowrap">{g.name}</td>
                        {CONCEPTS.map((concept) => {
                          const key = `${g.id}|${concept}`;
                          const entry = localGP[key];
                          const label = entry ? inheritedLabel(entry.effectiveFrom) : null;
                          return (
                            <td key={concept} className="py-3 px-3">
                              <div className="flex items-center gap-1 justify-center">
                                <span className="text-xs text-muted-foreground">S/.</span>
                                <input
                                  type="number"
                                  step="0.50"
                                  min={0}
                                  value={entry?.price ?? ""}
                                  onChange={(e) => setGP(key, Number(e.target.value))}
                                  className={`w-20 rounded border px-2 py-1 text-sm text-center ${
                                    entry?.dirty ? "border-amber-400 bg-amber-50" : "border-input"
                                  }`}
                                />
                              </div>
                              {label && (
                                <p className="text-[10px] text-muted-foreground text-center mt-0.5 leading-tight italic">
                                  {label}
                                </p>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Manual product prices */}
          {productEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Productos manuales — {MONTHS_ES[month]} {year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {productEntries.map(([id, entry]) => {
                    const label = inheritedLabel(entry.effectiveFrom);
                    return (
                      <div key={id} className="rounded-md border p-3">
                        <p className="text-sm font-medium mb-2">{entry.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">S/.</span>
                          <input
                            type="number"
                            step="0.50"
                            min={0}
                            value={entry.price}
                            onChange={(e) => setPP(id, Number(e.target.value))}
                            className={`w-20 rounded border px-2 py-1 text-sm text-center ${
                              entry.dirty ? "border-amber-400 bg-amber-50" : "border-input"
                            }`}
                          />
                        </div>
                        {label && (
                          <p className="text-[10px] text-muted-foreground mt-1 leading-tight italic">{label}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
