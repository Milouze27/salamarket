// Supabase client — anon key + URL sont SAFE en public (RLS-protected).
// Fallback hardcoded car Vercel monorepo + Vite ne load pas toujours .env.production.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const FALLBACK_URL = 'https://tltmermqodelorthtbre.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsdG1lcm1xb2RlbG9ydGh0YnJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjQwMDksImV4cCI6MjA5MjkwMDAwOX0.0PHyLa0a0Aar8ukfdGWw_rtnbwiQ-QaM640Y1VysaAM';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});