"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import type { DuplicateInfo } from "@/lib/types";

interface DuplicateWarningProps {
  duplicates: DuplicateInfo[];
  open: boolean;
  onReplace: () => void;
  onCancel: () => void;
}

export function DuplicateWarning({
  duplicates,
  open,
  onReplace,
  onCancel,
}: DuplicateWarningProps) {
  // Group by date for a cleaner display
  const byDate = duplicates.reduce<Record<string, DuplicateInfo[]>>(
    (acc, dup) => {
      if (!acc[dup.date]) acc[dup.date] = [];
      acc[dup.date].push(dup);
      return acc;
    },
    {}
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Pedidos duplicados detectados
          </DialogTitle>
          <DialogDescription>
            Se encontraron {duplicates.length} pedidos que ya existen en la base
            de datos. Puedes reemplazarlos o cancelar para revisarlos.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Trabajador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, dups]) =>
                  dups.map((dup, i) => (
                    <TableRow key={`${date}-${i}`}>
                      {i === 0 && (
                        <TableCell
                          rowSpan={dups.length}
                          className="font-medium"
                        >
                          {date}
                        </TableCell>
                      )}
                      <TableCell>{dup.workerName}</TableCell>
                    </TableRow>
                  ))
                )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onReplace}>
            Reemplazar existentes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
