/**
 * Audit log utility — write audit entries to Supabase
 */

import { createServerSupabaseClient } from "./supabase-server";

export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, unknown>,
  userId?: string
) {
  try {
    const supabase = createServerSupabaseClient();
    await supabase.from("audit_log").insert({
      user_id: userId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
  } catch {
    // never throw from audit
  }
}
