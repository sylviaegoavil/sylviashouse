/**
 * POST /api/import-workers
 *
 * Accepts an Excel file upload and a group ID.
 * Reads workers from the Excel (Col B = DNI, Col C = Full Name),
 * detects duplicates, and either returns a preview or saves to DB.
 */

import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { WorkerImportPreview, WorkerImportRow } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const groupId = formData.get("groupId") as string | null;
    const confirm = formData.get("confirm") === "true";

    if (!file || !groupId) {
      return Response.json(
        { error: "Se requiere un archivo Excel y un grupo" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Read Excel file
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    // Find the correct worksheet: the one where B4 = "DNI"
    // (skips CONSOLIDADO and other summary sheets which don't have worker rows)
    const worksheet = workbook.worksheets.find((ws) => {
      const b4 = ws.getRow(4).getCell(2);
      return String(b4.value ?? "").trim().toUpperCase() === "DNI";
    });

    if (!worksheet) {
      return Response.json(
        {
          error:
            "No se encontró una hoja de trabajadores válida. Asegúrate de subir el archivo Excel correcto (debe tener 'DNI' en la celda B4).",
        },
        { status: 400 }
      );
    }

    // Helper: ExcelJS returns formula cells as { formula, result } — extract the value
    function cellString(cell: ExcelJS.Cell): string {
      const v = cell.value;
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && "result" in (v as object)) {
        const r = (v as { result: unknown }).result;
        return r === null || r === undefined ? "" : String(r);
      }
      return String(v);
    }

    // Parse rows — structure confirmed from real files:
    //   Row 1: empty
    //   Row 2: title ("RACIONES MES AÑO") in col D
    //   Row 3: day-of-week headers in col D+
    //   Row 4: B="DNI"  C="NOMBRES"  D+=day numbers
    //   Row 5+: actual workers
    //   Last rows: "NN", "ADICIONALES", "ALMUERZOS"/"CENAS" totals
    const importRows: WorkerImportRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 4) return; // skip header rows

      const rawDni = row.getCell(2).value;
      if (rawDni === null || rawDni === undefined || rawDni === "") return;

      // DNI can be number (47715309) or text ("005280788") or formula — normalise.
      // Numbers lose leading zeros (e.g. 9846269 → must be "09846269"),
      // so pad to 8 digits minimum (standard Peru DNI).
      let docNumber: string;
      if (typeof rawDni === "number") {
        docNumber = String(rawDni).padStart(8, "0");
      } else if (typeof rawDni === "object" && "result" in (rawDni as object)) {
        docNumber = String((rawDni as { result: unknown }).result ?? "").trim();
      } else {
        docNumber = String(rawDni).trim();
      }

      if (!docNumber) return;

      const fullName = cellString(row.getCell(3)).trim().toUpperCase();

      // Skip empty or special footer rows
      if (!fullName) return;
      if (/^(NN|ADICIONALES|ALMUERZOS|CENAS|STAFF|TOTAL|PRODUCCION|PRODUCCIÓN)$/i.test(fullName)) return;
      // Safety: skip if the header row slipped through
      if (docNumber.toUpperCase() === "DNI" || fullName === "NOMBRES") return;

      importRows.push({ docNumber, fullName, rowNumber });
    });

    // Fetch existing workers for the group
    const { data: existingWorkers } = await supabase
      .from("workers")
      .select("doc_number")
      .eq("group_id", groupId);

    const existingDnis = new Set(
      (existingWorkers || []).map((w: { doc_number: string }) => w.doc_number)
    );

    const duplicates = importRows.filter((r) => existingDnis.has(r.docNumber));
    const newWorkers = importRows.filter(
      (r) => !existingDnis.has(r.docNumber)
    );

    // If not confirming, return preview
    if (!confirm) {
      const preview: WorkerImportPreview = {
        groupId,
        workers: importRows,
        duplicates,
        newWorkers,
        totalRows: importRows.length,
      };
      return Response.json(preview);
    }

    // ── Confirm: save new workers to DB ──
    let added = 0;
    const errors: string[] = [];

    for (const worker of newWorkers) {
      const { error: insertErr } = await supabase.from("workers").insert({
        group_id: groupId,
        full_name: worker.fullName,
        doc_number: worker.docNumber,
        doc_type: worker.docNumber.length === 9 ? "CE" : "DNI",
        is_active: true,
      });

      if (insertErr) {
        errors.push(
          `Error en fila ${worker.rowNumber}: ${insertErr.message}`
        );
      } else {
        added++;
      }
    }

    return Response.json({
      added,
      skipped: duplicates.length,
      errors,
      total: importRows.length,
    });
  } catch (error) {
    console.error("Error in import-workers:", error);
    return Response.json(
      {
        error:
          "Error al importar trabajadores: " +
          (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
