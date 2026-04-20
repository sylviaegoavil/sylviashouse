/**
 * Workers CRUD API
 *
 * GET  /api/workers?groupId=xxx   — list workers for a group
 * POST /api/workers               — create a worker
 * PUT  /api/workers               — update a worker
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const groupId = searchParams.get("groupId");
    const search = searchParams.get("search");

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from("workers")
      .select("*")
      .order("full_name", { ascending: true });

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    if (search) {
      const terms = search
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const orFilter = terms
        .map((t) => `full_name.ilike.%${t}%,doc_number.ilike.%${t}%`)
        .join(",");

      query = query.or(orFilter);
    }

    const { data, error } = await query;

    if (error) {
      return Response.json(
        { error: "Error al cargar trabajadores: " + error.message },
        { status: 500 }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error("Error in GET /api/workers:", error);
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { group_id, full_name, doc_number, doc_type } = body;

    if (!group_id || !full_name || !doc_number) {
      return Response.json(
        { error: "Campos requeridos: grupo, nombre completo, DNI" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("workers")
      .insert({
        group_id,
        full_name,
        doc_number,
        doc_type: doc_type || "DNI",
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "Ya existe un trabajador con ese DNI en este grupo" },
          { status: 409 }
        );
      }
      return Response.json(
        { error: "Error al crear trabajador: " + error.message },
        { status: 500 }
      );
    }

    return Response.json(data, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/workers:", error);
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return Response.json(
        { error: "Se requiere el ID del trabajador" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("workers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return Response.json(
        { error: "Error al actualizar trabajador: " + error.message },
        { status: 500 }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error("Error in PUT /api/workers:", error);
    return Response.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
