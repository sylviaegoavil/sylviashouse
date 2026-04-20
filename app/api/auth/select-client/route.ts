import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { clientId } = await request.json();
  const ctx = await getAuthContext();
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!ctx.clients.some((c) => c.id === clientId)) {
    return Response.json({ error: "Cliente no autorizado" }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.set("sh_client_id", clientId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return Response.json({ success: true });
}
