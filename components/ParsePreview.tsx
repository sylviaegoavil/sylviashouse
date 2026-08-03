"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, AlertTriangle, UserPlus, Package, Copy, UserCheck } from "lucide-react";
import type { ParsePreviewResult, Worker, ParsedOrder, AdicionalRecord, MatchResult } from "@/lib/types";

interface ParsePreviewProps {
  preview: ParsePreviewResult;
  workers?: Worker[];
  manualAssignments?: Map<number, Worker>;
  onManualAssign?: (idx: number, worker: Worker | null) => void;
  discardedRepeated?: Set<string>; // key = "workerId|date"
  onToggleRepeated?: (key: string) => void;
  markedAsAdicional?: Set<number>; // indices in preview.matched (PRODUCCIÓN only)
  onToggleAdicional?: (idx: number) => void;
}

// ─── Suggestion helpers (client-side, mirrors matcher logic) ─────────────────

function normText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}

function dniDist1(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== 8) return false;
  let d = 0;
  for (let i = 0; i < 8; i++) { if (a[i] !== b[i]) d++; if (d > 1) return false; }
  return d === 1;
}

function dniTranspose1(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== 8) return false;
  for (let i = 0; i < 7; i++) {
    if (a[i] === b[i + 1] && a[i + 1] === b[i]) {
      if (a.slice(0, i) + b[i] + b[i + 1] + a.slice(i + 2) === b) return true;
    }
  }
  return false;
}

function getWorkerSuggestions(
  parsedOrder: ParsedOrder,
  workers: Worker[]
): Array<{ worker: Worker; reason: string }> {
  const suggestions: Array<{ worker: Worker; reason: string }> = [];
  const seen = new Set<string>();

  const dni = parsedOrder.possibleDni;

  if (dni && dni.length === 8) {
    for (const w of workers) {
      if (!w.doc_number || seen.has(w.id)) continue;
      if (dniDist1(dni, w.doc_number) || dniTranspose1(dni, w.doc_number)) {
        suggestions.push({ worker: w, reason: `DNI similar: ${w.doc_number} (1 dígito diferente)` });
        seen.add(w.id);
      }
    }
  }

  if (dni && dni.length === 7) {
    for (const w of workers) {
      if (!w.doc_number || seen.has(w.id)) continue;
      if (w.doc_number.startsWith(dni)) {
        suggestions.push({ worker: w, reason: `DNI incompleto → ${w.doc_number}` });
        seen.add(w.id);
      }
    }
  }

  if (parsedOrder.possibleNames.length > 0) {
    const orderTokens = parsedOrder.possibleNames
      .join(" ")
      .split(/\s+/)
      .map(normText)
      .filter((t) => t.length >= 3);
    if (orderTokens.length > 0) {
      for (const w of workers) {
        if (seen.has(w.id)) continue;
        const wTokens = normText(w.full_name).split(/\s+/);
        const count = orderTokens.filter((ot) =>
          wTokens.some((wt) => wt === ot || wt.startsWith(ot) || ot.startsWith(wt))
        ).length;
        if (count >= Math.min(2, orderTokens.length)) {
          suggestions.push({ worker: w, reason: `Nombre similar (${count} coincidencias)` });
          seen.add(w.id);
        }
      }
    }
  }

  return suggestions.slice(0, 5);
}

// ─── Assign widget for a single unmatched row ─────────────────────────────────

function AssignWidget({
  parsedOrder,
  workers,
  onAssign,
}: {
  parsedOrder: ParsedOrder;
  workers: Worker[];
  onAssign: (worker: Worker) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const suggestions = useMemo(
    () => getWorkerSuggestions(parsedOrder, workers),
    [parsedOrder, workers]
  );

  const filteredWorkers = useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = normText(search);
    return workers
      .filter((w) => normText(w.full_name).includes(q) || w.doc_number.includes(search))
      .slice(0, 10);
  }, [search, workers]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 whitespace-nowrap"
      >
        Asignar trabajador
      </button>
    );
  }

  return (
    <div className="space-y-2 min-w-[280px]">
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Sugerencias:</p>
          <div className="flex flex-col gap-1">
            {suggestions.map((s) => (
              <button
                key={s.worker.id}
                onClick={() => { onAssign(s.worker); setOpen(false); }}
                className="text-left text-xs px-2 py-1.5 rounded border border-border bg-white hover:bg-amber-50 flex flex-col gap-0.5"
              >
                <span className="font-medium text-sm">{s.worker.full_name}</span>
                <span className="text-muted-foreground">{s.reason}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-border my-2" />
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">Buscar por nombre o DNI:</p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="w-full rounded border border-input px-2 py-1.5 text-sm"
          autoFocus
        />
        {filteredWorkers.length > 0 && (
          <div className="mt-1 border border-border rounded max-h-36 overflow-auto">
            {filteredWorkers.map((w) => (
              <button
                key={w.id}
                onClick={() => { onAssign(w); setOpen(false); setSearch(""); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-3 border-b last:border-0"
              >
                <span className="font-mono text-xs text-muted-foreground shrink-0">{w.doc_number}</span>
                <span>{w.full_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => { setOpen(false); setSearch(""); }}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Cancelar
      </button>
    </div>
  );
}

// ─── Adicionales PRODUCCIÓN view ─────────────────────────────────────────────

function AdiccionalesProduccionView({
  adicionalesDetailed,
  markedAsAdicional,
  matchedOrders,
  onRestoreOrder,
  onMarkAsAdicional,
}: {
  adicionalesDetailed: AdicionalRecord[];
  markedAsAdicional?: Set<number>;
  matchedOrders: MatchResult[];
  onRestoreOrder?: (idx: number) => void;
  onMarkAsAdicional?: (idx: number) => void;
}) {
  // Orders with "adicional" in text that matched a worker and are NOT yet marked
  const pendingReview = matchedOrders
    .map((order, idx) => ({ order, idx }))
    .filter(({ order, idx }) =>
      order.parsedOrder.isAdditional &&
      order.worker !== null &&
      !(markedAsAdicional?.has(idx))
    );

  const markedRows = markedAsAdicional
    ? Array.from(markedAsAdicional)
        .map((idx) => ({ idx, order: matchedOrders[idx] }))
        .filter((r) => r.order?.worker)
    : [];

  const hasAny =
    adicionalesDetailed.length > 0 ||
    markedRows.length > 0 ||
    pendingReview.length > 0;

  if (!hasAny) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No se detectaron adicionales
      </p>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Section 1: Pedidos con "adicional" emparejados a un trabajador ── */}
      {pendingReview.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-semibold text-amber-700">
              Pedidos con &quot;adicional&quot; emparejados a un trabajador
            </p>
            <span className="bg-amber-100 text-amber-700 text-xs font-mono px-2 py-0.5 rounded-full">
              {pendingReview.length} para revisar
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Cuentan como pedido del trabajador por defecto. Márcalos como adicional solo si corresponde.
          </p>
          <div className="rounded border border-amber-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-amber-50/60 text-xs text-muted-foreground">
                  <th className="py-2 px-3 text-left font-medium w-28">Fecha</th>
                  <th className="py-2 px-3 text-left font-medium">Trabajador</th>
                  <th className="py-2 px-3 text-left font-medium w-28">DNI</th>
                  <th className="py-2 px-3 text-left font-medium">Texto original</th>
                  <th className="py-2 px-3 text-left font-medium w-40"></th>
                </tr>
              </thead>
              <tbody>
                {pendingReview.map(({ order, idx }) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-amber-50/30">
                    <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                      {order.parsedOrder.date}
                    </td>
                    <td className="py-2 px-3 font-medium text-sm">
                      {order.worker!.full_name}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                      {order.worker!.doc_number}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground max-w-[220px] truncate">
                      {order.parsedOrder.rawText}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => onMarkAsAdicional?.(idx)}
                        className="text-xs px-2.5 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                      >
                        Marcar como adicional
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Section 2: User-marked adicionales ── */}
      {markedRows.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-2">
            Marcados manualmente como adicional ({markedRows.length})
          </p>
          <div className="space-y-2">
            {markedRows.map(({ idx, order }) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/40 px-4 py-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium text-sm">{order.worker!.full_name}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {order.worker!.doc_number} · {order.parsedOrder.date}
                  </p>
                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                    {order.parsedOrder.rawText}
                  </p>
                </div>
                <button
                  onClick={() => onRestoreOrder?.(idx)}
                  className="text-xs px-3 py-1.5 rounded border border-green-400 text-green-700 hover:bg-green-50 whitespace-nowrap shrink-0"
                >
                  Restaurar pedido
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 3: Auto-detected adicionales from chat ── */}
      {adicionalesDetailed.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-muted-foreground mb-2">
            Detectados automáticamente ({adicionalesDetailed.length} registro{adicionalesDetailed.length !== 1 ? "s" : ""}, total {adicionalesDetailed.reduce((s, r) => s + r.count, 0)})
          </p>
          <div className="max-h-[300px] overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="py-2 px-3 text-left font-medium w-28">Fecha</th>
                  <th className="py-2 px-3 text-left font-medium w-12">Cant.</th>
                  <th className="py-2 px-3 text-left font-medium">Texto detectado</th>
                </tr>
              </thead>
              <tbody>
                {adicionalesDetailed.map((rec, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">{rec.date}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="bg-blue-100 text-blue-700 text-xs font-mono px-1.5 py-0.5 rounded">
                        {rec.count}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground text-xs break-words max-w-xs">
                      {rec.rawText.slice(0, 150)}{rec.rawText.length > 150 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ParsePreview({ preview, workers = [], manualAssignments, onManualAssign, discardedRepeated, onToggleRepeated, markedAsAdicional, onToggleAdicional }: ParsePreviewProps) {
  const { matched, unmatched, newWorkers, adicionales, adicionalesDetailed, errors, repeated, summary } =
    preview;

  const isProduccion = /PRODUCC/i.test(preview.groupName);

  const [activeTab, setActiveTab] = useState("matched");
  const [reviewOnly, setReviewOnly] = useState(false);

  const needsReviewCount = matched.filter((m) => m.confidence < 1).length;
  const assignedCount = manualAssignments?.size ?? 0;
  const effectiveUnmatched = unmatched.length - assignedCount;

  const discardedCount = discardedRepeated?.size ?? 0;
  const confirmedRepeatedCount = summary.repeatedCount - discardedCount;
  const markedAdicionalCount = markedAsAdicional?.size ?? 0;
  // Each discarded repeated or marked-as-adicional removes 1 order from the final save
  const effectiveMatchedCount = summary.matchedCount + assignedCount - discardedCount - markedAdicionalCount;
  const effectiveTotalCount = summary.totalOrders - discardedCount - markedAdicionalCount;
  const effectiveAdicionalesTotal = summary.adicionalesTotal + markedAdicionalCount;
  // PRODUCCIÓN: matched orders with "adicional" in text, not yet marked — shown in review section
  const pendingReviewCount = isProduccion
    ? matched.filter((m, idx) => m.parsedOrder.isAdditional && m.worker !== null && !(markedAsAdicional?.has(idx))).length
    : 0;

  const displayedMatched = reviewOnly
    ? matched.filter((m) => m.confidence < 1).sort((a, b) => a.confidence - b.confidence)
    : matched;

  function goToReview() {
    setActiveTab("matched");
    setReviewOnly(true);
  }

  return (
    <div className="space-y-6">
      {/* Summary cards — all clickable, lead to their respective tab */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total pedidos</CardDescription>
            <CardTitle className="text-2xl">{effectiveTotalCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer hover:bg-green-50/50 transition-colors"
          onClick={() => { setActiveTab("matched"); setReviewOnly(false); }}
        >
          <CardHeader className="pb-2">
            <CardDescription>Emparejados</CardDescription>
            <CardTitle className="text-2xl text-green-600">{effectiveMatchedCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card
          className={`transition-colors ${effectiveUnmatched > 0 ? "cursor-pointer hover:bg-amber-50/50" : ""}`}
          onClick={effectiveUnmatched > 0 ? () => setActiveTab("unmatched") : undefined}
        >
          <CardHeader className="pb-2">
            <CardDescription>Sin emparejar</CardDescription>
            <CardTitle className={`text-2xl ${effectiveUnmatched > 0 ? "text-amber-600" : ""}`}>
              {effectiveUnmatched}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card
          className={`transition-colors cursor-pointer ${
            pendingReviewCount > 0
              ? "border-amber-300 hover:bg-amber-50/50"
              : effectiveAdicionalesTotal > 0
              ? "hover:bg-blue-50/50"
              : "hover:bg-muted/30"
          }`}
          onClick={() => setActiveTab("adicionales")}
        >
          <CardHeader className="pb-2">
            <CardDescription>Adicionales</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{effectiveAdicionalesTotal}</CardTitle>
            {pendingReviewCount > 0 && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                ({pendingReviewCount} para revisar)
              </p>
            )}
          </CardHeader>
        </Card>

        <Card
          className={`transition-colors ${summary.repeatedCount > 0 ? "border-orange-300 cursor-pointer hover:bg-orange-50/50" : ""}`}
          onClick={summary.repeatedCount > 0 ? () => setActiveTab("repeated") : undefined}
        >
          <CardHeader className="pb-2">
            <CardDescription>Repetidos</CardDescription>
            <CardTitle className={`text-2xl ${summary.repeatedCount > 0 ? "text-orange-600" : ""}`}>
              {summary.repeatedCount}
            </CardTitle>
            {discardedCount > 0 && (
              <p className="text-xs text-muted-foreground">{discardedCount} descartado{discardedCount !== 1 ? "s" : ""}</p>
            )}
          </CardHeader>
        </Card>

        <Card
          className={`transition-colors ${needsReviewCount > 0 ? "border-yellow-300 cursor-pointer hover:bg-yellow-50/50" : ""}`}
          onClick={needsReviewCount > 0 ? goToReview : undefined}
        >
          <CardHeader className="pb-2">
            <CardDescription>Requieren revisión</CardDescription>
            <CardTitle className={`text-2xl ${needsReviewCount > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
              {needsReviewCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="matched" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Emparejados ({effectiveMatchedCount})
          </TabsTrigger>
          <TabsTrigger value="unmatched" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Sin emparejar ({effectiveUnmatched})
            {effectiveUnmatched > 0 && (
              <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-700">
                {effectiveUnmatched}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="new_workers" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Nuevos ({newWorkers.length})
          </TabsTrigger>
          <TabsTrigger value="adicionales" className="gap-2">
            <Package className="h-4 w-4" />
            Adicionales
          </TabsTrigger>
          <TabsTrigger value="repeated" className="gap-2">
            <Copy className="h-4 w-4" />
            Repetidos
            {summary.repeatedCount > 0 && (
              <Badge variant="secondary" className="ml-1 bg-orange-100 text-orange-700">
                {summary.repeatedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Matched tab */}
        <TabsContent value="matched">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Pedidos emparejados</CardTitle>
                  <CardDescription>
                    Estos pedidos fueron asociados a un trabajador
                  </CardDescription>
                </div>
                <div className="flex rounded-md border border-input overflow-hidden text-sm">
                  <button
                    onClick={() => setReviewOnly(false)}
                    className={`px-3 py-1.5 transition-colors ${!reviewOnly ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                  >
                    Todos ({effectiveMatchedCount})
                  </button>
                  <button
                    onClick={() => setReviewOnly(true)}
                    disabled={needsReviewCount === 0}
                    className={`px-3 py-1.5 border-l border-input transition-colors ${reviewOnly ? "bg-yellow-500 text-white font-medium" : "hover:bg-muted"} ${needsReviewCount === 0 ? "opacity-40 cursor-default" : ""}`}
                  >
                    Requieren revisión ({needsReviewCount})
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trabajador</TableHead>
                      <TableHead>DNI</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo match</TableHead>
                      <TableHead>Confianza</TableHead>
                      <TableHead>Texto original</TableHead>
                      {isProduccion && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedMatched.map((m, i) => {
                      const origIdx = matched.indexOf(m);
                      const isMarkedAdic = isProduccion && markedAsAdicional?.has(origIdx);
                      return (
                      <TableRow key={i} className={isMarkedAdic ? "opacity-50 bg-blue-50/40" : ""}>
                        <TableCell className="font-medium">
                          {m.worker?.full_name ?? "—"}
                        </TableCell>
                        <TableCell>{m.worker?.doc_number || "—"}</TableCell>
                        <TableCell>{m.parsedOrder.date}</TableCell>
                        <TableCell>
                          <Badge variant={m.matchType === "exact_dni" ? "default" : "secondary"}>
                            {matchTypeLabel(m.matchType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.confidence >= 0.9 ? "default"
                              : m.confidence >= 0.7 ? "secondary"
                              : "destructive"
                            }
                          >
                            {Math.round(m.confidence * 100)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                          {m.parsedOrder.rawText}
                          {m.parsedOrder.isAdditional && isProduccion && !isMarkedAdic && (
                            <span className="ml-1 text-xs text-blue-500">(dice "adicional")</span>
                          )}
                        </TableCell>
                        {isProduccion && (
                          <TableCell>
                            {m.parsedOrder.isAdditional && (
                              <button
                                onClick={() => onToggleAdicional?.(origIdx)}
                                className={`text-xs px-2 py-1 rounded border whitespace-nowrap transition-colors ${
                                  isMarkedAdic
                                    ? "border-green-400 text-green-700 hover:bg-green-50"
                                    : "border-blue-300 text-blue-700 hover:bg-blue-50"
                                }`}
                              >
                                {isMarkedAdic ? "Restaurar pedido" : "Marcar como adicional"}
                              </button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      );
                    })}
                    {/* Manual assignments shown at bottom of matched tab */}
                    {!reviewOnly && manualAssignments && Array.from(manualAssignments.entries()).map(([idx, worker]) => (
                      <TableRow key={`manual-${idx}`} className="bg-green-50/40">
                        <TableCell className="font-medium">{worker.full_name}</TableCell>
                        <TableCell>{worker.doc_number}</TableCell>
                        <TableCell>{unmatched[idx]?.parsedOrder.date}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-green-100 text-green-700">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Manual
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="default">100%</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                          {unmatched[idx]?.parsedOrder.rawText}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Unmatched tab */}
        <TabsContent value="unmatched">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos sin emparejar</CardTitle>
              <CardDescription>
                Estos pedidos no pudieron ser asociados automáticamente.
                {workers.length > 0 && " Puedes asignarlos manualmente antes de guardar."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: workers.length > 0 ? "30%" : "45%" }} />
                    {workers.length > 0 && <col style={{ width: "15%", minWidth: "140px" }} />}
                  </colgroup>
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 px-3 text-left font-medium">Texto original</th>
                      <th className="py-2 px-3 text-left font-medium">DNI</th>
                      <th className="py-2 px-3 text-left font-medium">Nombres detectados</th>
                      <th className="py-2 px-3 text-left font-medium">Fecha</th>
                      <th className="py-2 px-3 text-left font-medium">Error</th>
                      {workers.length > 0 && (
                        <th className="py-2 px-3 text-left font-medium sticky right-0 bg-card">Asignar</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {unmatched.map((u, idx) => {
                      const assigned = manualAssignments?.get(idx);
                      if (assigned) {
                        return (
                          <tr key={idx} className="border-b bg-green-50/40 align-top">
                            <td className="py-2 px-3 text-muted-foreground text-xs break-words">
                              {u.parsedOrder.rawText}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs">{u.parsedOrder.possibleDni || "—"}</td>
                            <td className="py-2 px-3 break-words">{u.parsedOrder.possibleNames.join(", ") || "—"}</td>
                            <td className="py-2 px-3 whitespace-nowrap">{u.parsedOrder.date}</td>
                            <td className="py-2 px-3">
                              <span className="text-green-700 font-medium text-sm flex items-center gap-1">
                                <UserCheck className="h-3.5 w-3.5 shrink-0" />
                                {assigned.full_name}
                              </span>
                            </td>
                            {workers.length > 0 && (
                              <td className="py-2 px-3 sticky right-0 bg-green-50/40">
                                <button
                                  onClick={() => onManualAssign?.(idx, null)}
                                  className="text-xs text-muted-foreground hover:text-destructive underline whitespace-nowrap"
                                >
                                  Desasignar
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      }
                      return (
                        <tr key={idx} className="border-b align-top hover:bg-muted/30">
                          <td className="py-2 px-3 font-medium break-words text-xs">
                            {u.parsedOrder.rawText}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs">{u.parsedOrder.possibleDni || "—"}</td>
                          <td className="py-2 px-3 break-words">{u.parsedOrder.possibleNames.join(", ") || "—"}</td>
                          <td className="py-2 px-3 whitespace-nowrap">{u.parsedOrder.date}</td>
                          <td className="py-2 px-3 text-muted-foreground break-words leading-snug">
                            {u.errorMessage || "—"}
                          </td>
                          {workers.length > 0 && (
                            <td className="py-2 px-3 sticky right-0 bg-card border-l border-border">
                              <AssignWidget
                                parsedOrder={u.parsedOrder}
                                workers={workers}
                                onAssign={(worker) => onManualAssign?.(idx, worker)}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* New workers tab */}
        <TabsContent value="new_workers">
          <Card>
            <CardHeader>
              <CardTitle>Nuevos trabajadores detectados</CardTitle>
              <CardDescription>
                Se detecto el anuncio de nuevo personal en el chat
              </CardDescription>
            </CardHeader>
            <CardContent>
              {newWorkers.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No se detectaron nuevos trabajadores
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>DNI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newWorkers.map((nw, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{nw.name}</TableCell>
                        <TableCell>{nw.docNumber || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Adicionales tab */}
        <TabsContent value="adicionales">
          <Card>
            <CardHeader>
              <CardTitle>Adicionales{isProduccion ? " — PRODUCCIÓN" : " por fecha"}</CardTitle>
              <CardDescription>
                {isProduccion
                  ? "Pedidos adicionales detectados individualmente. Los marcados desde el tab Emparejados aparecen abajo."
                  : "Pedidos adicionales detectados (no asociados a un trabajador específico)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isProduccion ? (
                <AdiccionalesProduccionView
                  adicionalesDetailed={adicionalesDetailed ?? []}
                  markedAsAdicional={markedAsAdicional}
                  matchedOrders={matched}
                  onRestoreOrder={onToggleAdicional}
                  onMarkAsAdicional={onToggleAdicional}
                />
              ) : (
                Object.keys(adicionales).length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No se detectaron adicionales
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cantidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(adicionales)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([date, count]) => (
                          <TableRow key={date}>
                            <TableCell className="font-medium">{date}</TableCell>
                            <TableCell>{count}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Repeated tab */}
        <TabsContent value="repeated">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Pedidos repetidos</CardTitle>
                  <CardDescription>
                    Trabajadores con más de un pedido el mismo día. Decide caso por caso si guardar los {summary.repeatedCount > 1 ? "dos" : "ambos"} o solo uno.
                  </CardDescription>
                </div>
                {repeated.length > 0 && (
                  <div className="text-sm text-muted-foreground flex gap-3">
                    <span>{summary.repeatedCount} repetido{summary.repeatedCount !== 1 ? "s" : ""}</span>
                    <span className="text-green-600">·  {confirmedRepeatedCount} confirmado{confirmedRepeatedCount !== 1 ? "s" : ""}</span>
                    {discardedCount > 0 && (
                      <span className="text-orange-600">· {discardedCount} descartado{discardedCount !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {repeated.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No se detectaron pedidos repetidos
                </p>
              ) : (
                <div className="max-h-[500px] overflow-auto space-y-3">
                  {repeated.map((r, i) => {
                    const key = `${r.workerId}|${r.date}`;
                    const isDiscarded = discardedRepeated?.has(key) ?? false;
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-4 transition-colors ${
                          isDiscarded
                            ? "border-orange-200 bg-orange-50/50"
                            : "border-green-200 bg-green-50/30"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          {/* Worker info */}
                          <div className="space-y-0.5">
                            <p className="font-medium">{r.workerName}</p>
                            <p className="text-xs font-mono text-muted-foreground">{r.docNumber} · {r.date}</p>
                          </div>
                          {/* Controls */}
                          <div className="flex items-center gap-2 shrink-0">
                            {isDiscarded ? (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                                Se guardará 1 pedido
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                Se guardarán {r.count} pedidos
                              </Badge>
                            )}
                            <button
                              onClick={() => onToggleRepeated?.(key)}
                              className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors ${
                                isDiscarded
                                  ? "border-green-400 text-green-700 hover:bg-green-50"
                                  : "border-orange-300 text-orange-700 hover:bg-orange-50"
                              }`}
                            >
                              {isDiscarded ? "Confirmar doble" : "Descartar duplicado"}
                            </button>
                          </div>
                        </div>
                        {/* Orders list */}
                        <div className="mt-3 space-y-1.5">
                          {r.orders.map((o, j) => {
                            const isDropped = isDiscarded && j > 0;
                            return (
                              <div
                                key={j}
                                className={`flex items-start gap-2 text-sm ${isDropped ? "opacity-40" : ""}`}
                              >
                                <span className={`shrink-0 text-xs font-mono px-1.5 py-0.5 rounded ${
                                  j === 0 ? "bg-green-100 text-green-700" : isDropped ? "bg-red-100 text-red-500" : "bg-orange-100 text-orange-700"
                                }`}>
                                  {j === 0 ? "1° " : isDropped ? "✕" : `${j + 1}°`}
                                </span>
                                {o.timestamp && (
                                  <span className="text-muted-foreground font-mono text-xs shrink-0 pt-0.5">
                                    {o.timestamp}
                                  </span>
                                )}
                                <span className={`text-muted-foreground ${isDropped ? "line-through" : ""}`}>
                                  {o.rawText}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Errors section */}
      {errors.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">
              Errores de parseo ({errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[200px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Texto</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Mensaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((err, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{err.rawText}</TableCell>
                      <TableCell>{err.date}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{err.errorType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{err.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function matchTypeLabel(type: string): string {
  switch (type) {
    case "exact_dni":      return "DNI exacto";
    case "approx_dni":     return "DNI aproximado";
    case "incomplete_dni": return "DNI incompleto";
    case "fuzzy_name":     return "Nombre";
    case "partial_lastname":  return "Apellido";
    case "partial_firstname": return "Nombre parcial";
    case "single_name":    return "Nombre único";
    case "manual":         return "Manual";
    default:               return type;
  }
}
