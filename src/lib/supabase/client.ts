import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

// Only create client if we have valid credentials
// Use createBrowserClient from @supabase/ssr for proper cookie handling
export const supabase = supabaseUrl && supabaseAnonKey && 
  supabaseUrl !== "https://placeholder.supabase.co" && 
  supabaseAnonKey !== "placeholder-key"
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null as any; // Type assertion for development - will be properly configured later

export const isSupabaseConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "placeholder-key"
  );
};
