import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR } from "@/lib/supabase-server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
    if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
      return Response.json({ error: "No autorizado" }, { status: 403 });
    }

    const { id } = await params;

    // Get quote to build the storage path
    const supabase = await createServerSupabaseClientSSR();
    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .select("id, quote_number")
      .eq("id", id)
      .single();

    if (qErr || !quote) {
      return Response.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    // Read uploaded file
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `cotizaciones/Cotizacion-${quote.quote_number}.pdf`;

    // Upload using service role client (bypasses RLS)
    const serviceClient = createServiceRoleSupabaseClient();
    const { error: uploadError } = await serviceClient.storage
      .from("assets")
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return Response.json({ error: uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: pub } = serviceClient.storage
      .from("assets")
      .getPublicUrl(storagePath);

    const pdfUrl = pub.publicUrl;

    // Update quotes.pdf_url
    const { error: updateError } = await supabase
      .from("quotes")
      .update({ pdf_url: pdfUrl })
      .eq("id", id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ pdf_url: pdfUrl });
  } catch (err) {
    console.error("Error in POST /api/cotizaciones/quotes/[id]/pdf:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
