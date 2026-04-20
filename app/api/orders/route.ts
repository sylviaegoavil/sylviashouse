/**
 * Orders API
 *
 * GET /api/orders?groupId=xxx&month=YYYY-MM  — list orders for a group + month
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const groupId = searchParams.get("groupId");
    const month = searchParams.get("month"); // "YYYY-MM"

    if (!groupId || !month) {
      return Response.json(
        { error: "Se requieren groupId y month" },
        { status: 400 }
      );
    }

    const [year, monthNum] = month.split("-").map(Number);
    if (!year || !monthNum) {
      return Response.json(
        { error: "Formato de mes inválido, use YYYY-MM" },
        { status: 400 }
      );
    }

    const startDate = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const supabase = createServerSupabaseClient();

    // Paginate to bypass Supabase's 1000-row default limit.
    // A busy group can have 50 workers × 31 days = 1550+ orders per month.
    const PAGE = 1000;
    const all: unknown[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("group_id", groupId)
        .gte("order_date", startDate)
        .lte("order_date", endDate)
        .order("order_date", { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) {
        return Response.json(
          { error: "Error al cargar pedidos: " + error.message },
          { status: 500 }
        );
      }

      if (data) all.push(...data);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    return Response.json(all);
  } catch (error) {
    console.error("Error in GET /api/orders:", error);
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
