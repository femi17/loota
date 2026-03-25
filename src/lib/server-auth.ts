import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Require an authenticated user. Use in Route Handlers.
 * Returns { user, supabase } or a 401 NextResponse.
 */
export async function requireUser(): Promise<
  | { user: { id: string; email?: string }; supabase: Awaited<ReturnType<typeof createClient>> }
  | NextResponse
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user, supabase };
}

/**
 * Require an authenticated user who has an admin_profiles row.
 * Use for admin-only API routes. Returns { user, supabase } or 401/403 NextResponse.
 */
export async function requireAdmin(): Promise<
  | { user: { id: string; email?: string }; supabase: Awaited<ReturnType<typeof createClient>> }
  | NextResponse
> {
  const result = await requireUser();
  if (result instanceof NextResponse) return result;

  const { data: profile } = await result.supabase
    .from("admin_profiles")
    .select("user_id")
    .eq("user_id", result.user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return result;
}
