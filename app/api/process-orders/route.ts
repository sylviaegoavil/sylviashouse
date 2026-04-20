/**
 * POST /api/process-orders
 *
 * Receives the confirmed preview and saves orders, new workers,
 * and processing logs to the database.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type {
  ProcessOrdersRequest,
  ProcessOrdersResult,
  ParseErrorEntry,
} from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body: ProcessOrdersRequest = await request.json();
    const {
      groupId,
      fileName,
      confirmedOrders,
      newWorkers,
      adicionales,
      replaceDuplicates,
    } = body;

    if (!groupId) {
      return Response.json(
        { error: "Se requiere un grupo" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const errors: ParseErrorEntry[] = [];
    let ordersCreated = 0;
    let ordersReplaced = 0;
    let newWorkersAdded = 0;

    // ── 1. Add new workers ──
    for (const nw of newWorkers) {
      // Check if already exists
      const { data: existing } = await supabase
        .from("workers")
        .select("id")
        .eq("group_id", groupId)
        .eq("doc_number", nw.docNumber)
        .maybeSingle();

      if (!existing) {
        const { error: insertErr } = await supabase.from("workers").insert({
          group_id: groupId,
          full_name: nw.name.trim().toUpperCase(),
          doc_number: nw.docNumber,
          doc_type: nw.docNumber.length === 9 ? "CE" : "DNI",
          is_active: true,
        });

        if (insertErr) {
          errors.push({
            rawText: `${nw.name}/${nw.docNumber}`,
            date: "",
            errorType: "bad_format",
            message: `Error al agregar trabajador: ${insertErr.message}`,
          });
        } else {
          newWorkersAdded++;
        }
      }
    }

    // ── 2. Process confirmed orders ──
    for (const order of confirmedOrders) {
      // Check for existing order (duplicate)
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("worker_id", order.workerId)
        .eq("group_id", groupId)
        .eq("order_date", order.date)
        .maybeSingle();

      if (existing) {
        if (replaceDuplicates) {
          // Delete existing and insert new
          await supabase.from("orders").delete().eq("id", existing.id);
          ordersReplaced++;
        } else {
          // Skip duplicate
          continue;
        }
      }

      const { error: orderErr } = await supabase.from("orders").insert({
        worker_id: order.workerId,
        group_id: groupId,
        order_date: order.date,
        source: order.source,
        notes: order.notes,
      });

      if (orderErr) {
        errors.push({
          rawText: order.rawText,
          date: order.date,
          errorType: "bad_format",
          message: `Error al guardar pedido: ${orderErr.message}`,
        });
      } else {
        ordersCreated++;
      }
    }

    // ── 3. Save adicionales as orders with worker_id = null or a special marker ──
    // We store adicionales in the orders table with a note
    // Actually, adicionales don't map to a specific worker. We'll store them
    // in the processing_log and they'll show up in the attendance grid.

    // ── 4. Create processing log ──
    const { data: log, error: logErr } = await supabase
      .from("processing_logs")
      .insert({
        group_id: groupId,
        file_name: fileName,
        total_orders: confirmedOrders.length,
        matched: ordersCreated + ordersReplaced,
        unmatched: 0,
        new_workers_added: newWorkersAdded,
      })
      .select("id")
      .single();

    if (logErr) {
      console.error("Error creating processing log:", logErr);
    }

    // ── 5. Save parsing errors ──
    if (log && errors.length > 0) {
      for (const err of errors) {
        await supabase.from("parsing_errors").insert({
          processing_log_id: log.id,
          group_id: groupId,
          order_date: err.date || "1970-01-01",
          raw_text: err.rawText,
          error_type: err.errorType,
          expected_value: null,
          actual_value: null,
        });
      }
    }

    const result: ProcessOrdersResult = {
      ordersCreated,
      ordersReplaced,
      newWorkersAdded,
      processingLogId: log?.id || "",
      errors,
    };

    return Response.json(result);
  } catch (error) {
    console.error("Error in process-orders:", error);
    return Response.json(
      {
        error:
          "Error al procesar pedidos: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
