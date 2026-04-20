import { NextRequest } from "next/server";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientSSR>>;

// Most recent group price per (group_id, concept) with effective_from <= startOfMonth
async function resolveGroupPrices(
  supabase: SupabaseClient,
  groupIds: string[],
  startOfMonth: string,
): Promise<Record<string, { price: number; effectiveFrom: string }>> {
  if (groupIds.length === 0) return {};
  const { data } = await supabase
    .from("group_prices")
    .select("group_id, concept, unit_price, effective_from")
    .in("group_id", groupIds)
    .lte("effective_from", startOfMonth)
    .order("effective_from", { ascending: false });

  const result: Record<string, { price: number; effectiveFrom: string }> = {};
  for (const row of data ?? []) {
    const key = `${row.group_id}|${row.concept}`;
    if (!result[key]) result[key] = { price: row.unit_price, effectiveFrom: row.effective_from };
  }
  return result;
}

// Most recent product price per product_type_id with effective_from <= startOfMonth
async function resolveProductPrices(
  supabase: SupabaseClient,
  startOfMonth: string,
): Promise<Record<string, { price: number; effectiveFrom: string }>> {
  const { data } = await supabase
    .from("manual_product_type_prices")
    .select("product_type_id, unit_price, effective_from")
    .lte("effective_from", startOfMonth)
    .order("effective_from", { ascending: false });

  const result: Record<string, { price: number; effectiveFrom: string }> = {};
  for (const row of data ?? []) {
    if (!result[row.product_type_id]) {
      result[row.product_type_id] = { price: row.unit_price, effectiveFrom: row.effective_from };
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });

  const month = request.nextUrl.searchParams.get("month"); // "YYYY-MM"
  if (!month) return Response.json({ error: "Falta month" }, { status: 400 });

  const supabase = await createServerSupabaseClientSSR();
  const startOfMonth = `${month}-01`;

  const [groupsRes, ptRes] = await Promise.all([
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("manual_product_types").select("id, name, unit_price").eq("is_active", true).order("name"),
  ]);

  const groups = groupsRes.data ?? [];
  const groupIds = groups.map((g) => g.id);

  const [groupPrices, productPricesHist] = await Promise.all([
    resolveGroupPrices(supabase, groupIds, startOfMonth),
    resolveProductPrices(supabase, startOfMonth),
  ]);

  // Merge historical product prices with current unit_price as fallback
  const productPrices: Record<string, { id: string; name: string; price: number; effectiveFrom: string | null }> = {};
  for (const pt of ptRes.data ?? []) {
    const hist = productPricesHist[pt.id];
    productPrices[pt.id] = {
      id: pt.id,
      name: pt.name,
      price: hist?.price ?? pt.unit_price,
      effectiveFrom: hist?.effectiveFrom ?? null,
    };
  }

  return Response.json({ groups, groupPrices, productPrices });
}

function prevMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || (ctx.profile.role !== "super_admin" && ctx.profile.role !== "client_admin")) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClientSSR();
  const body = await request.json();
  const { month, groupPrices, productPrices, copyFromPrev } = body as {
    month: string;
    groupPrices?: Record<string, number>;
    productPrices?: Record<string, number>;
    copyFromPrev?: boolean;
  };

  if (!month) return Response.json({ error: "Falta month" }, { status: 400 });
  const startOfMonth = `${month}-01`;

  if (copyFromPrev) {
    const prevStart = `${prevMonthStr(month)}-01`;
    const { data: groups } = await supabase.from("groups").select("id");
    const groupIds = (groups ?? []).map((g: { id: string }) => g.id);

    const [prevGP, prevPP] = await Promise.all([
      resolveGroupPrices(supabase, groupIds, prevStart),
      resolveProductPrices(supabase, prevStart),
    ]);

    const gpRows = Object.entries(prevGP).map(([key, val]) => {
      const [groupId, concept] = key.split("|");
      return { group_id: groupId, concept, unit_price: val.price, effective_from: startOfMonth };
    });
    if (gpRows.length > 0) {
      const { error } = await supabase.from("group_prices")
        .upsert(gpRows, { onConflict: "group_id,concept,effective_from" });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    const ptRows = Object.entries(prevPP).map(([id, val]) => ({
      product_type_id: id,
      unit_price: val.price,
      effective_from: startOfMonth,
    }));
    if (ptRows.length > 0) {
      const { error } = await supabase.from("manual_product_type_prices")
        .upsert(ptRows, { onConflict: "product_type_id,effective_from" });
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  }

  // Save explicit group prices
  if (groupPrices && Object.keys(groupPrices).length > 0) {
    const gpRows = Object.entries(groupPrices).map(([key, price]) => {
      const [groupId, concept] = key.split("|");
      return { group_id: groupId, concept, unit_price: price, effective_from: startOfMonth };
    });
    const { error } = await supabase.from("group_prices")
      .upsert(gpRows, { onConflict: "group_id,concept,effective_from" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Save explicit product prices
  if (productPrices && Object.keys(productPrices).length > 0) {
    const ptRows = Object.entries(productPrices).map(([id, price]) => ({
      product_type_id: id,
      unit_price: price,
      effective_from: startOfMonth,
    }));
    const { error } = await supabase.from("manual_product_type_prices")
      .upsert(ptRows, { onConflict: "product_type_id,effective_from" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
