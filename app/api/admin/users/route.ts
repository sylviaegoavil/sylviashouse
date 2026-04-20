import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
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
