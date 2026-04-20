"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileUploader } from "@/components/FileUploader";
import { GroupSelector } from "@/components/GroupSelector";
import { Loader2, Upload, CheckCircle } from "lucide-react";
import type { Group, WorkerImportPreview } from "@/lib/types";

export default function ImportWorkersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<WorkerImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Load groups — [] is correct: runs once on mount
  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGroups(data);
      })
      .catch(() => toast.error("Error al cargar grupos"));
  }, []);

  // Stable callbacks — prevents Base UI Select from re-running internal effects
  const handleGroupChange = useCallback((v: string) => {
    setSelectedGroupId(v);
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setPreview(null);
    setDone(false);
  }, []);

  // Preview
  const handlePreview = async () => {
    if (!file || !selectedGroupId) {
      toast.error("Selecciona un grupo y un archivo");
      return;
    }

    setLoading(true);
    setPreview(null);
    setDone(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("groupId", selectedGroupId);

      const response = await fetch("/api/import-workers", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Error al leer el archivo");
        return;
      }

      setPreview(data as WorkerImportPreview);
      toast.success(`${data.totalRows} trabajadores encontrados en el archivo`);
    } catch {
      toast.error("Error de conexion");
    } finally {
      setLoading(false);
    }
  };

  // Confirm import
  const handleConfirm = async () => {
    if (!file || !selectedGroupId) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("groupId", selectedGroupId);
      formData.append("confirm", "true");

      const response = await fetch("/api/import-workers", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Error al importar");
        return;
      }

      toast.success(
        `Importados: ${data.added} nuevos, ${data.skipped} existentes omitidos`
      );
      setDone(true);
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Importar trabajadores desde Excel
        </h1>
        <p className="text-muted-foreground mt-1">
          Sube un archivo Excel con los trabajadores. Columna B = DNI, Columna C
          = Nombre completo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuracion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <GroupSelector
            groups={groups}
            value={selectedGroupId}
            onChange={handleGroupChange}
            label="Grupo"
            placeholder="Seleccionar grupo..."
            id="import-group"
          />

          <FileUploader
            accept=".xlsx,.xls"
            onFileSelect={setFile}
            selectedFile={file}
            onClear={handleClear}
            label="Arrastra el archivo Excel aqui"
          />

          <Button
            onClick={handlePreview}
            disabled={!file || !selectedGroupId || loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Leyendo archivo...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Previsualizar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview && !done && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total en archivo</CardDescription>
                <CardTitle className="text-2xl">
                  {preview.totalRows}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Nuevos</CardDescription>
                <CardTitle className="text-2xl text-green-600">
                  {preview.newWorkers.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Ya existentes</CardDescription>
                <CardTitle className="text-2xl text-amber-600">
                  {preview.duplicates.length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trabajadores a importar</CardTitle>
              <CardDescription>
                Los trabajadores que ya existen en la base de datos seran
                omitidos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fila</TableHead>
                      <TableHead>DNI</TableHead>
                      <TableHead>Nombre completo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.workers.map((w) => {
                      const isDuplicate = preview.duplicates.some(
                        (d) => d.docNumber === w.docNumber
                      );
                      return (
                        <TableRow
                          key={w.rowNumber}
                          className={isDuplicate ? "opacity-50" : ""}
                        >
                          <TableCell>{w.rowNumber}</TableCell>
                          <TableCell className="font-mono">
                            {w.docNumber}
                          </TableCell>
                          <TableCell className="font-medium">
                            {w.fullName}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                isDuplicate ? "secondary" : "default"
                              }
                            >
                              {isDuplicate ? "Existente" : "Nuevo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={saving || preview.newWorkers.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirmar importacion ({preview.newWorkers.length} nuevos)
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Done */}
      {done && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-green-700">
              Importacion completada
            </CardTitle>
            <CardDescription>
              Los trabajadores han sido importados exitosamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setDone(false);
              }}
            >
              Importar otro archivo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
