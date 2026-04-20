"use client";

import React, { useCallback, useRef, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  accept: string; // e.g. ".txt" or ".xlsx"
  onFileSelect: (file: File) => void;
  label?: string;
  selectedFile?: File | null;
  onClear?: () => void;
}

export function FileUploader({
  accept,
  onFileSelect,
  label,
  selectedFile,
  onClear,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (accept.split(",").some((a) => a.trim() === ext)) {
          onFileSelect(file);
        }
      }
    },
    [accept, onFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <FileText className="h-8 w-8 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{selectedFile.name}</p>
          <p className="text-sm text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
        </div>
        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            aria-label="Quitar archivo"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        cursor-pointer rounded-lg border-2 border-dashed p-8
        text-center transition-colors
        ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />
      <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
      <p className="font-medium">
        {label || "Arrastra un archivo aqui o haz clic para seleccionar"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        Formato aceptado: {accept}
      </p>
    </div>
  );
}
