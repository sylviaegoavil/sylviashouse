"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import type { Group } from "@/lib/types";

interface GroupSelectorProps {
  groups: Group[];
  value: string;
  onChange: (groupId: string) => void;
  /** Label text. Defaults to "Grupo" */
  label?: string;
  /** Placeholder option text. Defaults to "Seleccionar grupo..." */
  placeholder?: string;
  /** Include an "all" option (value=""). Defaults to false */
  includeAll?: boolean;
  allLabel?: string;
  id?: string;
  className?: string;
}

export function GroupSelector({
  groups,
  value,
  onChange,
  label = "Grupo",
  placeholder = "Seleccionar grupo...",
  includeAll = false,
  allLabel = "Todos los grupos",
  id = "group-selector",
  className,
}: GroupSelectorProps) {
  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {includeAll ? (
          <option value="">{allLabel}</option>
        ) : (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
