/**
 * Workers CRUD API
 *
 * GET    /api/workers?groupId=xxx  — list workers for a group
 * POST   /api/workers              — create a worker
 * PUT    /api/workers              — update a worker
 * DELETE /api/workers?id=xxx       — delete worker (super_admin only, fails if has orders)
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteIfNoHistory } from "@/lib/worker-protection";

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
        const { data: existing } = await supabase
          .from("workers")
          .select("is_active")
          .eq("group_id", group_id)
          .eq("doc_number", doc_number)
          .maybeSingle();
        return Response.json(
          {
            error: existing && !existing.is_active
              ? "Ya existe un trabajador con ese DNI en este grupo, pero está desactivado: actívalo desde la lista (filtro Desactivados)"
              : "Ya existe un trabajador con ese DNI en este grupo",
          },
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

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.profile.role !== "super_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Falta id" }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();

  try {
    const { data: worker, error: readErr } = await supabase
      .from("workers")
      .select("id, full_name, doc_number, group_id")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return Response.json({ error: readErr.message }, { status: 500 });
    if (!worker) return Response.json({ error: "Trabajador no encontrado" }, { status: 404 });

    // History is judged per DNI across ALL groups (orders.worker_id cascades on delete).
    const { deleted, skipped } = await deleteIfNoHistory(supabase, [worker]);
    if (skipped.length > 0) {
      return Response.json(
        { error: "Tiene pedidos", orderCount: skipped[0].orderCount },
        { status: 409 }
      );
    }

    await logAudit("worker_delete", "workers", worker.id, {
      fullName: worker.full_name,
      docNumber: worker.doc_number,
      groupId: worker.group_id,
      bulk: false,
      deletedBy: ctx.profile.email,
    });
    return Response.json({ deleted: deleted.length === 1 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Error al eliminar" },
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
