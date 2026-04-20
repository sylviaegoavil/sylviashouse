"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UploadConfig, UploadMode } from "@/lib/types";

interface UploadModeSelectorProps {
  config: UploadConfig;
  onChange: (config: UploadConfig) => void;
}

export function UploadModeSelector({
  config,
  onChange,
}: UploadModeSelectorProps) {
  const handleModeChange = (mode: string) => {
    onChange({ ...config, mode: mode as UploadMode });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Modo de procesamiento</Label>
        <Select value={config.mode} onValueChange={(v) => v !== null && handleModeChange(v)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full_file">Archivo completo</SelectItem>
            <SelectItem value="specific_day">Dia especifico</SelectItem>
            <SelectItem value="date_range">Rango de fechas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.mode === "specific_day" && (
        <div>
          <Label>Fecha</Label>
          <Input
            type="date"
            className="mt-1"
            value={config.specificDate || ""}
            onChange={(e) =>
              onChange({ ...config, specificDate: e.target.value })
            }
          />
        </div>
      )}

      {config.mode === "date_range" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Desde</Label>
            <Input
              type="date"
              className="mt-1"
              value={config.startDate || ""}
              onChange={(e) =>
                onChange({ ...config, startDate: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input
              type="date"
              className="mt-1"
              value={config.endDate || ""}
              onChange={(e) =>
                onChange({ ...config, endDate: e.target.value })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
