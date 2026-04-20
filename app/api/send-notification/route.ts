/**
 * POST /api/send-notification
 *
 * Placeholder for email notifications (Resend or Supabase Edge Functions).
 * Body: { type: 'request_created' | 'request_reviewed', data: {...} }
 */

import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // TODO: Integrate with Resend or Supabase Edge Functions
    // For now just log
    console.log("[send-notification]", type, data);

    return Response.json({ success: true, note: "Notificaciones pendientes de integración con proveedor de email" });
  } catch (error) {
    console.error("Error in POST /api/send-notification:", error);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
