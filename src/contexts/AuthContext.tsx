"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

type AuthContextValue = {
  user: User | null;
  profile: any;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateCredits: (newCredits: number) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const loadProfile = useCallback(async (userId: string, authUser?: User | null) => {
    try {
      const { data, error } = await supabase
        .from("player_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error && error.code === "PGRST116") {
        try {
          const avatarUrl = `https://api.dicebear.com/8.x/thumbs/svg?seed=${encodeURIComponent(userId)}`;
          const username =
            authUser?.user_metadata?.username ||
            `Loota_${Math.random().toString(36).substr(2, 9)}`;

          const { data: newProfile, error: createError } = await supabase
            .from("player_profiles")
            .insert({
              user_id: userId,
              username: username,
              credits: 1000,
              level: 1,
              avatar_url: avatarUrl,
            })
            .select()
            .single();

          if (createError) {
            try {
              const response = await fetch("/api/auth/create-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: username }),
              });
              const result = await response.json();
              if (response.ok && result.profile) {
                setProfile(result.profile);
              }
            } catch {
              // ignore
            }
          } else if (newProfile) {
            setProfile(newProfile);
          }
        } catch {
          // ignore
        }
      } else if (error) {
        console.error("Error loading profile:", error);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await loadProfile(user.id);
  }, [user?.id, loadProfile]);

  const updateCredits = useCallback((newCredits: number) => {
    setProfile((prev: any) =>
      prev != null ? { ...prev, credits: newCredits } : null
    );
  }, []);

  useEffect(() => {
    // Restore session and subscribe to auth changes; only set user here (profile loaded in separate effect to avoid double fetch)
    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      const session = result.data.session;
      setUser(session?.user ?? null);
      if (!session?.user) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Single profile load when user is set (avoids double load from getSession + onAuthStateChange)
  useEffect(() => {
    if (!user?.id) return;
    setProfile(null);
    loadProfile(user.id, user);
  }, [user?.id, user, loadProfile]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`profile:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "player_profiles",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: { new: unknown }) => {
          const row = payload.new as Record<string, unknown>;
          if (row && typeof row === "object") setProfile(row as any);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      refreshProfile,
      updateCredits,
    }),
    [user, profile, loading, refreshProfile, updateCredits]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
