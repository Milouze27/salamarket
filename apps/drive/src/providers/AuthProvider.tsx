import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
}

interface SignUpInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
}

interface SignInInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("Erreur chargement profil:", error.message);
      setProfile(null);
      return;
    }
    setProfile((data as Profile) ?? null);
  };

  useEffect(() => {
    let mounted = true;

    // 1) Listener AVANT getSession (évite les race conditions)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer la requête Supabase hors du callback
        setTimeout(() => {
          fetchProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    // 2) Récupère la session existante (UNE seule fois, au mount)
    supabase.auth
      .getSession()
      .then(async ({ data: { session: current } }) => {
        if (!mounted) return;
        setSession(current);
        setUser(current?.user ?? null);
        if (current?.user) {
          await fetchProfile(current.user.id);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = async ({ email, password, full_name, phone }: SignUpInput) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name, phone },
      },
    });
    if (error) throw error;
  };

  const signIn = async ({ email, password }: SignInInput) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const FALLBACK_AUTH: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  loading: true,
  signUp: async () => {
    throw new Error("AuthProvider non monté");
  },
  signIn: async () => {
    throw new Error("AuthProvider non monté");
  },
  signOut: async () => {},
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  return ctx ?? FALLBACK_AUTH;
};
