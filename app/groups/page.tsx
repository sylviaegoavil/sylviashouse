"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid } from "lucide-react";
import type { Group } from "@/lib/types";

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGroups(data);
      })
      .catch(() => toast.error("Error al cargar grupos"));
  }, []);

  // Group by excel_group
  const grouped = groups.reduce<Record<string, Group[]>>((acc, g) => {
    if (!acc[g.excel_group]) acc[g.excel_group] = [];
    acc[g.excel_group].push(g);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Grillas de Pedidos
        </h1>
        <p className="text-muted-foreground mt-1">
          Selecciona un grupo para ver la grilla de pedidos mensual
        </p>
      </div>

      {Object.entries(grouped).map(([excelGroup, groupList]) => (
        <div key={excelGroup} className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Excel: {excelGroup}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {groupList.map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`}>
                <Card className="h-full cursor-pointer transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {g.name}
                      <Badge variant="secondary">{g.excel_tab}</Badge>
                    </CardTitle>
                    <CardDescription>
                      Excel: {g.excel_group} / Pestana: {g.excel_tab}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
