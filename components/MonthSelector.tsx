"use client";

import React from "react";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const YEARS = Array.from({ length: 10 }, (_, i) => 2026 + i); // 2026–2035

interface MonthSelectorProps {
  value: string; // "YYYY-MM"
  onChange: (value: string) => void;
}

export function MonthSelector({ value, onChange }: MonthSelectorProps) {
  const [year, month] = value.split("-").map(Number);

  const cls = "rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(e) => onChange(`${year}-${String(Number(e.target.value)).padStart(2, "0")}`)}
        className={cls}
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onChange(`${e.target.value}-${String(month).padStart(2, "0")}`)}
        className={cls}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
