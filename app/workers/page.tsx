"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GroupSelector } from "@/components/GroupSelector";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Plus,
  Upload,
  Edit,
  UserCheck,
  UserX,
} from "lucide-react";
import type { Group, Worker } from "@/lib/types";

export default function WorkersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Add/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    doc_number: "",
    doc_type: "DNI" as "DNI" | "CE",
  });

  // Load groups
  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGroups(data);
      })
      .catch(() => toast.error("Error al cargar grupos"));
  }, []);

  // Load workers
  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedGroupId) params.set("groupId", selectedGroupId);
      if (search) params.set("search", search);

      const response = await fetch(`/api/workers?${params}`);
      const data = await response.json();

      if (Array.isArray(data)) {
        setWorkers(data);
      }
    } catch {
      toast.error("Error al cargar trabajadores");
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, search]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  // Open add dialog
  const handleAdd = () => {
    setEditingWorker(null);
    setFormData({
      full_name: "",
      doc_number: "",
      doc_type: "DNI",
    });
    setDialogOpen(true);
  };

  // Open edit dialog
  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
    setFormData({
      full_name: worker.full_name,
      doc_number: worker.doc_number,
      doc_type: worker.doc_type,
    });
    setDialogOpen(true);
  };

  // Save worker
  const handleSave = async () => {
    if (!selectedGroupId && !editingWorker) {
      toast.error("Selecciona un grupo primero");
      return;
    }

    try {
      if (editingWorker) {
        // Update
        const response = await fetch("/api/workers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingWorker.id,
            ...formData,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Error al actualizar");
          return;
        }
        toast.success("Trabajador actualizado");
      } else {
        // Create
        const response = await fetch("/api/workers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            group_id: selectedGroupId,
            ...formData,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Error al crear");
          return;
        }
        toast.success("Trabajador creado");
      }

      setDialogOpen(false);
      loadWorkers();
    } catch {
      toast.error("Error de conexion");
    }
  };

  // Toggle active
  const handleToggleActive = async (worker: Worker) => {
    try {
      const response = await fetch("/api/workers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: worker.id,
          is_active: !worker.is_active,
        }),
      });
      if (response.ok) {
        toast.success(
          worker.is_active
            ? "Trabajador desactivado"
            : "Trabajador activado"
        );
        loadWorkers();
      }
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trabajadores</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los trabajadores de cada grupo
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/workers/import">
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" />
              Importar Excel
            </Button>
          </Link>
          <Button onClick={handleAdd} disabled={!selectedGroupId}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="w-[250px]">
              <GroupSelector
                groups={groups}
                value={selectedGroupId}
                onChange={setSelectedGroupId}
                label=""
                includeAll
                allLabel="Todos los grupos"
                id="workers-group"
              />
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre o DNI (separar con comas para varios)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workers table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {workers.length} trabajador{workers.length !== 1 ? "es" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DNI</TableHead>
                  <TableHead>Nombre completo</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {loading
                        ? "Cargando..."
                        : "No se encontraron trabajadores"}
                    </TableCell>
                  </TableRow>
                )}
                {workers.map((w) => (
                  <TableRow
                    key={w.id}
                    className={!w.is_active ? "opacity-50" : ""}
                  >
                    <TableCell className="font-mono">{w.doc_number}</TableCell>
                    <TableCell className="font-medium">{w.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {groups.find((g) => g.id === w.group_id)?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{w.doc_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={w.is_active ? "default" : "destructive"}
                      >
                        {w.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(w)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(w)}
                        >
                          {w.is_active ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? "Editar trabajador" : "Agregar trabajador"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="full-name">Nombre completo</Label>
              <Input
                id="full-name"
                className="mt-1"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value.toUpperCase() })
                }
                placeholder="NOMBRE APELLIDO"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Numero de documento</Label>
                <Input
                  className="mt-1"
                  value={formData.doc_number}
                  onChange={(e) =>
                    setFormData({ ...formData, doc_number: e.target.value })
                  }
                  placeholder="12345678"
                  maxLength={9}
                />
              </div>
              <div>
                <Label htmlFor="doc-type">Tipo de documento</Label>
                <select
                  id="doc-type"
                  value={formData.doc_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      doc_type: e.target.value as "DNI" | "CE",
                    })
                  }
                  className="mt-1 w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                </select>
              </div>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingWorker ? "Guardar cambios" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
