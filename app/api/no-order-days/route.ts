import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const groupId = searchParams.get("groupId");
  const month = searchParams.get("month"); // "YYYY-MM"

  if (!groupId || !month) {
    return Response.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const [y, m] = month.split("-");
  const startDate = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const endDate = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("no_order_days")
    .select("no_order_date")
    .eq("group_id", groupId)
    .gte("no_order_date", startDate)
    .lte("no_order_date", endDate);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json((data ?? []).map((r) => r.no_order_date));
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || (ctx.profile.role !== "super_admin" && ctx.profile.role !== "client_admin")) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const { groupId, date } = await request.json();
  if (!groupId || !date) {
    return Response.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("no_order_days").insert({
    group_id: groupId,
    no_order_date: date,
    confirmed_by: ctx.profile.id,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logAudit("mark_no_order_day", "no_order_days", groupId, { date, by: ctx.profile.email });
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || (ctx.profile.role !== "super_admin" && ctx.profile.role !== "client_admin")) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const { groupId, date } = await request.json();
  if (!groupId || !date) {
    return Response.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("no_order_days")
    .delete()
    .eq("group_id", groupId)
    .eq("no_order_date", date);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logAudit("unmark_no_order_day", "no_order_days", groupId, { date, by: ctx.profile.email });
  return Response.json({ success: true });
}
