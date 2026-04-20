"use client";

import React from "react";
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
import { CheckCircle, AlertTriangle, UserPlus, Package, Copy } from "lucide-react";
import type { ParsePreviewResult } from "@/lib/types";

interface ParsePreviewProps {
  preview: ParsePreviewResult;
}

export function ParsePreview({ preview }: ParsePreviewProps) {
  const { matched, unmatched, newWorkers, adicionales, errors, repeated, summary } =
    preview;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total pedidos</CardDescription>
            <CardTitle className="text-2xl">{summary.totalOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Emparejados</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {summary.matchedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sin emparejar</CardDescription>
            <CardTitle className="text-2xl text-amber-600">
              {summary.unmatchedCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Adicionales</CardDescription>
            <CardTitle className="text-2xl text-blue-600">
              {summary.adicionalesTotal}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className={summary.repeatedCount > 0 ? "border-orange-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Repetidos</CardDescription>
            <CardTitle className={`text-2xl ${summary.repeatedCount > 0 ? "text-orange-600" : ""}`}>
              {summary.repeatedCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="matched">
        <TabsList>
          <TabsTrigger value="matched" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Emparejados ({matched.length})
          </TabsTrigger>
          <TabsTrigger value="unmatched" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Sin emparejar ({unmatched.length})
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
              <CardTitle>Pedidos emparejados</CardTitle>
              <CardDescription>
                Estos pedidos fueron asociados a un trabajador
              </CardDescription>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matched.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {m.worker?.full_name ?? "—"}
                        </TableCell>
                        <TableCell>{m.worker?.doc_number || "—"}</TableCell>
                        <TableCell>{m.parsedOrder.date}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.matchType === "exact_dni"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {matchTypeLabel(m.matchType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.confidence >= 0.9
                                ? "default"
                                : m.confidence >= 0.7
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {Math.round(m.confidence * 100)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                          {m.parsedOrder.rawText}
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
                Estos pedidos no pudieron ser asociados a ningun trabajador
                registrado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Texto original</TableHead>
                      <TableHead>DNI detectado</TableHead>
                      <TableHead>Nombres detectados</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmatched.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {u.parsedOrder.rawText}
                        </TableCell>
                        <TableCell>
                          {u.parsedOrder.possibleDni || "—"}
                        </TableCell>
                        <TableCell>
                          {u.parsedOrder.possibleNames.join(", ") || "—"}
                        </TableCell>
                        <TableCell>{u.parsedOrder.date}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.errorMessage || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                        <TableCell className="font-medium">
                          {nw.name}
                        </TableCell>
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
              <CardTitle>Adicionales por fecha</CardTitle>
              <CardDescription>
                Pedidos adicionales detectados (no asociados a un trabajador
                especifico)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(adicionales).length === 0 ? (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Repeated tab */}
        <TabsContent value="repeated">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos repetidos</CardTitle>
              <CardDescription>
                Trabajadores con más de un pedido en el mismo día dentro de este TXT.
                Se incluyen todos en el guardado — revisa si son legítimos o errores.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {repeated.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No se detectaron pedidos repetidos
                </p>
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trabajador</TableHead>
                        <TableHead>DNI</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead>Pedidos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repeated.map((r, i) => (
                        <TableRow key={i} className="align-top">
                          <TableCell className="font-medium">{r.workerName}</TableCell>
                          <TableCell className="font-mono text-sm">{r.docNumber}</TableCell>
                          <TableCell>{r.date}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                              {r.count}x
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {r.orders.map((o, j) => (
                                <div key={j} className="text-sm">
                                  {o.timestamp && (
                                    <span className="text-muted-foreground mr-2 font-mono text-xs">
                                      {o.timestamp}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground">{o.rawText}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                      <TableCell className="font-mono text-sm">
                        {err.rawText}
                      </TableCell>
                      <TableCell>{err.date}</TableCell>
                      <TableCell>
                        <Badge variant="destructive">{err.errorType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {err.message}
                      </TableCell>
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
    case "exact_dni":
      return "DNI exacto";
    case "fuzzy_name":
      return "Nombre";
    case "partial_lastname":
      return "Apellido";
    case "partial_firstname":
      return "Nombre parcial";
    case "single_name":
      return "Nombre unico";
    default:
      return type;
  }
}
