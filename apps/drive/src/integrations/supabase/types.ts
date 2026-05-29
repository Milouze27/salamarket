export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      // ─────────────────────────────────────────────────────────────────
      // Module B2B / Drive Pro — schéma EXACT depuis 0025_drive_pro.sql
      // ─────────────────────────────────────────────────────────────────
      commandes_pro: {
        Row: {
          compte_pro_id: string
          created_at: string
          creneau_livraison_debut: string | null
          creneau_livraison_fin: string | null
          date_commande: string
          date_echeance: string | null
          date_livraison_souhaitee: string | null
          date_paiement: string | null
          facture_numero: string | null
          facture_url: string | null
          id: string
          mode_paiement: string | null
          montant_ht: number
          montant_tva: number
          montant_ttc: number
          notes_client: string | null
          notes_interne: string | null
          numero_commande: string | null
          statut: string
          type_recuperation: string
          updated_at: string
          validee_at: string | null
          validee_par_profile_id: string | null
        }
        Insert: {
          compte_pro_id: string
          created_at?: string
          creneau_livraison_debut?: string | null
          creneau_livraison_fin?: string | null
          date_commande?: string
          date_echeance?: string | null
          date_livraison_souhaitee?: string | null
          date_paiement?: string | null
          facture_numero?: string | null
          facture_url?: string | null
          id?: string
          mode_paiement?: string | null
          montant_ht?: number
          montant_tva?: number
          montant_ttc?: number
          notes_client?: string | null
          notes_interne?: string | null
          numero_commande?: string | null
          statut?: string
          type_recuperation?: string
          updated_at?: string
          validee_at?: string | null
          validee_par_profile_id?: string | null
        }
        Update: {
          compte_pro_id?: string
          created_at?: string
          creneau_livraison_debut?: string | null
          creneau_livraison_fin?: string | null
          date_commande?: string
          date_echeance?: string | null
          date_livraison_souhaitee?: string | null
          date_paiement?: string | null
          facture_numero?: string | null
          facture_url?: string | null
          id?: string
          mode_paiement?: string | null
          montant_ht?: number
          montant_tva?: number
          montant_ttc?: number
          notes_client?: string | null
          notes_interne?: string | null
          numero_commande?: string | null
          statut?: string
          type_recuperation?: string
          updated_at?: string
          validee_at?: string | null
          validee_par_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commandes_pro_compte_pro_id_fkey"
            columns: ["compte_pro_id"]
            isOneToOne: false
            referencedRelation: "comptes_pro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_pro_validee_par_profile_id_fkey"
            columns: ["validee_par_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes_pro_lignes: {
        Row: {
          commande_pro_id: string
          created_at: string
          id: string
          prix_ht_total: number
          prix_ht_unitaire: number
          produit_id: string
          quantite_conditionnements: number
          quantite_par_conditionnement: number
          quantite_unitaire_totale: number
          tva_taux: number | null
        }
        Insert: {
          commande_pro_id: string
          created_at?: string
          id?: string
          // prix_ht_total: GENERATED — ne pas fournir
          prix_ht_unitaire: number
          produit_id: string
          quantite_conditionnements: number
          quantite_par_conditionnement: number
          // quantite_unitaire_totale: GENERATED — ne pas fournir
          tva_taux?: number | null
        }
        Update: {
          commande_pro_id?: string
          created_at?: string
          id?: string
          // prix_ht_total: GENERATED — ne pas fournir
          prix_ht_unitaire?: number
          produit_id?: string
          quantite_conditionnements?: number
          quantite_par_conditionnement?: number
          // quantite_unitaire_totale: GENERATED — ne pas fournir
          tva_taux?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commandes_pro_lignes_commande_pro_id_fkey"
            columns: ["commande_pro_id"]
            isOneToOne: false
            referencedRelation: "commandes_pro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_pro_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      comptes_pro: {
        Row: {
          adresse_facturation: string
          adresse_livraison: string | null
          conditions_paiement: string
          created_at: string
          delegue_email: string
          delegue_nom: string
          delegue_telephone: string
          delegue_user_id: string | null
          encours_actuel: number
          encours_max: number
          forme_juridique: string | null
          id: string
          mandat_sepa_id: string | null
          notes_interne: string | null
          raison_sociale: string
          siret: string
          statut: string
          tva_intracom: string | null
          updated_at: string
          valide_at: string | null
          valide_par_profile_id: string | null
        }
        Insert: {
          adresse_facturation: string
          adresse_livraison?: string | null
          conditions_paiement?: string
          created_at?: string
          delegue_email: string
          delegue_nom: string
          delegue_telephone: string
          delegue_user_id?: string | null
          encours_actuel?: number
          encours_max?: number
          forme_juridique?: string | null
          id?: string
          mandat_sepa_id?: string | null
          notes_interne?: string | null
          raison_sociale: string
          siret: string
          statut?: string
          tva_intracom?: string | null
          updated_at?: string
          valide_at?: string | null
          valide_par_profile_id?: string | null
        }
        Update: {
          adresse_facturation?: string
          adresse_livraison?: string | null
          conditions_paiement?: string
          created_at?: string
          delegue_email?: string
          delegue_nom?: string
          delegue_telephone?: string
          delegue_user_id?: string | null
          encours_actuel?: number
          encours_max?: number
          forme_juridique?: string | null
          id?: string
          mandat_sepa_id?: string | null
          notes_interne?: string | null
          raison_sociale?: string
          siret?: string
          statut?: string
          tva_intracom?: string | null
          updated_at?: string
          valide_at?: string | null
          valide_par_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comptes_pro_delegue_user_id_fkey"
            columns: ["delegue_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comptes_pro_valide_par_profile_id_fkey"
            columns: ["valide_par_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          id: string
          items: Json
          notes: string | null
          payment_method: string
          payment_status: string
          pickup_slot_id: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          id?: string
          items: Json
          notes?: string | null
          payment_method: string
          payment_status?: string
          pickup_slot_id: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string
          payment_status?: string
          pickup_slot_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_pickup_slot_id_fkey"
            columns: ["pickup_slot_id"]
            isOneToOne: false
            referencedRelation: "pickup_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_slots: {
        Row: {
          capacity: number
          created_at: string
          id: string
          reserved_count: number
          slot_end: string
          slot_start: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          reserved_count?: number
          slot_end: string
          slot_start: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          reserved_count?: number
          slot_end?: string
          slot_start?: string
        }
        Relationships: []
      }
      // ─────────────────────────────────────────────────────────────────
      // Module Recettes/Productions — SCHÉMA RÉEL (figé après inspection
      // information_schema.columns sur tltmermqodelorthtbre, 2026-05-15).
      // Si tu modifies ces types, vérifie l'impact sur :
      //   - src/hooks/useRecettes.ts, useRecette.ts, useProductions.ts
      //   - src/pages/labo/*
      //   - supabase/seeds/seed_labo.sql
      // ─────────────────────────────────────────────────────────────────
      productions: {
        Row: {
          cout_total_calcule: number | null
          created_at: string
          date_production: string
          employe_responsable_id: string | null
          id: string
          lot_numero: string | null
          marge_calculee: number | null
          notes: string | null
          recette_id: string | null
          statut: string
          terminee_at: string | null
        }
        Insert: {
          cout_total_calcule?: number | null
          created_at?: string
          date_production: string
          employe_responsable_id?: string | null
          id?: string
          lot_numero?: string | null
          marge_calculee?: number | null
          notes?: string | null
          recette_id?: string | null
          statut: string
          terminee_at?: string | null
        }
        Update: {
          cout_total_calcule?: number | null
          created_at?: string
          date_production?: string
          employe_responsable_id?: string | null
          id?: string
          lot_numero?: string | null
          marge_calculee?: number | null
          notes?: string | null
          recette_id?: string | null
          statut?: string
          terminee_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productions_recette_id_fkey"
            columns: ["recette_id"]
            isOneToOne: false
            referencedRelation: "recettes"
            referencedColumns: ["id"]
          },
        ]
      }
      productions_couts_indirects: {
        Row: {
          description: string | null
          id: string
          montant: number
          production_id: string
          type: string
        }
        Insert: {
          description?: string | null
          id?: string
          montant: number
          production_id: string
          type: string
        }
        Update: {
          description?: string | null
          id?: string
          montant?: number
          production_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_couts_indirects_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions_inputs: {
        Row: {
          cout_total: number | null
          cout_unitaire_ht: number
          id: string
          produit_id: string | null
          production_id: string
          quantite_prevue: number | null
          quantite_reelle_consommee: number
          scanne_at: string
          scanne_par: string | null
          source_depot_id: string | null
          unite: string
        }
        Insert: {
          // cout_total: GENERATED — ne pas fournir
          cout_unitaire_ht: number
          id?: string
          produit_id?: string | null
          production_id: string
          quantite_prevue?: number | null
          quantite_reelle_consommee: number
          scanne_at?: string
          scanne_par?: string | null
          source_depot_id?: string | null
          unite: string
        }
        Update: {
          // cout_total: GENERATED — ne pas fournir
          cout_unitaire_ht?: number
          id?: string
          produit_id?: string | null
          production_id?: string
          quantite_prevue?: number | null
          quantite_reelle_consommee?: number
          scanne_at?: string
          scanne_par?: string | null
          source_depot_id?: string | null
          unite?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_inputs_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_inputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      productions_outputs: {
        Row: {
          date_peremption: string | null
          depot_destination_id: string | null
          id: string
          numero_lot: string | null
          prix_vente_unitaire_ttc: number
          produit_id: string | null
          production_id: string
          quantite_prevue: number | null
          quantite_reelle_produite: number
          unite: string
        }
        Insert: {
          date_peremption?: string | null
          depot_destination_id?: string | null
          id?: string
          numero_lot?: string | null
          prix_vente_unitaire_ttc: number
          produit_id?: string | null
          production_id: string
          quantite_prevue?: number | null
          quantite_reelle_produite: number
          unite: string
        }
        Update: {
          date_peremption?: string | null
          depot_destination_id?: string | null
          id?: string
          numero_lot?: string | null
          prix_vente_unitaire_ttc?: number
          produit_id?: string | null
          production_id?: string
          quantite_prevue?: number | null
          quantite_reelle_produite?: number
          unite?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_outputs_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_outputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string
          estimated_weight_kg: number | null
          id: string
          image_url: string
          in_stock: boolean
          name: string
          poids_max_kg: number | null
          poids_min_kg: number | null
          price_cents: number
          price_per_kg: number | null
          tva_taux: number
          unit: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          estimated_weight_kg?: number | null
          id?: string
          image_url: string
          in_stock?: boolean
          name: string
          poids_max_kg?: number | null
          poids_min_kg?: number | null
          price_cents: number
          price_per_kg?: number | null
          tva_taux?: number
          unit: string
          unit_type?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          estimated_weight_kg?: number | null
          id?: string
          image_url?: string
          in_stock?: boolean
          name?: string
          poids_max_kg?: number | null
          poids_min_kg?: number | null
          price_cents?: number
          price_per_kg?: number | null
          tva_taux?: number
          unit?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      produits_pro_prix: {
        Row: {
          actif: boolean
          conditionnement_pro: string | null
          created_at: string
          disponible_drive_pro: boolean
          id: string
          prix_ht_par_conditionnement: number | null
          prix_ht_unitaire: number
          produit_id: string
          quantite_par_conditionnement: number
          qty_palier_1: number | null
          qty_palier_2: number | null
          remise_palier_1_pct: number | null
          remise_palier_2_pct: number | null
          valide_a_partir_de: string
        }
        Insert: {
          actif?: boolean
          conditionnement_pro?: string | null
          created_at?: string
          disponible_drive_pro?: boolean
          id?: string
          prix_ht_par_conditionnement?: number | null
          prix_ht_unitaire: number
          produit_id: string
          quantite_par_conditionnement?: number
          qty_palier_1?: number | null
          qty_palier_2?: number | null
          remise_palier_1_pct?: number | null
          remise_palier_2_pct?: number | null
          valide_a_partir_de?: string
        }
        Update: {
          actif?: boolean
          conditionnement_pro?: string | null
          created_at?: string
          disponible_drive_pro?: boolean
          id?: string
          prix_ht_par_conditionnement?: number | null
          prix_ht_unitaire?: number
          produit_id?: string
          quantite_par_conditionnement?: number
          qty_palier_1?: number | null
          qty_palier_2?: number | null
          remise_palier_1_pct?: number | null
          remise_palier_2_pct?: number | null
          valide_a_partir_de?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_pro_prix_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone?: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recettes: {
        Row: {
          categorie: string | null
          created_at: string
          created_by: string | null
          id: string
          nom: string
          notes: string | null
          statut: string
          version: number
        }
        Insert: {
          categorie?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nom: string
          notes?: string | null
          statut: string
          version?: number
        }
        Update: {
          categorie?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nom?: string
          notes?: string | null
          statut?: string
          version?: number
        }
        Relationships: []
      }
      recettes_etapes: {
        Row: {
          description: string
          duree_minutes: number | null
          equipement: string | null
          id: string
          ordre: number
          recette_id: string
          temperature_celsius: number | null
        }
        Insert: {
          description: string
          duree_minutes?: number | null
          equipement?: string | null
          id?: string
          ordre: number
          recette_id: string
          temperature_celsius?: number | null
        }
        Update: {
          description?: string
          duree_minutes?: number | null
          equipement?: string | null
          id?: string
          ordre?: number
          recette_id?: string
          temperature_celsius?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recettes_etapes_recette_id_fkey"
            columns: ["recette_id"]
            isOneToOne: false
            referencedRelation: "recettes"
            referencedColumns: ["id"]
          },
        ]
      }
      recettes_ingredients: {
        Row: {
          id: string
          ingredient_libre: string | null
          notes: string | null
          ordre: number
          produit_id: string | null
          quantite: number
          recette_id: string
          unite: string
        }
        Insert: {
          id?: string
          ingredient_libre?: string | null
          notes?: string | null
          ordre: number
          produit_id?: string | null
          quantite: number
          recette_id: string
          unite: string
        }
        Update: {
          id?: string
          ingredient_libre?: string | null
          notes?: string | null
          ordre?: number
          produit_id?: string | null
          quantite?: number
          recette_id?: string
          unite?: string
        }
        Relationships: [
          {
            foreignKeyName: "recettes_ingredients_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recettes_ingredients_recette_id_fkey"
            columns: ["recette_id"]
            isOneToOne: false
            referencedRelation: "recettes"
            referencedColumns: ["id"]
          },
        ]
      }
      recettes_main_oeuvre: {
        Row: {
          duree_minutes: number
          id: string
          poste: string
          recette_id: string
          taux_horaire_charge: number
        }
        Insert: {
          duree_minutes: number
          id?: string
          poste: string
          recette_id: string
          taux_horaire_charge: number
        }
        Update: {
          duree_minutes?: number
          id?: string
          poste?: string
          recette_id?: string
          taux_horaire_charge?: number
        }
        Relationships: [
          {
            foreignKeyName: "recettes_main_oeuvre_recette_id_fkey"
            columns: ["recette_id"]
            isOneToOne: false
            referencedRelation: "recettes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_productions_kpi: {
        Row: {
          ca_potentiel_ht: number | null
          ca_potentiel_ttc: number | null
          cout_indirects: number
          cout_matieres: number
          cout_total: number
          date_production: string
          id: string
          input_total_qty: number | null
          lot_numero: string
          marge_eur_ht: number | null
          marge_pct_ht: number | null
          output_total_qty: number | null
          recette: string | null
          rendement_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_role: { Args: never; Returns: string }
      set_user_role: {
        Args: { p_email: string; p_role: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
