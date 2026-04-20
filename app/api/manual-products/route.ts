/**
 * Manual Products API
 *
 * GET  /api/manual-products?month=YYYY-MM  — list all manual products for a month
 * POST /api/manual-products               — upsert a manual product entry
 * DELETE /api/manual-products?id=xxx       — delete a manual product entry
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const month = searchParams.get("month");

    if (!month) {
      return Response.json({ error: "Se requiere month" }, { status: 400 });
    }

    const [year, monthNum] = month.split("-").map(Number);
    const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const groupId = searchParams.get("groupId");

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("manual_products")
      .select(`
        id, product_date, quantity, notes, group_id,
        manual_product_types(id, name, unit_price),
        groups(name)
      `)
      .gte("product_date", startDate)
      .lte("product_date", endDate)
      .order("product_date");

    if (groupId) query = query.eq("group_id", groupId);

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data);
  } catch (error) {
    console.error("Error in GET /api/manual-products:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productTypeId, groupId, productDate, quantity, notes } = body;

    if (!productTypeId || !groupId || !productDate || quantity === undefined) {
      return Response.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("manual_products")
      .insert({
        product_type_id: productTypeId,
        group_id: groupId,
        product_date: productDate,
        quantity,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await logAudit("upsert", "manual_products", data.id, { productTypeId, groupId, productDate, quantity, notes });
    return Response.json(data);
  } catch (error) {
    console.error("Error in POST /api/manual-products:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, productTypeId, groupId, productDate, quantity, notes } = body;

    if (!id || !productTypeId || !groupId || !productDate || quantity === undefined) {
      return Response.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("manual_products")
      .update({
        product_type_id: productTypeId,
        group_id: groupId,
        product_date: productDate,
        quantity,
        notes: notes || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await logAudit("update", "manual_products", id, { productTypeId, groupId, productDate, quantity, notes });
    return Response.json(data);
  } catch (error) {
    console.error("Error in PATCH /api/manual-products:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Se requiere id" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("manual_products").delete().eq("id", id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await logAudit("delete", "manual_products", id);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/manual-products:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
