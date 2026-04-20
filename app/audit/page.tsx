"use client";

import React, { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  users: { email: string } | null;
}

const ACTION_COLOR: Record<string, string> = {
  upsert: "bg-blue-100 text-blue-800",
  delete: "bg-red-100 text-red-800",
  create: "bg-green-100 text-green-800",
  approved_request: "bg-emerald-100 text-emerald-800",
  rejected_request: "bg-orange-100 text-orange-800",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("audit_log")
        .select(`id, action, entity_type, entity_id, details, created_at, users(email)`)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      setEntries(data || []);
      setLoading(false);
    }
    load();
  }, [page]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
          <History className="h-7 w-7 text-amber-700" />
          Historial de cambios
        </h1>
        <p className="text-muted-foreground">Log de todas las acciones realizadas en el sistema.</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Sin registros de auditoría</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <Badge className={ACTION_COLOR[e.action] || "bg-gray-100 text-gray-800"}>
                      {e.action}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{e.entity_type}</p>
                      {e.details && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {JSON.stringify(e.details)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.users?.email ?? "Sistema"} · {new Date(e.created_at).toLocaleString("es-PE")}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          <div className="flex gap-2 justify-center pt-4">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted"
            >
              ← Anterior
            </button>
            <span className="px-3 py-1.5 text-sm">Página {page + 1}</span>
            <button
              disabled={entries.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
