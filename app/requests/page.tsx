"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, Clock, UserPlus, UserMinus, Building2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";

interface WorkerRequest {
  id: string;
  request_type: "add" | "remove";
  status: "pending" | "approved" | "rejected";
  first_name: string | null;
  last_name: string | null;
  doc_number: string | null;
  doc_type: string;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  groups: { id: string; name: string; clients: { name: string } | null } | null;
  workers: { full_name: string; doc_number: string } | null;
  user_profiles: { email: string; full_name: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  approved: { label: "Aprobada", variant: "default" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

export default function RequestsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "super_admin" || profile?.role === "client_admin";

  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const url = filter === "all" ? "/api/worker-requests" : `/api/worker-requests?status=${filter}`;
    const res = await fetch(url);
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function review(id: string, status: "approved" | "rejected") {
    const res = await fetch("/api/worker-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reason: reviewReason || undefined }),
    });
    if (res.ok) {
      toast.success(status === "approved" ? "Solicitud aprobada" : "Solicitud rechazada");
      setReviewingId(null);
      setReviewReason("");
      loadRequests();
    } else {
      toast.error((await res.json()).error);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Solicitudes de personal</h1>
        <p className="text-muted-foreground">
          {isAdmin ? "Gestiona las solicitudes de alta y baja de trabajadores." : "Historial de solicitudes."}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className={filter === f ? "bg-amber-700 hover:bg-amber-800 text-white" : ""}
          >
            {f === "pending" ? "Pendientes" : f === "approved" ? "Aprobadas" : f === "rejected" ? "Rechazadas" : "Todas"}
          </Button>
        ))}
      </div>

      {/* Request list */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No hay solicitudes</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {r.request_type === "add"
                        ? <UserPlus className="h-5 w-5 text-green-600" />
                        : <UserMinus className="h-5 w-5 text-red-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">
                        {r.request_type === "add" ? "Alta: " : "Baja: "}
                        {r.request_type === "add"
                          ? `${r.first_name ?? ""} ${r.last_name ?? ""} (${r.doc_number})`
                          : r.workers?.full_name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Grupo: {r.groups?.name ?? "—"} · {new Date(r.created_at).toLocaleDateString("es-PE")}
                      </p>
                      {r.groups?.clients?.name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3" />
                          {r.groups.clients.name}
                        </p>
                      )}
                      {r.user_profiles && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Solicitado por: {r.user_profiles.full_name} ({r.user_profiles.email})
                        </p>
                      )}
                      {r.reason && <p className="text-xs text-muted-foreground mt-1">Motivo: {r.reason}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                    {isAdmin && r.status === "pending" && (
                      reviewingId === r.id ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            placeholder="Motivo (opcional)"
                            value={reviewReason}
                            onChange={(e) => setReviewReason(e.target.value)}
                            className="rounded border border-input px-2 py-1 text-xs w-40"
                          />
                          <Button size="sm" onClick={() => review(r.id, "approved")}
                            className="bg-green-600 hover:bg-green-700 text-white h-7 px-2">
                            <CheckCircle className="h-3 w-3 mr-1" /> Aprobar
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => review(r.id, "rejected")} className="h-7 px-2">
                            <XCircle className="h-3 w-3 mr-1" /> Rechazar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setReviewingId(null)} className="h-7">✕</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setReviewingId(r.id)} className="h-7">
                          <Clock className="h-3 w-3 mr-1" /> Revisar
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
