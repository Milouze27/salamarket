// Supabase client — anon key + URL sont SAFE en public (RLS-protected).
// Fallback hardcoded car Vercel monorepo + Vite ne load pas toujours .env.production.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { safeStorage } from '@/lib/safe-storage';

const FALLBACK_URL = 'https://tltmermqodelorthtbre.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsdG1lcm1xb2RlbG9ydGh0YnJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjQwMDksImV4cCI6MjA5MjkwMDAwOX0.0PHyLa0a0Aar8ukfdGWw_rtnbwiQ-QaM640Y1VysaAM';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY;

// Warn loud si on retombe sur le fallback hardcoded : on veut savoir si
// le projet Vercel n'a pas les bonnes env vars set en prod. Le fallback
// reste safe pour ne pas casser une démo, mais sans le warn on dérive en
// silence (incident vécu : prod tournait 3 semaines sur l'anon key
// hardcoded car VITE_SUPABASE_* manquait sur Vercel).
if (
  !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase/client] Using fallback anon key — set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY env vars in Vercel pour la prod.",
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: safeStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});