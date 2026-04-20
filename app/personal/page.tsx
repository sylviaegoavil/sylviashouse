"use client";

import React, { useEffect, useState, useCallback } from "react";
import { UserPlus, UserMinus, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface Worker {
  id: string;
  full_name: string;
  doc_number: string;
  group_id: string;
  groups: { name: string } | null;
}

interface Group {
  id: string;
  name: string;
}

interface WorkerRequest {
  id: string;
  request_type: "add" | "remove";
  status: "pending" | "approved" | "rejected";
  first_name: string | null;
  last_name: string | null;
  doc_number: string | null;
  reason: string | null;
  created_at: string;
  groups: { name: string } | null;
  workers: { full_name: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  approved: { label: "Aprobada", variant: "default" },
  rejected: { label: "Rechazada", variant: "destructive" },
};

export default function PersonalPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [myRequests, setMyRequests] = useState<WorkerRequest[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Alta form
  const [showAltaForm, setShowAltaForm] = useState(false);
  const [altaGroup, setAltaGroup] = useState("");
  const [altaFirstName, setAltaFirstName] = useState("");
  const [altaLastName, setAltaLastName] = useState("");
  const [altaDoc, setAltaDoc] = useState("");
  const [submittingAlta, setSubmittingAlta] = useState(false);

  // Baja confirmation
  const [bajaWorker, setBajaWorker] = useState<Worker | null>(null);
  const [submittingBaja, setSubmittingBaja] = useState(false);

  const loadWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("workers")
      .select("id, full_name, doc_number, group_id, groups(name)")
      .eq("is_active", true)
      .order("full_name");
    setWorkers((data ?? []) as Worker[]);
    setLoadingWorkers(false);
  }, []);

  const loadMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    const res = await fetch("/api/worker-requests?mine=true");
    if (res.ok) setMyRequests(await res.json());
    setLoadingRequests(false);
  }, []);

  useEffect(() => {
    async function loadGroups() {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
        if (data.length) setAltaGroup(data[0].id);
      }
    }
    loadGroups();
    loadWorkers();
    loadMyRequests();
  }, [loadWorkers, loadMyRequests]);

  async function submitAlta() {
    if (!altaFirstName.trim() || !altaLastName.trim() || !altaDoc.trim()) {
      toast.error("Completa todos los campos");
      return;
    }
    setSubmittingAlta(true);
    try {
      const res = await fetch("/api/worker-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: altaGroup,
          requestType: "add",
          firstName: altaFirstName.trim().toUpperCase(),
          lastName: altaLastName.trim().toUpperCase(),
          docNumber: altaDoc.trim(),
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Solicitud de alta enviada");
      setShowAltaForm(false);
      setAltaFirstName("");
      setAltaLastName("");
      setAltaDoc("");
      loadMyRequests();
    } finally {
      setSubmittingAlta(false);
    }
  }

  async function submitBaja() {
    if (!bajaWorker) return;
    setSubmittingBaja(true);
    try {
      const res = await fetch("/api/worker-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: bajaWorker.group_id,
          requestType: "remove",
          workerId: bajaWorker.id,
        }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Solicitud de baja enviada");
      setBajaWorker(null);
      loadMyRequests();
    } finally {
      setSubmittingBaja(false);
    }
  }

  const [filterGroup, setFilterGroup] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  const groupIds = new Set(groups.map((g) => g.id));
  const authorizedWorkers = groupIds.size > 0
    ? workers.filter((w) => groupIds.has(w.group_id))
    : workers;

  const filteredWorkers = authorizedWorkers.filter((w) => {
    if (filterGroup && w.group_id !== filterGroup) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!w.full_name.toLowerCase().includes(q) && !w.doc_number.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">Personal</h1>
        <p className="text-muted-foreground">Solicita altas y bajas de trabajadores.</p>
      </div>

      {/* Alta section */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-green-600" />
              Solicitar alta de trabajador
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setShowAltaForm(!showAltaForm)}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              {showAltaForm ? "Cancelar" : "Nueva solicitud"}
            </Button>
          </div>
        </CardHeader>
        {showAltaForm && (
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Grupo</label>
              <select
                value={altaGroup}
                onChange={(e) => setAltaGroup(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm"
              >
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Nombre</label>
                <input
                  value={altaFirstName}
                  onChange={(e) => setAltaFirstName(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm"
                  placeholder="JUAN"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Apellido</label>
                <input
                  value={altaLastName}
                  onChange={(e) => setAltaLastName(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm"
                  placeholder="PÉREZ"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">DNI / CE</label>
                <input
                  value={altaDoc}
                  onChange={(e) => setAltaDoc(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm"
                  placeholder="12345678"
                />
              </div>
            </div>
            <Button
              onClick={submitAlta}
              disabled={submittingAlta}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              {submittingAlta ? "Enviando..." : "Enviar solicitud de alta"}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Active workers list */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserMinus className="h-5 w-5 text-amber-700" />
            Trabajadores activos
          </h2>
          {!loadingWorkers && (
            <span className="text-sm text-muted-foreground">
              {filteredWorkers.length} trabajador{filteredWorkers.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="rounded-md border border-input px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">Todos los grupos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Buscar por nombre o DNI..."
            className="rounded-md border border-input px-3 py-2 text-sm flex-1 min-w-[200px]"
          />
        </div>

        {loadingWorkers ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : filteredWorkers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No hay trabajadores activos</div>
        ) : (
          <div className="space-y-2">
            {filteredWorkers.map((w) => (
              <Card key={w.id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">{w.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {w.doc_number} · {w.groups?.name ?? "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 h-7"
                      onClick={() => setBajaWorker(w)}
                    >
                      <UserMinus className="h-3 w-3 mr-1" />
                      Solicitar baja
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* My requests history */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-700" />
          Mis solicitudes
        </h2>
        {loadingRequests ? (
          <div className="text-center py-8 text-muted-foreground">Cargando...</div>
        ) : myRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No has enviado solicitudes</div>
        ) : (
          <div className="space-y-2">
            {myRequests.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {r.request_type === "add"
                          ? <UserPlus className="h-4 w-4 text-green-600" />
                          : <UserMinus className="h-4 w-4 text-red-600" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {r.request_type === "add" ? "Alta: " : "Baja: "}
                          {r.request_type === "add"
                            ? `${r.first_name ?? ""} ${r.last_name ?? ""} (${r.doc_number})`
                            : r.workers?.full_name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.groups?.name ?? "—"} · {new Date(r.created_at).toLocaleDateString("es-PE")}
                        </p>
                        {r.reason && <p className="text-xs text-muted-foreground mt-1">Motivo: {r.reason}</p>}
                      </div>
                    </div>
                    <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Baja confirmation modal */}
      {bajaWorker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Confirmar solicitud de baja</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                ¿Deseas solicitar la baja de{" "}
                <span className="font-semibold">{bajaWorker.full_name}</span>
                {" "}({bajaWorker.doc_number}) del grupo{" "}
                <span className="font-semibold">{bajaWorker.groups?.name ?? "—"}</span>?
              </p>
              <p className="text-xs text-muted-foreground">
                Esta solicitud quedará pendiente hasta que sea aprobada por un administrador.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={submitBaja}
                  disabled={submittingBaja}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {submittingBaja ? "Enviando..." : "Confirmar baja"}
                </Button>
                <Button variant="outline" onClick={() => setBajaWorker(null)}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
