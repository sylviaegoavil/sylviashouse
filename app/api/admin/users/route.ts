import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createServerSupabaseClientSSR, createServiceRoleSupabaseClient } from "@/lib/supabase-server";

async function requireSuperAdmin() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.profile.role !== "super_admin") return null;
  return ctx;
}

export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 403 });

  const supabase = await createServerSupabaseClientSSR();
  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select("id, user_id, email, full_name, role, is_active, created_at")
    .order("full_name");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Load client assignments for each user
  const { data: assignments } = await supabase
    .from("user_clients")
    .select("user_profile_id, clients(id, name)");

  const profilesWithClients = (profiles || []).map((p) => ({
    ...p,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clients: (assignments || []).filter((a: any) => a.user_profile_id === p.id).map((a: any) => a.clients),
  }));

  return Response.json(profilesWithClients);
}

export async function POST(request: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const { email, full_name, role, password, clientIds } = body;

  if (!email || !full_name || !role || !password) {
    return Response.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const adminClient = createServiceRoleSupabaseClient();

  // Create Supabase Auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return Response.json({ error: authError.message }, { status: 500 });

  const supabase = await createServerSupabaseClientSSR();

  // Create user_profiles record
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .insert({ user_id: authData.user.id, email, full_name, role })
    .select()
    .single();

  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });

  // Assign clients
  if (clientIds?.length) {
    await supabase.from("user_clients").insert(
      clientIds.map((cid: string) => ({ user_profile_id: profile.id, client_id: cid }))
    );
  }

  return Response.json(profile);
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const { id, full_name, role, is_active, clientIds } = body;

  if (!id) return Response.json({ error: "Se requiere id" }, { status: 400 });

  const supabase = await createServerSupabaseClientSSR();

  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (role !== undefined) updates.role = role;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("user_profiles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Update client assignments if provided
  if (clientIds !== undefined) {
    await supabase.from("user_clients").delete().eq("user_profile_id", id);
    if (clientIds.length) {
      await supabase.from("user_clients").insert(
        clientIds.map((cid: string) => ({ user_profile_id: id, client_id: cid }))
      );
    }
  }

  return Response.json(data);
}

/**
 * DELETE /api/admin/users  { id }   (id = user_profiles.id)   — super_admin only
 *
 * Permanently removes a user from the three places it lives, in this order:
 *   1. user_clients   (assignments, child rows)
 *   2. user_profiles
 *   3. Supabase Auth  (admin.deleteUser)
 * DB rows go first because they can be restored; if the Auth deletion fails the profile and
 * assignments are re-inserted so nothing is left half-deleted. A profile that other tables
 * still reference (FK) makes step 2 fail and everything is restored.
 */
export async function DELETE(request: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) return Response.json({ error: "Se requiere id" }, { status: 400 });

  const admin = createServiceRoleSupabaseClient();

  const { data: target, error: readErr } = await admin
    .from("user_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
  if (!target) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

  // Never allow deleting your own account
  if (target.id === ctx.profile.id || target.user_id === ctx.userId) {
    return Response.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  // Never leave the system without an active super_admin
  if (target.role === "super_admin" && target.is_active) {
    const { count, error: countErr } = await admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true)
      .neq("id", target.id);
    if (countErr) return Response.json({ error: countErr.message }, { status: 500 });
    if (!count) {
      return Response.json(
        { error: "No se puede eliminar al último super_admin activo" },
        { status: 400 }
      );
    }
  }

  // Keep copies so a failure can be rolled back
  const { data: assignments, error: asgReadErr } = await admin
    .from("user_clients")
    .select("*")
    .eq("user_profile_id", target.id);
  if (asgReadErr) return Response.json({ error: asgReadErr.message }, { status: 500 });

  const restore = async () => {
    await admin.from("user_profiles").upsert(target);
    if (assignments?.length) await admin.from("user_clients").upsert(assignments);
  };

  // 1. assignments
  const { error: delAsgErr } = await admin
    .from("user_clients")
    .delete()
    .eq("user_profile_id", target.id);
  if (delAsgErr) return Response.json({ error: delAsgErr.message }, { status: 500 });

  // 2. profile
  const { error: delProfileErr } = await admin.from("user_profiles").delete().eq("id", target.id);
  if (delProfileErr) {
    await restore();
    return Response.json(
      { error: `No se pudo eliminar el perfil (¿tiene registros asociados?): ${delProfileErr.message}` },
      { status: 500 }
    );
  }

  // 3. Supabase Auth
  const { error: delAuthErr } = await admin.auth.admin.deleteUser(target.user_id);
  if (delAuthErr) {
    await restore();
    return Response.json(
      { error: `No se pudo eliminar de Auth; no se borró nada: ${delAuthErr.message}` },
      { status: 500 }
    );
  }

  await logAudit("user_delete", "user_profiles", target.id, {
    email: target.email,
    fullName: target.full_name,
    role: target.role,
    authUserId: target.user_id,
    clientAssignments: assignments?.length ?? 0,
    deletedBy: ctx.profile.email,
  });

  return Response.json({ deleted: true });
}
