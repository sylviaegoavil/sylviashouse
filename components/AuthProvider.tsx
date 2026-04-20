"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { UserRole } from "@/lib/auth";

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

interface AuthState {
  profile: UserProfile | null;
  clients: ClientInfo[];
  selectedClientId: string | null;
  loading: boolean;
  selectClient: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  profile: null,
  clients: [],
  selectedClientId: null,
  loading: true,
  selectClient: async () => {},
  signOut: async () => {},
  reload: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAuthState = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setProfile(null);
        setClients([]);
        setSelectedClientId(null);
        return;
      }
      const data = await res.json();
      setProfile(data.profile);
      setClients(data.clients || []);
      setSelectedClientId(data.selectedClientId || null);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuthState();
    const supabase = createBrowserSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") loadAuthState();
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setClients([]);
        setSelectedClientId(null);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadAuthState]);

  const selectClient = useCallback(async (id: string) => {
    await fetch("/api/auth/select-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id }),
    });
    setSelectedClientId(id);
    router.refresh();
  }, [router]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setProfile(null);
    setClients([]);
    setSelectedClientId(null);
    router.push("/login");
    router.refresh();
  }, [router]);

  return (
    <AuthContext.Provider value={{
      profile, clients, selectedClientId, loading,
      selectClient, signOut, reload: loadAuthState,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
