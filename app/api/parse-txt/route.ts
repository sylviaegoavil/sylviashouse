/**
 * POST /api/parse-txt
 *
 * Accepts a WhatsApp TXT export and a group ID.
 * Parses the file, matches orders against workers, detects duplicates,
 * and returns a preview for the user to confirm.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { parseWhatsAppTxt } from "@/lib/parser";
import { matchWorkers } from "@/lib/matcher";
import type {
  Worker,
  Group,
  ParsePreviewResult,
  DuplicateInfo,
  RepeatedOrderGroup,
  UploadConfig,
} from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const groupId = formData.get("groupId") as string | null;
    const modeRaw = formData.get("mode") as string | null;
    const specificDate = formData.get("specificDate") as string | null;
    const startDate = formData.get("startDate") as string | null;
    const endDate = formData.get("endDate") as string | null;

    if (!file || !groupId) {
      return Response.json(
        { error: "Se requiere un archivo TXT y un grupo" },
        { status: 400 }
      );
    }

    // Build upload config
    const config: UploadConfig = {
      mode: (modeRaw as UploadConfig["mode"]) || "full_file",
      specificDate: specificDate || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };

    const supabase = createServerSupabaseClient();

    // Fetch the group
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return Response.json(
        { error: "Grupo no encontrado" },
        { status: 404 }
      );
    }

    const typedGroup = group as Group;

    // Fetch workers for this group
    const { data: workers, error: workersError } = await supabase
      .from("workers")
      .select("*")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (workersError) {
      return Response.json(
        { error: "Error al cargar trabajadores: " + workersError.message },
        { status: 500 }
      );
    }

    const typedWorkers = (workers || []) as Worker[];

    // Read file content
    const content = await file.text();

    // Parse the TXT
    const parseResult = parseWhatsAppTxt(content, typedGroup.name, config);

    // Match parsed orders against workers
    const matchResults = matchWorkers(parseResult.orders, typedWorkers);

    // Separate matched vs unmatched
    const matched = matchResults.filter((r) => r.worker !== null);
    const unmatched = matchResults.filter((r) => r.worker === null);

    // Check for duplicates (existing orders for same worker+date+group)
    const duplicates: DuplicateInfo[] = [];
    if (matched.length > 0) {
      const workerIds = [
        ...new Set(matched.map((m) => m.worker!.id)),
      ];
      const dates = [...new Set(matched.map((m) => m.parsedOrder.date))];

      const { data: existingOrders } = await supabase
        .from("orders")
        .select("id, worker_id, order_date")
        .eq("group_id", groupId)
        .in("worker_id", workerIds)
        .in("order_date", dates);

      if (existingOrders) {
        for (const existing of existingOrders) {
          const matchedOrder = matched.find(
            (m) =>
              m.worker!.id === existing.worker_id &&
              m.parsedOrder.date === existing.order_date
          );
          if (matchedOrder) {
            duplicates.push({
              workerId: existing.worker_id,
              workerName: matchedOrder.worker!.full_name,
              date: existing.order_date,
              existingOrderId: existing.id,
            });
          }
        }
      }
    }

    // Detect repeated orders: same worker + same date appearing >1 time in this TXT
    const repeatedMap = new Map<string, { result: typeof matched[0]; orders: { rawText: string; timestamp: string | null }[] }>();
    for (const m of matched) {
      if (!m.worker) continue;
      const key = `${m.worker.id}|${m.parsedOrder.date}`;
      if (!repeatedMap.has(key)) {
        repeatedMap.set(key, { result: m, orders: [] });
      }
      repeatedMap.get(key)!.orders.push({
        rawText: m.parsedOrder.rawText,
        timestamp: m.parsedOrder.messageTimestamp ?? null,
      });
    }
    const repeated: RepeatedOrderGroup[] = [];
    for (const [, entry] of repeatedMap) {
      if (entry.orders.length > 1) {
        repeated.push({
          workerId: entry.result.worker!.id,
          workerName: entry.result.worker!.full_name,
          docNumber: entry.result.worker!.doc_number,
          date: entry.result.parsedOrder.date,
          count: entry.orders.length,
          orders: entry.orders,
        });
      }
    }
    repeated.sort((a, b) => a.date.localeCompare(b.date) || a.workerName.localeCompare(b.workerName));

    // Build summary
    const adicionalesTotal = Object.values(parseResult.adicionales).reduce(
      (sum, n) => sum + n,
      0
    );

    // Filter out workers already registered in this group.
    // typedWorkers contains all active workers for the group, so we just
    // check doc_number against the detected DNIs.
    const existingDocNumbers = new Set(typedWorkers.map((w) => w.doc_number));
    const trulyNewWorkers = parseResult.newWorkers.filter(
      (nw) => !nw.docNumber || !existingDocNumbers.has(nw.docNumber)
    );

    const preview: ParsePreviewResult = {
      groupId,
      groupName: typedGroup.name,
      fileName: file.name,
      matched,
      unmatched,
      newWorkers: trulyNewWorkers,
      adicionales: parseResult.adicionales,
      errors: parseResult.errors,
      duplicates,
      repeated,
      summary: {
        totalOrders: parseResult.orders.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        adicionalesTotal,
        newWorkersCount: trulyNewWorkers.length,
        errorsCount: parseResult.errors.length,
        duplicatesCount: duplicates.length,
        repeatedCount: repeated.length,
      },
    };

    return Response.json(preview);
  } catch (error) {
    console.error("Error in parse-txt:", error);
    return Response.json(
      {
        error:
          "Error al procesar el archivo: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
