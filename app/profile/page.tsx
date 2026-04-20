"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, KeyRound } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  client_admin: "Admin Cliente",
  readonly: "Solo lectura",
};

export default function ProfilePage() {
  const { profile, clients, loading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("Las contraseñas no coinciden"); return; }
    if (newPassword.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }

    setChangingPassword(true);
    try {
      // Re-authenticate with current password
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile!.email,
        password: currentPassword,
      });
      if (signInError) { toast.error("Contraseña actual incorrecta"); return; }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { toast.error(error.message); return; }

      toast.success("Contraseña actualizada correctamente");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } finally {
      setChangingPassword(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Mi perfil</h1>
        <p className="text-muted-foreground">Información de tu cuenta.</p>
      </div>

      {/* Profile info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos de la cuenta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Nombre</p>
              <p className="font-medium">{profile.full_name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="font-medium">{profile.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Rol</p>
              <Badge variant="outline" className="text-xs mt-0.5">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </Badge>
            </div>
            {clients.length > 0 && (
              <div>
                <p className="text-muted-foreground text-xs">Clientes asignados</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {clients.map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-xs">{c.name}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Cambiar contraseña
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                required className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Nueva contraseña</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                required minLength={6} className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Confirmar nueva contraseña</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                required className="rounded-md border border-input px-3 py-2 text-sm" />
            </div>
            <Button type="submit" disabled={changingPassword} className="bg-amber-700 hover:bg-amber-800 text-white">
              <Save className="h-4 w-4 mr-2" />
              {changingPassword ? "Actualizando..." : "Actualizar contraseña"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
