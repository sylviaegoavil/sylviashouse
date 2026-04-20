/**
 * Worker Requests API
 *
 * GET    /api/worker-requests?status=pending&mine=true  — list requests
 * POST   /api/worker-requests                            — create a new request
 * PATCH  /api/worker-requests                            — approve / reject
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAuthContext } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const mine = searchParams.get("mine") === "true";
    const countOnly = searchParams.get("count") === "true";

    const supabase = createServerSupabaseClient();

    if (countOnly) {
      const { count } = await supabase
        .from("worker_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return Response.json({ count: count ?? 0 });
    }

    let query = supabase
      .from("worker_requests")
      .select(`
        id, request_type, status, first_name, last_name, doc_number, doc_type,
        reason, created_at, reviewed_at, requested_by_user_id,
        groups(id, name, clients(name)),
        workers(full_name, doc_number),
        user_profiles(email, full_name)
      `)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    if (mine) {
      const ctx = await getAuthContext();
      if (ctx) query = query.eq("requested_by_user_id", ctx.profile.id);
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (error) {
    console.error("Error in GET /api/worker-requests:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, requestType, workerId, firstName, lastName, docNumber, docType } = body;

    if (!groupId || !requestType) {
      return Response.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // Resolve the requester's profile id
    const ctx = await getAuthContext();
    const requestedByUserId = ctx?.profile.id ?? null;

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("worker_requests")
      .insert({
        group_id: groupId,
        request_type: requestType,
        worker_id: workerId ?? null,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        doc_number: docNumber ?? null,
        doc_type: docType ?? "DNI",
        status: "pending",
        requested_by_user_id: requestedByUserId,
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAudit("create", "worker_requests", data.id, { groupId, requestType });
    return Response.json(data);
  } catch (error) {
    console.error("Error in POST /api/worker-requests:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, reason } = body;

    if (!id || !status || !["approved", "rejected"].includes(status)) {
      return Response.json({ error: "Faltan campos requeridos o estado inválido" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: reqData, error: fetchError } = await supabase
      .from("worker_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !reqData) {
      return Response.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    const { error: updateError } = await supabase
      .from("worker_requests")
      .update({ status, reason: reason ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    if (status === "approved" && reqData.request_type === "add") {
      const fullName = [reqData.first_name, reqData.last_name].filter(Boolean).join(" ").toUpperCase();
      const docLen = (reqData.doc_number || "").length;
      const { error: workerError } = await supabase.from("workers").insert({
        group_id: reqData.group_id,
        full_name: fullName,
        doc_number: reqData.doc_number,
        doc_type: docLen === 9 ? "CE" : "DNI",
        is_active: true,
      });
      if (workerError) console.warn("Worker creation failed after approval:", workerError.message);
    }

    if (status === "approved" && reqData.request_type === "remove" && reqData.worker_id) {
      await supabase.from("workers").update({ is_active: false }).eq("id", reqData.worker_id);
    }

    await logAudit(`${status}_request`, "worker_requests", id, { status, reason });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/worker-requests:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
