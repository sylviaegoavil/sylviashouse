import { getAuthContext } from "@/lib/auth";
import { createServerSupabaseClientSSR, createServiceRoleSupabaseClient } from "@/lib/supabase-server";

function requireAdmin(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  if (!ctx) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (ctx.profile.role !== "client_admin" && ctx.profile.role !== "super_admin") {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const dateFrom = searchParams.get("date_from") ?? "";
    const dateTo = searchParams.get("date_to") ?? "";
    const paymentTerms = searchParams.get("payment_terms") ?? "";

    const supabase = await createServerSupabaseClientSSR();
    let query = supabase
      .from("quotes")
      .select("id, quote_number, issue_date, currency, client_ruc, client_business_name, client_attention, reference, payment_terms, delivery_time, subtotal, igv, total, advisor_name, pdf_url, created_at")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(
        `quote_number.ilike.%${search}%,client_business_name.ilike.%${search}%,client_attention.ilike.%${search}%,reference.ilike.%${search}%`
      );
    }
    if (dateFrom) query = query.gte("issue_date", dateFrom);
    if (dateTo) query = query.lte("issue_date", dateTo);
    if (paymentTerms) query = query.eq("payment_terms", paymentTerms);

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  } catch (err) {
    console.error("Error in GET /api/cotizaciones/quotes:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    const deny = requireAdmin(ctx);
    if (deny) return deny;

    const body = await req.json();

    if (!body.clientBusinessName?.trim()) {
      return Response.json({ error: "La razón social del cliente es requerida" }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ error: "Debe agregar al menos un producto" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClientSSR();

    // Consume quote number atomically
    const { data: numberData, error: numberError } = await supabase.rpc("get_next_quote_number");
    if (numberError) return Response.json({ error: numberError.message }, { status: 500 });

    const quoteNumber = numberData as string;

    // Insert quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        quote_number: quoteNumber,
        issue_date: body.issueDate,
        currency: body.currency ?? "PEN",
        client_ruc: body.clientRuc || null,
        client_business_name: body.clientBusinessName.trim(),
        client_address: body.clientAddress || null,
        client_attention: body.clientAttention || null,
        client_phone: body.clientPhone || null,
        client_email: body.clientEmail || null,
        reference: body.reference || null,
        payment_terms: body.paymentTerms || null,
        delivery_time: body.deliveryTime || null,
        offer_validity: body.offerValidity || null,
        delivery_place: body.deliveryPlace || null,
        subtotal: body.subtotal ?? 0,
        igv: body.igv ?? 0,
        total: body.total ?? 0,
        advisor_name: body.advisorName || null,
        created_by: ctx!.profile.id,
      })
      .select()
      .single();

    if (quoteError) return Response.json({ error: quoteError.message }, { status: 500 });

    // Insert items
    const itemRows = body.items.map((item: {
      position: number;
      quantity: number;
      unit?: string;
      productType?: string;
      brandName?: string;
      description: string;
      unitPrice: number;
      lineTotal: number;
    }) => ({
      quote_id: quote.id,
      position: item.position,
      quantity: item.quantity,
      unit: item.unit || null,
      product_type: item.productType || null,
      brand_name: item.brandName || null,
      description: item.description,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
    }));

    const { error: itemsError } = await supabase.from("quote_items").insert(itemRows);
    if (itemsError) return Response.json({ error: itemsError.message }, { status: 500 });

    // Upsert client into cache using service role (no session context needed)
    if (body.clientRuc && /^\d{11}$/.test(body.clientRuc)) {
      const serviceClient = createServiceRoleSupabaseClient();
      const { error: cacheError } = await serviceClient.from("clients_cache").upsert(
        {
          ruc:           body.clientRuc,
          business_name: body.clientBusinessName.trim(),
          address:       body.clientAddress   || null,
          attention:     body.clientAttention || null,
          phone:         body.clientPhone     || null,
          email:         body.clientEmail     || null,
          reference:     body.reference       || null,
          updated_at:    new Date().toISOString(),
        },
        { onConflict: "ruc" }
      );
      if (cacheError) {
        console.error("[clients_cache] upsert failed:", cacheError.message);
      } else {
        console.log("[clients_cache] upserted ruc:", body.clientRuc);
      }
    }

    return Response.json(quote, { status: 201 });
  } catch (err) {
    console.error("Error in POST /api/cotizaciones/quotes:", err);
    return Response.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
