/**
 * POST /api/export-all
 *
 * Body: { month: 'YYYY-MM' }
 *
 * Returns a ZIP containing all 3 Excel files (APT, PRODUCCION, PATIO).
 * Uses archiver to build the zip in a streaming fashion.
 */

import { NextRequest } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";

const MONTH_NAMES: Record<number, string> = {
  1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL",
  5: "MAYO", 6: "JUNIO", 7: "JULIO", 8: "AGOSTO",
  9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month } = body as { month: string };

    if (!month) {
      return Response.json({ error: "Se requiere month" }, { status: 400 });
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    if (!year || !monthNum) {
      return Response.json({ error: "Formato de mes inválido, use YYYY-MM" }, { status: 400 });
    }

    const baseUrl = request.nextUrl.origin;
    const monthLabel = MONTH_NAMES[monthNum] || month;

    // Fetch all 3 Excels in parallel
    const [aptRes, prodRes, patioRes] = await Promise.all([
      fetch(`${baseUrl}/api/export-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelType: "APT", month }),
      }),
      fetch(`${baseUrl}/api/export-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelType: "PRODUCCION", month }),
      }),
      fetch(`${baseUrl}/api/export-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excelType: "PATIO", month }),
      }),
    ]);

    if (!aptRes.ok || !prodRes.ok || !patioRes.ok) {
      return Response.json({ error: "Error al generar uno o más Excel" }, { status: 500 });
    }

    const [aptBuf, prodBuf, patioBuf] = await Promise.all([
      aptRes.arrayBuffer(),
      prodRes.arrayBuffer(),
      patioRes.arrayBuffer(),
    ]);

    // Build ZIP
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      archive.on("data", (chunk) => chunks.push(chunk));
      archive.on("end", resolve);
      archive.on("error", reject);

      archive.append(Buffer.from(aptBuf), { name: `APT_${monthLabel}_${year}.xlsx` });
      archive.append(Buffer.from(prodBuf), { name: `PRODUCCION_${monthLabel}_${year}.xlsx` });
      archive.append(Buffer.from(patioBuf), { name: `PATIO_${monthLabel}_${year}.xlsx` });
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="SylviasHouse_${monthLabel}_${year}.zip"`,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/export-all:", error);
    return Response.json({ error: "Error al generar ZIP" }, { status: 500 });
  }
}
