import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

async function requireSuperAdmin() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.profile.role !== "super_admin") return null;
  return ctx;
}

export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 403 });

  const supabase = await createServerSupabaseClientSSR();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, ruc, is_active, created_at")
    .order("name");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const { id, name, ruc, is_active } = body;

  const supabase = await createServerSupabaseClientSSR();

  if (id) {
    // Update
    const { data, error } = await supabase
      .from("clients")
      .update({ name, ruc: ruc || null, is_active })
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } else {
    // Create
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, ruc: ruc || null })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }
}
