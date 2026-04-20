import { createServerSupabaseClientSSR } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createServerSupabaseClientSSR();
  await supabase.auth.signOut();
  return Response.json({ success: true });
}
