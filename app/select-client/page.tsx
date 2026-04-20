"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/AuthProvider";

interface ClientStats {
  groups: number;
  workers: number;
}

export default function SelectClientPage() {
  const router = useRouter();
  const { profile, clients, selectedClientId, selectClient, loading } = useAuth();
  const [stats, setStats] = useState<Record<string, ClientStats>>({});
  const [selecting, setSelecting] = useState<string | null>(null);

  // Redirect non-super_admin immediately
  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== "super_admin") {
      router.replace("/dashboard");
      return;
    }
    // Auto-select if only one active client
    const active = clients.filter((c) => c.is_active);
    if (active.length === 1) {
      selectClient(active[0].id).then(() => router.replace("/dashboard"));
      return;
    }
    // Load stats
    fetch("/api/admin/clients/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile, clients]);

  async function handleSelect(clientId: string) {
    setSelecting(clientId);
    await selectClient(clientId);
    router.push("/dashboard");
  }

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeClients = clients.filter((c) => c.is_active);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="text-center mb-10">
        <Building2 className="h-10 w-10 text-amber-700 mx-auto mb-3" />
        <h1 className="text-3xl font-bold tracking-tight">¿Qué cliente deseas gestionar?</h1>
        <p className="text-muted-foreground mt-2 text-sm">Selecciona un cliente para continuar</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {activeClients.map((client) => {
          const s = stats[client.id];
          const isSelected = client.id === selectedClientId;
          const isLoading = selecting === client.id;

          return (
            <button
              key={client.id}
              onClick={() => handleSelect(client.id)}
              disabled={selecting !== null}
              className="text-left w-full"
            >
              <Card className={`cursor-pointer transition-all hover:shadow-md hover:border-amber-400 ${
                isSelected ? "border-amber-500 ring-2 ring-amber-200" : ""
              } ${selecting !== null && !isLoading ? "opacity-50" : ""}`}>
                <CardContent className="pt-6 pb-6 px-6">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-lg font-bold leading-tight">{client.name}</p>
                      {client.ruc && (
                        <p className="text-xs text-muted-foreground mt-0.5">RUC: {client.ruc}</p>
                      )}
                    </div>
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-amber-700 shrink-0 mt-0.5" />
                    ) : isSelected ? (
                      <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full shrink-0">
                        Activo
                      </span>
                    ) : null}
                  </div>
                  {s ? (
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{s.groups}</span>{" "}
                        {s.groups === 1 ? "grupo" : "grupos"}
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">{s.workers}</span>{" "}
                        {s.workers === 1 ? "trabajador activo" : "trabajadores activos"}
                      </span>
                    </div>
                  ) : (
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                  )}
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
