"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Save, X } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  clients: { id: string; name: string }[];
}

interface ClientInfo { id: string; name: string; }

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  client_admin: "Admin Cliente",
  readonly: "Solo lectura",
};

export default function UsersAdminPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [allClients, setAllClients] = useState<ClientInfo[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editClientIds, setEditClientIds] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("client_admin");
  const [newPassword, setNewPassword] = useState("");
  const [newClientIds, setNewClientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile?.role !== "super_admin") router.replace("/dashboard");
  }, [profile, loading, router]);

  const loadData = useCallback(async () => {
    const [usersRes, clientsRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/clients"),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (clientsRes.ok) setAllClients(await clientsRes.json());
    setFetching(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function toggleClientId(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function createUser() {
    if (!newEmail || !newName || !newPassword) { toast.error("Completa todos los campos"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, full_name: newName, role: newRole, password: newPassword, clientIds: newClientIds }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Usuario creado");
      setShowAdd(false);
      setNewEmail(""); setNewName(""); setNewPassword(""); setNewClientIds([]);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, full_name: editName, role: editRole, clientIds: editClientIds }),
      });
      if (!res.ok) { toast.error((await res.json()).error); return; }
      toast.success("Usuario actualizado");
      setEditingId(null);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: UserRow) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    });
    if (res.ok) { toast.success(user.is_active ? "Desactivado" : "Activado"); loadData(); }
    else toast.error("Error al actualizar");
  }

  if (loading || fetching) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;
  if (profile?.role !== "super_admin") return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Usuarios</h1>
          <p className="text-muted-foreground">Gestiona los accesos al sistema.</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} className="bg-amber-700 hover:bg-amber-800 text-white">
          <Plus className="h-4 w-4 mr-2" /> Nuevo usuario
        </Button>
      </div>

      {showAdd && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Nuevo usuario</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Email *</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  className="rounded border border-input px-3 py-2 text-sm" placeholder="usuario@empresa.com" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Nombre completo *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="rounded border border-input px-3 py-2 text-sm" placeholder="JUAN PÉREZ" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Contraseña *</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded border border-input px-3 py-2 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Rol</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                  className="rounded border border-input px-3 py-2 text-sm">
                  <option value="super_admin">Super Admin</option>
                  <option value="client_admin">Admin Cliente</option>
                  <option value="readonly">Solo lectura</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Clientes asignados</label>
              <div className="flex flex-wrap gap-2">
                {allClients.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => toggleClientId(c.id, newClientIds, setNewClientIds)}
                    className={`rounded px-2 py-1 text-xs border transition-colors ${newClientIds.includes(c.id) ? "bg-amber-700 text-white border-amber-700" : "border-input hover:bg-muted"}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createUser} disabled={saving} className="bg-amber-700 hover:bg-amber-800 text-white">
                {saving ? "Creando..." : "Crear usuario"}
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground text-sm">Sin usuarios</p>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div key={u.id} className="px-4 py-3">
                  {editingId === u.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium">Nombre</label>
                          <input value={editName} onChange={(e) => setEditName(e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium">Rol</label>
                          <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                            className="rounded border border-input px-2 py-1 text-sm">
                            <option value="super_admin">Super Admin</option>
                            <option value="client_admin">Admin Cliente</option>
                            <option value="readonly">Solo lectura</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">Clientes</label>
                        <div className="flex flex-wrap gap-1">
                          {allClients.map((c) => (
                            <button key={c.id} type="button"
                              onClick={() => toggleClientId(c.id, editClientIds, setEditClientIds)}
                              className={`rounded px-2 py-0.5 text-xs border transition-colors ${editClientIds.includes(c.id) ? "bg-amber-700 text-white border-amber-700" : "border-input hover:bg-muted"}`}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(u.id)} disabled={saving} className="h-7">
                          <Save className="h-3 w-3 mr-1" /> Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        {u.clients.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {u.clients.map((c) => c.name).join(", ")}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      <Badge variant={u.is_active ? "default" : "secondary"}>
                        {u.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditingId(u.id);
                          setEditName(u.full_name);
                          setEditRole(u.role);
                          setEditClientIds(u.clients.map((c) => c.id));
                        }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => toggleActive(u)}>
                        {u.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
