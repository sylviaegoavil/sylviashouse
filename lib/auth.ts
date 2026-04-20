import { createServerSupabaseClientSSR } from "./supabase-server";
import { cookies } from "next/headers";

export type UserRole = "super_admin" | "client_admin" | "readonly";

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface ClientInfo {
  id: string;
  name: string;
  ruc: string | null;
  is_active: boolean;
}

export interface AuthContext {
  userId: string;
  profile: UserProfile;
  clients: ClientInfo[];
  selectedClientId: string;
  authorizedGroupIds: string[];
}

const SELECTED_CLIENT_COOKIE = "sh_client_id";

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createServerSupabaseClientSSR();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!profile) return null;

  // Load authorized clients
  let clients: ClientInfo[] = [];
  if (profile.role === "super_admin") {
    const { data } = await supabase
      .from("clients")
      .select("id, name, ruc, is_active")
      .eq("is_active", true)
      .order("name");
    clients = data || [];
  } else {
    const { data } = await supabase
      .from("user_clients")
      .select("clients(id, name, ruc, is_active)")
      .eq("user_profile_id", profile.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clients = (data || []).map((r: any) => r.clients).filter(Boolean);
  }

  // Determine selected client from cookie
  const cookieStore = await cookies();
  const savedClientId = cookieStore.get(SELECTED_CLIENT_COOKIE)?.value;
  const selectedClientId =
    savedClientId && clients.some((c) => c.id === savedClientId)
      ? savedClientId
      : clients[0]?.id ?? "";

  // Load authorized group IDs for the selected client
  const { data: groups } = await supabase
    .from("groups")
    .select("id")
    .eq("client_id", selectedClientId);

  const authorizedGroupIds = (groups || []).map((g: { id: string }) => g.id);

  return { userId: user.id, profile, clients, selectedClientId, authorizedGroupIds };
}

export function canEdit(role: UserRole): boolean {
  return role === "super_admin" || role === "client_admin";
}
