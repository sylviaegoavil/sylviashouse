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
import { FileUploader } from "@/components/FileUploader";
import { GroupSelector } from "@/components/GroupSelector";
import { UploadModeSelector } from "@/components/UploadModeSelector";
import { ParsePreview } from "@/components/ParsePreview";
import { DuplicateWarning } from "@/components/DuplicateWarning";
import { Loader2, Send, CheckCircle } from "lucide-react";
import type {
  ParsePreviewResult,
  ProcessOrdersResult,
  UploadConfig,
  ConfirmedOrder,
  Group,
} from "@/lib/types";

export default function UploadPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>({
    mode: "full_file",
  });
  const [preview, setPreview] = useState<ParsePreviewResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDupWarning, setShowDupWarning] = useState(false);
  const [result, setResult] = useState<ProcessOrdersResult | null>(null);

  // Load groups on mount
  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGroups(data);
      })
      .catch(() => toast.error("Error al cargar grupos"));
  }, []);

  // Process file
  const handleProcess = useCallback(async () => {
    if (!file || !selectedGroupId) {
      toast.error("Selecciona un grupo y un archivo");
      return;
    }

    setProcessing(true);
    setPreview(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("groupId", selectedGroupId);
      formData.append("mode", uploadConfig.mode);
      if (uploadConfig.specificDate)
        formData.append("specificDate", uploadConfig.specificDate);
      if (uploadConfig.startDate)
        formData.append("startDate", uploadConfig.startDate);
      if (uploadConfig.endDate)
        formData.append("endDate", uploadConfig.endDate);

      const response = await fetch("/api/parse-txt", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Error al procesar el archivo");
        return;
      }

      setPreview(data as ParsePreviewResult);
      toast.success(
        `Procesado: ${data.summary.matchedCount} emparejados, ${data.summary.unmatchedCount} sin emparejar`
      );
    } catch (error) {
      toast.error("Error de conexion al procesar el archivo");
    } finally {
      setProcessing(false);
    }
  }, [file, selectedGroupId, uploadConfig]);

  // Save orders
  const handleSave = useCallback(
    async (replaceDuplicates: boolean) => {
      if (!preview) return;

      setSaving(true);
      setShowDupWarning(false);

      try {
        // Build confirmed orders from matched results
        const confirmedOrders: ConfirmedOrder[] = preview.matched
          .filter((m) => m.worker)
          .map((m) => ({
            workerId: m.worker!.id,
            date: m.parsedOrder.date,
            source: "whatsapp" as const,
            notes: m.parsedOrder.rawText,
            rawText: m.parsedOrder.rawText,
          }));

        const response = await fetch("/api/process-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: preview.groupId,
            fileName: preview.fileName,
            confirmedOrders,
            newWorkers: preview.newWorkers,
            adicionales: preview.adicionales,
            replaceDuplicates,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || "Error al guardar pedidos");
          return;
        }

        setResult(data as ProcessOrdersResult);
        toast.success(
          `Guardado: ${data.ordersCreated} pedidos creados, ${data.newWorkersAdded} nuevos trabajadores`
        );
      } catch (error) {
        toast.error("Error de conexion al guardar");
      } finally {
        setSaving(false);
      }
    },
    [preview]
  );

  // Confirm save — check for duplicates first
  const handleConfirmSave = useCallback(() => {
    if (!preview) return;
    if (preview.duplicates.length > 0) {
      setShowDupWarning(true);
    } else {
      handleSave(false);
    }
  }, [preview, handleSave]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subir archivo TXT</h1>
        <p className="text-muted-foreground mt-1">
          Sube el archivo TXT exportado de un grupo de WhatsApp para procesar
          los pedidos
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuracion</CardTitle>
          <CardDescription>
            Selecciona el grupo y el modo de procesamiento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <GroupSelector
            groups={groups}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
            label="Grupo de WhatsApp"
            placeholder="Seleccionar grupo..."
            id="upload-group"
          />

          <UploadModeSelector
            config={uploadConfig}
            onChange={setUploadConfig}
          />

          <FileUploader
            accept=".txt"
            onFileSelect={setFile}
            selectedFile={file}
            onClear={() => {
              setFile(null);
              setPreview(null);
              setResult(null);
            }}
            label="Arrastra el archivo TXT de WhatsApp aqui"
          />

          <Button
            onClick={handleProcess}
            disabled={!file || !selectedGroupId || processing}
            className="w-full"
            size="lg"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Procesar archivo
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview && !result && (
        <>
          <ParsePreview preview={preview} />

          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={saving || preview.matched.length === 0}
              size="lg"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirmar y guardar ({preview.matched.length} pedidos)
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-green-700">
              Pedidos guardados exitosamente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Pedidos creados: <strong>{result.ordersCreated}</strong></p>
            <p>Pedidos reemplazados: <strong>{result.ordersReplaced}</strong></p>
            <p>
              Nuevos trabajadores: <strong>{result.newWorkersAdded}</strong>
            </p>
            {result.errors.length > 0 && (
              <p className="text-destructive">
                Errores: <strong>{result.errors.length}</strong>
              </p>
            )}
            <div className="pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  setResult(null);
                }}
              >
                Procesar otro archivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Duplicate warning dialog */}
      {preview && (
        <DuplicateWarning
          duplicates={preview.duplicates}
          open={showDupWarning}
          onReplace={() => handleSave(true)}
          onCancel={() => setShowDupWarning(false)}
        />
      )}
    </div>
  );
}
