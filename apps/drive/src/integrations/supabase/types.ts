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
      alertes_surplus: {
        Row: {
          bdl_id: string | null
          code_barre_scanne: string
          decide_le: string | null
          decideur: string | null
          id: string
          notes: string | null
          photo_preuve_url: string | null
          produit_id: string | null
          quantite_surplus: number
          signale_le: string
          signale_par: string | null
          statut: string
        }
        Insert: {
          bdl_id?: string | null
          code_barre_scanne: string
          decide_le?: string | null
          decideur?: string | null
          id?: string
          notes?: string | null
          photo_preuve_url?: string | null
          produit_id?: string | null
          quantite_surplus: number
          signale_le?: string
          signale_par?: string | null
          statut?: string
        }
        Update: {
          bdl_id?: string | null
          code_barre_scanne?: string
          decide_le?: string | null
          decideur?: string | null
          id?: string
          notes?: string | null
          photo_preuve_url?: string | null
          produit_id?: string | null
          quantite_surplus?: number
          signale_le?: string
          signale_par?: string | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertes_surplus_bdl_id_fkey"
            columns: ["bdl_id"]
            isOneToOne: false
            referencedRelation: "bons_de_livraison"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertes_surplus_bdl_id_fkey"
            columns: ["bdl_id"]
            isOneToOne: false
            referencedRelation: "v_bdl_litiges"
            referencedColumns: ["bdl_id"]
          },
          {
            foreignKeyName: "alertes_surplus_decideur_fkey"
            columns: ["decideur"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertes_surplus_decideur_fkey"
            columns: ["decideur"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertes_surplus_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertes_surplus_signale_par_fkey"
            columns: ["signale_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertes_surplus_signale_par_fkey"
            columns: ["signale_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          details: Json | null
          id: string
          ip: string | null
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip?: string | null
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip?: string | null
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      bons_de_livraison: {
        Row: {
          created_at: string
          date_livraison_prevue: string
          depot_destination_id: string | null
          ecart_valeur_eur: number
          fournisseur_id: string | null
          id: string
          notes: string | null
          numero_bdl: string
          numero_bdl_fournisseur: string | null
          photo_bdl_url: string | null
          photo_palette_url_1: string | null
          photo_palette_url_2: string | null
          receptionne_le: string | null
          receptionne_par: string | null
          scan_completed_at: string | null
          scan_started_at: string | null
          statut: string
          temperature_reception_c: number | null
          temperature_seuil_max_c: number
          valide_le: string | null
          valide_par_comptable: string | null
          valide_par_comptable_le: string | null
          valide_par_manager: string | null
        }
        Insert: {
          created_at?: string
          date_livraison_prevue: string
          depot_destination_id?: string | null
          ecart_valeur_eur?: number
          fournisseur_id?: string | null
          id?: string
          notes?: string | null
          numero_bdl: string
          numero_bdl_fournisseur?: string | null
          photo_bdl_url?: string | null
          photo_palette_url_1?: string | null
          photo_palette_url_2?: string | null
          receptionne_le?: string | null
          receptionne_par?: string | null
          scan_completed_at?: string | null
          scan_started_at?: string | null
          statut?: string
          temperature_reception_c?: number | null
          temperature_seuil_max_c?: number
          valide_le?: string | null
          valide_par_comptable?: string | null
          valide_par_comptable_le?: string | null
          valide_par_manager?: string | null
        }
        Update: {
          created_at?: string
          date_livraison_prevue?: string
          depot_destination_id?: string | null
          ecart_valeur_eur?: number
          fournisseur_id?: string | null
          id?: string
          notes?: string | null
          numero_bdl?: string
          numero_bdl_fournisseur?: string | null
          photo_bdl_url?: string | null
          photo_palette_url_1?: string | null
          photo_palette_url_2?: string | null
          receptionne_le?: string | null
          receptionne_par?: string | null
          scan_completed_at?: string | null
          scan_started_at?: string | null
          statut?: string
          temperature_reception_c?: number | null
          temperature_seuil_max_c?: number
          valide_le?: string | null
          valide_par_comptable?: string | null
          valide_par_comptable_le?: string | null
          valide_par_manager?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bons_de_livraison_depot_destination_id_fkey"
            columns: ["depot_destination_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "v_fournisseurs_certif_alerte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_receptionne_par_fkey"
            columns: ["receptionne_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_receptionne_par_fkey"
            columns: ["receptionne_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_valide_par_comptable_fkey"
            columns: ["valide_par_comptable"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_valide_par_comptable_fkey"
            columns: ["valide_par_comptable"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_valide_par_manager_fkey"
            columns: ["valide_par_manager"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_valide_par_manager_fkey"
            columns: ["valide_par_manager"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bons_de_livraison_lignes: {
        Row: {
          bdl_id: string
          code_barre_attendu: string | null
          ecart_qte: number | null
          id: string
          lot_id: string | null
          nb_cartons_scannes: number
          prix_achat_ht: number | null
          produit_id: string | null
          quantite_attendue: number
          quantite_recue: number
          scan_timeline: Json
          scanne_le: string | null
          scanne_par: string | null
          statut: string
        }
        Insert: {
          bdl_id: string
          code_barre_attendu?: string | null
          ecart_qte?: number | null
          id?: string
          lot_id?: string | null
          nb_cartons_scannes?: number
          prix_achat_ht?: number | null
          produit_id?: string | null
          quantite_attendue?: number
          quantite_recue?: number
          scan_timeline?: Json
          scanne_le?: string | null
          scanne_par?: string | null
          statut?: string
        }
        Update: {
          bdl_id?: string
          code_barre_attendu?: string | null
          ecart_qte?: number | null
          id?: string
          lot_id?: string | null
          nb_cartons_scannes?: number
          prix_achat_ht?: number | null
          produit_id?: string | null
          quantite_attendue?: number
          quantite_recue?: number
          scan_timeline?: Json
          scanne_le?: string | null
          scanne_par?: string | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "bons_de_livraison_lignes_bdl_id_fkey"
            columns: ["bdl_id"]
            isOneToOne: false
            referencedRelation: "bons_de_livraison"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_bdl_id_fkey"
            columns: ["bdl_id"]
            isOneToOne: false
            referencedRelation: "v_bdl_litiges"
            referencedColumns: ["bdl_id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "produits_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_dlc_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_lots_actifs"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_scanne_par_fkey"
            columns: ["scanne_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_scanne_par_fkey"
            columns: ["scanne_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_abandonment_events: {
        Row: {
          cart_hash: string
          created_at: string
          email: string | null
          emailed_h1: boolean
          emailed_h24: boolean
          id: string
          items_count: number
          recovered: boolean
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cart_hash: string
          created_at?: string
          email?: string | null
          emailed_h1?: boolean
          emailed_h24?: boolean
          id?: string
          items_count?: number
          recovered?: boolean
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cart_hash?: string
          created_at?: string
          email?: string | null
          emailed_h1?: boolean
          emailed_h24?: boolean
          id?: string
          items_count?: number
          recovered?: boolean
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_abandonment_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cockpit_targets: {
        Row: {
          created_at: string
          depot_id: string
          id: string
          jour: string
          note: string | null
          target_ca: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          depot_id: string
          id?: string
          jour: string
          note?: string | null
          target_ca: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          depot_id?: string
          id?: string
          jour?: string
          note?: string | null
          target_ca?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_targets_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      codes_barres_cartons: {
        Row: {
          created_at: string
          ean_carton: string
          fournisseur: string | null
          id: string
          learned_by: string | null
          produit_id: string
          quantite_par_carton: number
        }
        Insert: {
          created_at?: string
          ean_carton: string
          fournisseur?: string | null
          id?: string
          learned_by?: string | null
          produit_id: string
          quantite_par_carton: number
        }
        Update: {
          created_at?: string
          ean_carton?: string
          fournisseur?: string | null
          id?: string
          learned_by?: string | null
          produit_id?: string
          quantite_par_carton?: number
        }
        Relationships: [
          {
            foreignKeyName: "codes_barres_cartons_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      commandes_drive: {
        Row: {
          autorisation_expire_at: string | null
          bay_label: string | null
          client_email: string | null
          client_nom: string
          client_telephone: string | null
          created_at: string
          creneau_retrait: string
          id: string
          mode_paiement: string
          montant_autorise_ttc: number | null
          montant_capture_ttc: number | null
          numero_commande: string
          pret_at: string | null
          retired_at: string | null
          statut: string
          statut_paiement: string | null
          stripe_payment_intent_id: string | null
          total_ttc: number
        }
        Insert: {
          autorisation_expire_at?: string | null
          bay_label?: string | null
          client_email?: string | null
          client_nom: string
          client_telephone?: string | null
          created_at?: string
          creneau_retrait: string
          id?: string
          mode_paiement?: string
          montant_autorise_ttc?: number | null
          montant_capture_ttc?: number | null
          numero_commande: string
          pret_at?: string | null
          retired_at?: string | null
          statut?: string
          statut_paiement?: string | null
          stripe_payment_intent_id?: string | null
          total_ttc?: number
        }
        Update: {
          autorisation_expire_at?: string | null
          bay_label?: string | null
          client_email?: string | null
          client_nom?: string
          client_telephone?: string | null
          created_at?: string
          creneau_retrait?: string
          id?: string
          mode_paiement?: string
          montant_autorise_ttc?: number | null
          montant_capture_ttc?: number | null
          numero_commande?: string
          pret_at?: string | null
          retired_at?: string | null
          statut?: string
          statut_paiement?: string | null
          stripe_payment_intent_id?: string | null
          total_ttc?: number
        }
        Relationships: []
      }
      commandes_drive_lignes: {
        Row: {
          commande_id: string
          depot_id: string
          id: string
          montant_estime_ttc: number | null
          montant_reel_ttc: number | null
          pese_at: string | null
          pese_par: string | null
          prepare_at: string | null
          prepare_par_employe_id: string | null
          prix_unitaire: number
          produit_id: string
          quantite: number
          quantite_estimee: number | null
          quantite_reelle_pesee: number | null
          statut_preparation: string
          zone_preparation: Database["public"]["Enums"]["zone_preparation_drive"]
        }
        Insert: {
          commande_id: string
          depot_id: string
          id?: string
          montant_estime_ttc?: number | null
          montant_reel_ttc?: number | null
          pese_at?: string | null
          pese_par?: string | null
          prepare_at?: string | null
          prepare_par_employe_id?: string | null
          prix_unitaire?: number
          produit_id: string
          quantite: number
          quantite_estimee?: number | null
          quantite_reelle_pesee?: number | null
          statut_preparation?: string
          zone_preparation?: Database["public"]["Enums"]["zone_preparation_drive"]
        }
        Update: {
          commande_id?: string
          depot_id?: string
          id?: string
          montant_estime_ttc?: number | null
          montant_reel_ttc?: number | null
          pese_at?: string | null
          pese_par?: string | null
          prepare_at?: string | null
          prepare_par_employe_id?: string | null
          prix_unitaire?: number
          produit_id?: string
          quantite?: number
          quantite_estimee?: number | null
          quantite_reelle_pesee?: number | null
          statut_preparation?: string
          zone_preparation?: Database["public"]["Enums"]["zone_preparation_drive"]
        }
        Relationships: [
          {
            foreignKeyName: "commandes_drive_lignes_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes_drive"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_drive_lignes_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes_drive_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_drive_lignes_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_drive_lignes_pese_par_fkey"
            columns: ["pese_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_drive_lignes_prepare_par_employe_id_fkey"
            columns: ["prepare_par_employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_drive_lignes_prepare_par_employe_id_fkey"
            columns: ["prepare_par_employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_drive_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
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
          montant_ttc: number
          montant_tva: number
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
          montant_ttc?: number
          montant_tva?: number
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
          montant_ttc?: number
          montant_tva?: number
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
          prix_ht_total: number | null
          prix_ht_unitaire: number
          produit_id: string
          quantite_conditionnements: number
          quantite_par_conditionnement: number
          quantite_unitaire_totale: number | null
          tva_taux: number | null
        }
        Insert: {
          commande_pro_id: string
          created_at?: string
          id?: string
          prix_ht_total?: number | null
          prix_ht_unitaire: number
          produit_id: string
          quantite_conditionnements: number
          quantite_par_conditionnement: number
          quantite_unitaire_totale?: number | null
          tva_taux?: number | null
        }
        Update: {
          commande_pro_id?: string
          created_at?: string
          id?: string
          prix_ht_total?: number | null
          prix_ht_unitaire?: number
          produit_id?: string
          quantite_conditionnements?: number
          quantite_par_conditionnement?: number
          quantite_unitaire_totale?: number | null
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
      competitor_intel: {
        Row: {
          concurrent_nom: string
          id: string
          libelle_releve: string
          notes: string | null
          photo_url: string | null
          prix_releve_eur: number
          produit_id: string | null
          releve_le: string
          releve_par: string | null
          unite: string | null
        }
        Insert: {
          concurrent_nom?: string
          id?: string
          libelle_releve: string
          notes?: string | null
          photo_url?: string | null
          prix_releve_eur: number
          produit_id?: string | null
          releve_le?: string
          releve_par?: string | null
          unite?: string | null
        }
        Update: {
          concurrent_nom?: string
          id?: string
          libelle_releve?: string
          notes?: string | null
          photo_url?: string | null
          prix_releve_eur?: number
          produit_id?: string | null
          releve_le?: string
          releve_par?: string | null
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_intel_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_intel_releve_par_fkey"
            columns: ["releve_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_intel_releve_par_fkey"
            columns: ["releve_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
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
      consent_log: {
        Row: {
          consent_cgv: boolean
          consent_marketing: boolean
          consent_privacy: boolean
          created_at: string
          email: string | null
          id: string
          ip: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_cgv: boolean
          consent_marketing?: boolean
          consent_privacy: boolean
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_cgv?: boolean
          consent_marketing?: boolean
          consent_privacy?: boolean
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      depots: {
        Row: {
          adresse: string | null
          created_at: string
          id: string
          is_active: boolean
          nom: string
          type: string
        }
        Insert: {
          adresse?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          nom: string
          type: string
        }
        Update: {
          adresse?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          nom?: string
          type?: string
        }
        Relationships: []
      }
      dlc_pricing_rules: {
        Row: {
          active: boolean
          categorie: string
          id: string
          jours_avant_dlc: number
          remise_pct: number
        }
        Insert: {
          active?: boolean
          categorie: string
          id?: string
          jours_avant_dlc: number
          remise_pct: number
        }
        Update: {
          active?: boolean
          categorie?: string
          id?: string
          jours_avant_dlc?: number
          remise_pct?: number
        }
        Relationships: []
      }
      drive_ecarts_poids: {
        Row: {
          action: string
          decision_at: string
          decision_par: string | null
          ecart_pct: number
          id: string
          ligne_id: string
          notes: string | null
        }
        Insert: {
          action: string
          decision_at?: string
          decision_par?: string | null
          ecart_pct: number
          id?: string
          ligne_id: string
          notes?: string | null
        }
        Update: {
          action?: string
          decision_at?: string
          decision_par?: string | null
          ecart_pct?: number
          id?: string
          ligne_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drive_ecarts_poids_decision_par_fkey"
            columns: ["decision_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_ecarts_poids_ligne_id_fkey"
            columns: ["ligne_id"]
            isOneToOne: false
            referencedRelation: "commandes_drive_lignes"
            referencedColumns: ["id"]
          },
        ]
      }
      employes: {
        Row: {
          actif: boolean
          badge_uid: string | null
          contrat_heures_hebdo: number
          depot_principal_id: string | null
          id: string
          is_active: boolean
          nom: string
          observe_ramadan: boolean
          pin_code: string
          pin_hash: string | null
          prenom: string | null
          role: string
          taux_horaire_brut: number | null
        }
        Insert: {
          actif?: boolean
          badge_uid?: string | null
          contrat_heures_hebdo?: number
          depot_principal_id?: string | null
          id?: string
          is_active?: boolean
          nom: string
          observe_ramadan?: boolean
          pin_code: string
          pin_hash?: string | null
          prenom?: string | null
          role: string
          taux_horaire_brut?: number | null
        }
        Update: {
          actif?: boolean
          badge_uid?: string | null
          contrat_heures_hebdo?: number
          depot_principal_id?: string | null
          id?: string
          is_active?: boolean
          nom?: string
          observe_ramadan?: boolean
          pin_code?: string
          pin_hash?: string | null
          prenom?: string | null
          role?: string
          taux_horaire_brut?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employes_depot_principal_id_fkey"
            columns: ["depot_principal_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      fournisseurs: {
        Row: {
          actif: boolean
          adresse: string | null
          certif_expire_le: string | null
          certif_numero: string | null
          certif_organisme:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          certif_pdf_url: string | null
          contact_email: string | null
          contact_telephone: string | null
          created_at: string
          email_commandes: string | null
          franco_de_port: number | null
          id: string
          jours_livraison: number[] | null
          lead_time_jours: number | null
          min_commande_euros: number | null
          nom: string
          siret: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          certif_expire_le?: string | null
          certif_numero?: string | null
          certif_organisme?:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          certif_pdf_url?: string | null
          contact_email?: string | null
          contact_telephone?: string | null
          created_at?: string
          email_commandes?: string | null
          franco_de_port?: number | null
          id?: string
          jours_livraison?: number[] | null
          lead_time_jours?: number | null
          min_commande_euros?: number | null
          nom: string
          siret?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          certif_expire_le?: string | null
          certif_numero?: string | null
          certif_organisme?:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          certif_pdf_url?: string | null
          contact_email?: string | null
          contact_telephone?: string | null
          created_at?: string
          email_commandes?: string | null
          franco_de_port?: number | null
          id?: string
          jours_livraison?: number[] | null
          lead_time_jours?: number | null
          min_commande_euros?: number | null
          nom?: string
          siret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hijri_demand_curve: {
        Row: {
          categorie: string
          id: string
          multiplicateur: number
          notes: string | null
          phase: Database["public"]["Enums"]["hijri_phase"]
          source: string | null
        }
        Insert: {
          categorie: string
          id?: string
          multiplicateur: number
          notes?: string | null
          phase: Database["public"]["Enums"]["hijri_phase"]
          source?: string | null
        }
        Update: {
          categorie?: string
          id?: string
          multiplicateur?: number
          notes?: string | null
          phase?: Database["public"]["Enums"]["hijri_phase"]
          source?: string | null
        }
        Relationships: []
      }
      hijri_events: {
        Row: {
          annee_hijri: number
          date_debut: string
          date_fin: string
          evenement: Database["public"]["Enums"]["hijri_event_type"]
          id: string
          impact_ca: string | null
          libelle: string
          notes: string | null
        }
        Insert: {
          annee_hijri: number
          date_debut: string
          date_fin: string
          evenement: Database["public"]["Enums"]["hijri_event_type"]
          id?: string
          impact_ca?: string | null
          libelle: string
          notes?: string | null
        }
        Update: {
          annee_hijri?: number
          date_debut?: string
          date_fin?: string
          evenement?: Database["public"]["Enums"]["hijri_event_type"]
          id?: string
          impact_ca?: string | null
          libelle?: string
          notes?: string | null
        }
        Relationships: []
      }
      inventaires_tournants: {
        Row: {
          completed_at: string | null
          created_at: string
          date_assignation: string
          depot_id: string
          ecart: number | null
          employe_assigne_id: string
          id: string
          produit_id: string
          quantite_attendue: number | null
          quantite_comptee: number | null
          statut: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          date_assignation?: string
          depot_id: string
          ecart?: number | null
          employe_assigne_id: string
          id?: string
          produit_id: string
          quantite_attendue?: number | null
          quantite_comptee?: number | null
          statut?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          date_assignation?: string
          depot_id?: string
          ecart?: number | null
          employe_assigne_id?: string
          id?: string
          produit_id?: string
          quantite_attendue?: number | null
          quantite_comptee?: number | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventaires_tournants_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventaires_tournants_employe_assigne_id_fkey"
            columns: ["employe_assigne_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventaires_tournants_employe_assigne_id_fkey"
            columns: ["employe_assigne_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventaires_tournants_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      occasion_bundles: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          occasion: string
          product_ids: string[]
          sort: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          occasion: string
          product_ids?: string[]
          sort?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          occasion?: string
          product_ids?: string[]
          sort?: number
        }
        Relationships: []
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
      out_of_stock_notifications: {
        Row: {
          created_at: string
          email: string
          id: string
          notified_at: string | null
          product_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          product_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          product_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "out_of_stock_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      pin_attempts: {
        Row: {
          attempted_at: string
          employe_id: string | null
          id: number
          ip: string | null
          success: boolean
        }
        Insert: {
          attempted_at?: string
          employe_id?: string | null
          id?: number
          ip?: string | null
          success?: boolean
        }
        Update: {
          attempted_at?: string
          employe_id?: string | null
          id?: number
          ip?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pin_attempts_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_attempts_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pointages: {
        Row: {
          anomalie: Database["public"]["Enums"]["anomalie_pointage"]
          check_in: string | null
          check_out: string | null
          created_at: string
          depot_id: string
          device_id: string | null
          duree_travaillee_min: number | null
          employe_id: string
          id: string
          jour: string
          notes: string | null
          pause_debut: string | null
          pause_fin: string | null
          shift_id: string | null
          updated_at: string
        }
        Insert: {
          anomalie?: Database["public"]["Enums"]["anomalie_pointage"]
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          depot_id: string
          device_id?: string | null
          duree_travaillee_min?: number | null
          employe_id: string
          id?: string
          jour?: string
          notes?: string | null
          pause_debut?: string | null
          pause_fin?: string | null
          shift_id?: string | null
          updated_at?: string
        }
        Update: {
          anomalie?: Database["public"]["Enums"]["anomalie_pointage"]
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          depot_id?: string
          device_id?: string | null
          duree_travaillee_min?: number | null
          employe_id?: string
          id?: string
          jour?: string
          notes?: string | null
          pause_debut?: string | null
          pause_fin?: string | null
          shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pointages_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
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
          statut?: string
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
            foreignKeyName: "productions_employe_responsable_id_fkey"
            columns: ["employe_responsable_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_employe_responsable_id_fkey"
            columns: ["employe_responsable_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "productions_couts_indirects_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_productions_kpi"
            referencedColumns: ["id"]
          },
        ]
      }
      productions_inputs: {
        Row: {
          cout_total: number | null
          cout_unitaire_ht: number
          id: string
          production_id: string
          produit_id: string | null
          quantite_prevue: number | null
          quantite_reelle_consommee: number
          scanne_at: string
          scanne_par: string | null
          source_depot_id: string | null
          unite: string
        }
        Insert: {
          cout_total?: number | null
          cout_unitaire_ht: number
          id?: string
          production_id: string
          produit_id?: string | null
          quantite_prevue?: number | null
          quantite_reelle_consommee: number
          scanne_at?: string
          scanne_par?: string | null
          source_depot_id?: string | null
          unite: string
        }
        Update: {
          cout_total?: number | null
          cout_unitaire_ht?: number
          id?: string
          production_id?: string
          produit_id?: string | null
          quantite_prevue?: number | null
          quantite_reelle_consommee?: number
          scanne_at?: string
          scanne_par?: string | null
          source_depot_id?: string | null
          unite?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_inputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_inputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_productions_kpi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_inputs_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_inputs_scanne_par_fkey"
            columns: ["scanne_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_inputs_scanne_par_fkey"
            columns: ["scanne_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_inputs_source_depot_id_fkey"
            columns: ["source_depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
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
          production_id: string
          produit_id: string | null
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
          production_id: string
          produit_id?: string | null
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
          production_id?: string
          produit_id?: string | null
          quantite_prevue?: number | null
          quantite_reelle_produite?: number
          unite?: string
        }
        Relationships: [
          {
            foreignKeyName: "productions_outputs_depot_destination_id_fkey"
            columns: ["depot_destination_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_outputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_outputs_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "v_productions_kpi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_outputs_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
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
      produits: {
        Row: {
          categorie: string | null
          client_type: string | null
          created_at: string
          description: string | null
          description_drive: string | null
          drive_category: string | null
          drive_unit: string | null
          ean: string | null
          est_traiteur: boolean
          estimated_weight_kg: number | null
          id: string
          image_drive_url: string | null
          image_url: string | null
          marque: string | null
          nom: string
          poids_max_kg: number | null
          poids_min_kg: number | null
          price_per_kg: number | null
          prix_drive_cents: number | null
          requires_barcode_print: boolean
          sous_categorie: string | null
          unit_type: string
          updated_at: string
          visible_drive: boolean
        }
        Insert: {
          categorie?: string | null
          client_type?: string | null
          created_at?: string
          description?: string | null
          description_drive?: string | null
          drive_category?: string | null
          drive_unit?: string | null
          ean?: string | null
          est_traiteur?: boolean
          estimated_weight_kg?: number | null
          id?: string
          image_drive_url?: string | null
          image_url?: string | null
          marque?: string | null
          nom: string
          poids_max_kg?: number | null
          poids_min_kg?: number | null
          price_per_kg?: number | null
          prix_drive_cents?: number | null
          requires_barcode_print?: boolean
          sous_categorie?: string | null
          unit_type?: string
          updated_at?: string
          visible_drive?: boolean
        }
        Update: {
          categorie?: string | null
          client_type?: string | null
          created_at?: string
          description?: string | null
          description_drive?: string | null
          drive_category?: string | null
          drive_unit?: string | null
          ean?: string | null
          est_traiteur?: boolean
          estimated_weight_kg?: number | null
          id?: string
          image_drive_url?: string | null
          image_url?: string | null
          marque?: string | null
          nom?: string
          poids_max_kg?: number | null
          poids_min_kg?: number | null
          price_per_kg?: number | null
          prix_drive_cents?: number | null
          requires_barcode_print?: boolean
          sous_categorie?: string | null
          unit_type?: string
          updated_at?: string
          visible_drive?: boolean
        }
        Relationships: []
      }
      produits_fournisseurs: {
        Row: {
          conditionnement_qte: number
          created_at: string
          derniere_commande_le: string | null
          est_principal: boolean
          fournisseur_id: string
          id: string
          notes: string | null
          prix_achat_ht: number | null
          produit_id: string
          reference_fourn: string | null
          updated_at: string
        }
        Insert: {
          conditionnement_qte?: number
          created_at?: string
          derniere_commande_le?: string | null
          est_principal?: boolean
          fournisseur_id: string
          id?: string
          notes?: string | null
          prix_achat_ht?: number | null
          produit_id: string
          reference_fourn?: string | null
          updated_at?: string
        }
        Update: {
          conditionnement_qte?: number
          created_at?: string
          derniere_commande_le?: string | null
          est_principal?: boolean
          fournisseur_id?: string
          id?: string
          notes?: string | null
          prix_achat_ht?: number | null
          produit_id?: string
          reference_fourn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produits_fournisseurs_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_fournisseurs_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "v_fournisseurs_certif_alerte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_fournisseurs_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      produits_lots: {
        Row: {
          abattoir_nom: string | null
          abattoir_pays: string | null
          certifier_id: string | null
          certifier_name: string | null
          certifier_valid_until: string | null
          created_at: string
          date_abattage: string | null
          date_reception: string
          ddm: string | null
          depot_id: string | null
          dlc: string | null
          fournisseur_id: string | null
          id: string
          notes: string | null
          produit_id: string
          qr_url: string | null
          quantite_recue: number | null
          quantite_restante: number | null
          supplier_lot: string | null
          unite: string | null
        }
        Insert: {
          abattoir_nom?: string | null
          abattoir_pays?: string | null
          certifier_id?: string | null
          certifier_name?: string | null
          certifier_valid_until?: string | null
          created_at?: string
          date_abattage?: string | null
          date_reception?: string
          ddm?: string | null
          depot_id?: string | null
          dlc?: string | null
          fournisseur_id?: string | null
          id: string
          notes?: string | null
          produit_id: string
          qr_url?: string | null
          quantite_recue?: number | null
          quantite_restante?: number | null
          supplier_lot?: string | null
          unite?: string | null
        }
        Update: {
          abattoir_nom?: string | null
          abattoir_pays?: string | null
          certifier_id?: string | null
          certifier_name?: string | null
          certifier_valid_until?: string | null
          created_at?: string
          date_abattage?: string | null
          date_reception?: string
          ddm?: string | null
          depot_id?: string | null
          dlc?: string | null
          fournisseur_id?: string | null
          id?: string
          notes?: string | null
          produit_id?: string
          qr_url?: string | null
          quantite_recue?: number | null
          quantite_restante?: number | null
          supplier_lot?: string | null
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produits_lots_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_lots_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_lots_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "v_fournisseurs_certif_alerte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_lots_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
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
          qty_palier_1: number | null
          qty_palier_2: number | null
          quantite_par_conditionnement: number
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
          qty_palier_1?: number | null
          qty_palier_2?: number | null
          quantite_par_conditionnement?: number
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
          qty_palier_1?: number | null
          qty_palier_2?: number | null
          quantite_par_conditionnement?: number
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
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          current_uses: number
          discount_type: string
          id: string
          max_uses: number | null
          min_order_cents: number
          target_audience: string
          valid_from: string
          valid_until: string | null
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          current_uses?: number
          discount_type: string
          id?: string
          max_uses?: number | null
          min_order_cents?: number
          target_audience?: string
          valid_from?: string
          valid_until?: string | null
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          current_uses?: number
          discount_type?: string
          id?: string
          max_uses?: number | null
          min_order_cents?: number
          target_audience?: string
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: []
      }
      purchase_order_lignes: {
        Row: {
          id: string
          ligne_total_ht: number | null
          notes: string | null
          po_id: string
          prix_achat_ht: number
          produit_id: string
          quantite_commandee: number
          quantite_recue: number
          reference_fourn: string | null
          tva_pct: number
        }
        Insert: {
          id?: string
          ligne_total_ht?: number | null
          notes?: string | null
          po_id: string
          prix_achat_ht?: number
          produit_id: string
          quantite_commandee: number
          quantite_recue?: number
          reference_fourn?: string | null
          tva_pct?: number
        }
        Update: {
          id?: string
          ligne_total_ht?: number | null
          notes?: string | null
          po_id?: string
          prix_achat_ht?: number
          produit_id?: string
          quantite_commandee?: number
          quantite_recue?: number
          reference_fourn?: string | null
          tva_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lignes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          bdl_id: string | null
          certif_expire_le_snapshot: string | null
          certif_numero_snapshot: string | null
          certif_organisme_snapshot:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          created_at: string
          cree_par: string | null
          date_creation: string
          date_envoi: string | null
          date_livraison_prevue: string | null
          date_reception: string | null
          depot_destination_id: string
          email_envoye_a: string | null
          email_message_id: string | null
          envoye_par: string | null
          fournisseur_id: string
          id: string
          notes: string | null
          numero_po: string
          statut: Database["public"]["Enums"]["po_statut"]
          total_ht: number
          total_ttc: number
          updated_at: string
        }
        Insert: {
          bdl_id?: string | null
          certif_expire_le_snapshot?: string | null
          certif_numero_snapshot?: string | null
          certif_organisme_snapshot?:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          created_at?: string
          cree_par?: string | null
          date_creation?: string
          date_envoi?: string | null
          date_livraison_prevue?: string | null
          date_reception?: string | null
          depot_destination_id: string
          email_envoye_a?: string | null
          email_message_id?: string | null
          envoye_par?: string | null
          fournisseur_id: string
          id?: string
          notes?: string | null
          numero_po?: string
          statut?: Database["public"]["Enums"]["po_statut"]
          total_ht?: number
          total_ttc?: number
          updated_at?: string
        }
        Update: {
          bdl_id?: string | null
          certif_expire_le_snapshot?: string | null
          certif_numero_snapshot?: string | null
          certif_organisme_snapshot?:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          created_at?: string
          cree_par?: string | null
          date_creation?: string
          date_envoi?: string | null
          date_livraison_prevue?: string | null
          date_reception?: string | null
          depot_destination_id?: string
          email_envoye_a?: string | null
          email_message_id?: string | null
          envoye_par?: string | null
          fournisseur_id?: string
          id?: string
          notes?: string | null
          numero_po?: string
          statut?: Database["public"]["Enums"]["po_statut"]
          total_ht?: number
          total_ttc?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_bdl_id_fkey"
            columns: ["bdl_id"]
            isOneToOne: false
            referencedRelation: "bons_de_livraison"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_bdl_id_fkey"
            columns: ["bdl_id"]
            isOneToOne: false
            referencedRelation: "v_bdl_litiges"
            referencedColumns: ["bdl_id"]
          },
          {
            foreignKeyName: "purchase_orders_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_depot_destination_id_fkey"
            columns: ["depot_destination_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_envoye_par_fkey"
            columns: ["envoye_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_envoye_par_fkey"
            columns: ["envoye_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "v_fournisseurs_certif_alerte"
            referencedColumns: ["id"]
          },
        ]
      }
      push_dedup: {
        Row: {
          meta: Json | null
          rule_key: string
          sent_at: string
        }
        Insert: {
          meta?: Json | null
          rule_key: string
          sent_at?: string
        }
        Update: {
          meta?: Json | null
          rule_key?: string
          sent_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          employe_id: string | null
          enabled: boolean
          endpoint: string
          id: string
          keys_auth: string
          keys_p256dh: string
          last_used_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          employe_id?: string | null
          enabled?: boolean
          endpoint: string
          id?: string
          keys_auth: string
          keys_p256dh: string
          last_used_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          employe_id?: string | null
          enabled?: boolean
          endpoint?: string
          id?: string
          keys_auth?: string
          keys_p256dh?: string
          last_used_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      receptions: {
        Row: {
          created_at: string
          depot_id: string
          employe_id: string
          fournisseur: string | null
          id: string
          numero_bl: string | null
          photo_url: string
          statut: string
        }
        Insert: {
          created_at?: string
          depot_id: string
          employe_id: string
          fournisseur?: string | null
          id?: string
          numero_bl?: string | null
          photo_url: string
          statut?: string
        }
        Update: {
          created_at?: string
          depot_id?: string
          employe_id?: string
          fournisseur?: string | null
          id?: string
          numero_bl?: string | null
          photo_url?: string
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "receptions_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptions_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptions_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      receptions_lignes: {
        Row: {
          code_scanne: string | null
          id: string
          produit_id: string
          quantite_calculee: number
          quantite_scannee: number
          reception_id: string
        }
        Insert: {
          code_scanne?: string | null
          id?: string
          produit_id: string
          quantite_calculee?: number
          quantite_scannee?: number
          reception_id: string
        }
        Update: {
          code_scanne?: string | null
          id?: string
          produit_id?: string
          quantite_calculee?: number
          quantite_scannee?: number
          reception_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receptions_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptions_lignes_reception_id_fkey"
            columns: ["reception_id"]
            isOneToOne: false
            referencedRelation: "receptions"
            referencedColumns: ["id"]
          },
        ]
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
          statut?: string
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
        Relationships: [
          {
            foreignKeyName: "recettes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recettes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
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
          ordre?: number
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
            referencedRelation: "produits"
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
      shifts: {
        Row: {
          created_at: string
          cree_par: string | null
          depot_id: string
          employe_id: string
          est_ramadan: boolean
          heure_debut: string
          heure_fin: string
          id: string
          jour: string
          notes: string | null
          pause_minutes: number
          role_jour: Database["public"]["Enums"]["role_jour"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          cree_par?: string | null
          depot_id: string
          employe_id: string
          est_ramadan?: boolean
          heure_debut: string
          heure_fin: string
          id?: string
          jour: string
          notes?: string | null
          pause_minutes?: number
          role_jour?: Database["public"]["Enums"]["role_jour"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          cree_par?: string | null
          depot_id?: string
          employe_id?: string
          est_ramadan?: boolean
          heure_debut?: string
          heure_fin?: string
          id?: string
          jour?: string
          notes?: string | null
          pause_minutes?: number
          role_jour?: Database["public"]["Enums"]["role_jour"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sorties_stock: {
        Row: {
          created_at: string
          depot_id: string
          employe_id: string
          ia_coherence_notes: string | null
          ia_coherence_score: number | null
          id: string
          lot_id: string | null
          motif_libre: string | null
          photo_url: string
          produit_id: string
          quantite: number
          type: string
        }
        Insert: {
          created_at?: string
          depot_id: string
          employe_id: string
          ia_coherence_notes?: string | null
          ia_coherence_score?: number | null
          id?: string
          lot_id?: string | null
          motif_libre?: string | null
          photo_url: string
          produit_id: string
          quantite: number
          type: string
        }
        Update: {
          created_at?: string
          depot_id?: string
          employe_id?: string
          ia_coherence_notes?: string | null
          ia_coherence_score?: number | null
          id?: string
          lot_id?: string | null
          motif_libre?: string | null
          photo_url?: string
          produit_id?: string
          quantite?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sorties_stock_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorties_stock_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorties_stock_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorties_stock_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "produits_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorties_stock_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_dlc_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "sorties_stock_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_lots_actifs"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "sorties_stock_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_edit_log: {
        Row: {
          delta: number | null
          depot_id: string
          during_inventaire: boolean
          id: string
          modifie_le: string
          modifie_par: string
          produit_id: string
          quantite_apres: number
          quantite_avant: number
          raison: string | null
        }
        Insert: {
          delta?: number | null
          depot_id: string
          during_inventaire?: boolean
          id?: string
          modifie_le?: string
          modifie_par: string
          produit_id: string
          quantite_apres: number
          quantite_avant: number
          raison?: string | null
        }
        Update: {
          delta?: number | null
          depot_id?: string
          during_inventaire?: boolean
          id?: string
          modifie_le?: string
          modifie_par?: string
          produit_id?: string
          quantite_apres?: number
          quantite_avant?: number
          raison?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_edit_log_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_log_modifie_par_fkey"
            columns: ["modifie_par"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_log_modifie_par_fkey"
            columns: ["modifie_par"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_log_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_edit_window: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          depot_id: string
          id: string
          is_open: boolean
          opened_at: string | null
          opened_by: string | null
          raison: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          depot_id: string
          id?: string
          is_open?: boolean
          opened_at?: string | null
          opened_by?: string | null
          raison?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          depot_id?: string
          id?: string
          is_open?: boolean
          opened_at?: string | null
          opened_by?: string | null
          raison?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_edit_window_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_window_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_window_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: true
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_window_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edit_window_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          delta: number
          depot_id: string
          id: string
          lot_id: string | null
          produit_id: string
          quantite_apres: number | null
          quantite_avant: number | null
          reference_id: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          delta: number
          depot_id: string
          id?: string
          lot_id?: string | null
          produit_id: string
          quantite_apres?: number | null
          quantite_avant?: number | null
          reference_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          delta?: number
          depot_id?: string
          id?: string
          lot_id?: string | null
          produit_id?: string
          quantite_apres?: number | null
          quantite_avant?: number | null
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "produits_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_dlc_alerts"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_lots_actifs"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "stock_movements_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_par_depot: {
        Row: {
          depot_id: string
          id: string
          is_visible: boolean
          prix_vente: number | null
          produit_id: string
          quantite: number
          updated_at: string
        }
        Insert: {
          depot_id: string
          id?: string
          is_visible?: boolean
          prix_vente?: number | null
          produit_id: string
          quantite?: number
          updated_at?: string
        }
        Update: {
          depot_id?: string
          id?: string
          is_visible?: boolean
          prix_vente?: number | null
          produit_id?: string
          quantite?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_par_depot_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_par_depot_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      stockout_forecast: {
        Row: {
          computed_at: string
          days_cover: number | null
          depot_id: string
          multiplicateur: number
          phase_courante: Database["public"]["Enums"]["hijri_phase"]
          produit_id: string
          reason: string | null
          stock_actuel: number
          tier: Database["public"]["Enums"]["stockout_tier"]
          velocity_adj: number
          velocity_base: number
        }
        Insert: {
          computed_at?: string
          days_cover?: number | null
          depot_id: string
          multiplicateur?: number
          phase_courante?: Database["public"]["Enums"]["hijri_phase"]
          produit_id: string
          reason?: string | null
          stock_actuel: number
          tier?: Database["public"]["Enums"]["stockout_tier"]
          velocity_adj: number
          velocity_base: number
        }
        Update: {
          computed_at?: string
          days_cover?: number | null
          depot_id?: string
          multiplicateur?: number
          phase_courante?: Database["public"]["Enums"]["hijri_phase"]
          produit_id?: string
          reason?: string | null
          stock_actuel?: number
          tier?: Database["public"]["Enums"]["stockout_tier"]
          velocity_adj?: number
          velocity_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "stockout_forecast_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockout_forecast_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      transferts_inter_depots: {
        Row: {
          created_at: string
          depot_destination_id: string
          depot_source_id: string
          employe_id: string
          id: string
          photo_url: string | null
          produit_id: string
          quantite: number
        }
        Insert: {
          created_at?: string
          depot_destination_id: string
          depot_source_id: string
          employe_id: string
          id?: string
          photo_url?: string | null
          produit_id: string
          quantite: number
        }
        Update: {
          created_at?: string
          depot_destination_id?: string
          depot_source_id?: string
          employe_id?: string
          id?: string
          photo_url?: string | null
          produit_id?: string
          quantite?: number
        }
        Relationships: [
          {
            foreignKeyName: "transferts_inter_depots_depot_destination_id_fkey"
            columns: ["depot_destination_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_inter_depots_depot_source_id_fkey"
            columns: ["depot_source_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_inter_depots_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_inter_depots_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferts_inter_depots_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      velocity_state: {
        Row: {
          alpha: number
          beta: number
          computed_at: string
          depot_id: string
          last_observed_at: string | null
          last_observed_qty: number | null
          level: number
          produit_id: string
          trend: number
        }
        Insert: {
          alpha?: number
          beta?: number
          computed_at?: string
          depot_id: string
          last_observed_at?: string | null
          last_observed_qty?: number | null
          level?: number
          produit_id: string
          trend?: number
        }
        Update: {
          alpha?: number
          beta?: number
          computed_at?: string
          depot_id?: string
          last_observed_at?: string | null
          last_observed_qty?: number | null
          level?: number
          produit_id?: string
          trend?: number
        }
        Relationships: [
          {
            foreignKeyName: "velocity_state_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "velocity_state_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      ventes_cashmag_import: {
        Row: {
          code_barre: string | null
          date_vente: string
          designation: string
          heure_vente: string | null
          id: string
          imported_at: string
          imported_by: string | null
          mode_paiement: string | null
          numero_ticket: string
          prix_ht: number | null
          prix_ttc: number
          quantite: number
          raw_hash: string | null
          raw_line: string | null
          tva_taux: number | null
        }
        Insert: {
          code_barre?: string | null
          date_vente: string
          designation: string
          heure_vente?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          mode_paiement?: string | null
          numero_ticket: string
          prix_ht?: number | null
          prix_ttc: number
          quantite?: number
          raw_hash?: string | null
          raw_line?: string | null
          tva_taux?: number | null
        }
        Update: {
          code_barre?: string | null
          date_vente?: string
          designation?: string
          heure_vente?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          mode_paiement?: string | null
          numero_ticket?: string
          prix_ht?: number | null
          prix_ttc?: number
          quantite?: number
          raw_hash?: string | null
          raw_line?: string | null
          tva_taux?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      commandes_drive_safe: {
        Row: {
          autorisation_expire_at: string | null
          bay_label: string | null
          created_at: string | null
          creneau_retrait: string | null
          id: string | null
          mode_paiement: string | null
          montant_autorise_ttc: number | null
          montant_capture_ttc: number | null
          numero_commande: string | null
          pret_at: string | null
          retired_at: string | null
          statut: string | null
          statut_paiement: string | null
          stripe_payment_intent_id: string | null
          total_ttc: number | null
        }
        Insert: {
          autorisation_expire_at?: string | null
          bay_label?: string | null
          created_at?: string | null
          creneau_retrait?: string | null
          id?: string | null
          mode_paiement?: string | null
          montant_autorise_ttc?: number | null
          montant_capture_ttc?: number | null
          numero_commande?: string | null
          pret_at?: string | null
          retired_at?: string | null
          statut?: string | null
          statut_paiement?: string | null
          stripe_payment_intent_id?: string | null
          total_ttc?: number | null
        }
        Update: {
          autorisation_expire_at?: string | null
          bay_label?: string | null
          created_at?: string | null
          creneau_retrait?: string | null
          id?: string | null
          mode_paiement?: string | null
          montant_autorise_ttc?: number | null
          montant_capture_ttc?: number | null
          numero_commande?: string | null
          pret_at?: string | null
          retired_at?: string | null
          statut?: string | null
          statut_paiement?: string | null
          stripe_payment_intent_id?: string | null
          total_ttc?: number | null
        }
        Relationships: []
      }
      employes_public: {
        Row: {
          actif: boolean | null
          depot_principal_id: string | null
          id: string | null
          is_active: boolean | null
          nom: string | null
          prenom: string | null
          role: string | null
        }
        Insert: {
          actif?: boolean | null
          depot_principal_id?: string | null
          id?: string | null
          is_active?: boolean | null
          nom?: string | null
          prenom?: string | null
          role?: string | null
        }
        Update: {
          actif?: boolean | null
          depot_principal_id?: string | null
          id?: string | null
          is_active?: boolean | null
          nom?: string | null
          prenom?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employes_depot_principal_id_fkey"
            columns: ["depot_principal_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_ventes_quotidiennes: {
        Row: {
          ca_ttc: number | null
          jour: string | null
          nb_lignes_import: number | null
          nb_tickets: number | null
          panier_moyen: number | null
        }
        Relationships: []
      }
      v_bdl_litiges: {
        Row: {
          bdl_id: string | null
          depot_destination_id: string | null
          depot_nom: string | null
          ecart_ligne_eur: number | null
          ecart_qte: number | null
          ecart_valeur_eur: number | null
          fournisseur_id: string | null
          fournisseur_nom: string | null
          ligne_id: string | null
          numero_bdl: string | null
          prix_achat_ht: number | null
          produit_id: string | null
          produit_nom: string | null
          quantite_attendue: number | null
          quantite_recue: number | null
          receptionne_le: string | null
          temperature_reception_c: number | null
          temperature_seuil_max_c: number | null
          valide_par_comptable: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bons_de_livraison_depot_destination_id_fkey"
            columns: ["depot_destination_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "v_fournisseurs_certif_alerte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_lignes_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_valide_par_comptable_fkey"
            columns: ["valide_par_comptable"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bons_de_livraison_valide_par_comptable_fkey"
            columns: ["valide_par_comptable"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_casse_baseline_28j: {
        Row: {
          computed_at: string | null
          depot_id: string | null
          mu_eur: number | null
          nb_jours_avec_casse: number | null
          p95_eur: number | null
          produit_id: string | null
          sigma_eur: number | null
          total_eur_28j: number | null
          total_qte_28j: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sorties_stock_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorties_stock_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_casse_digest_semaine: {
        Row: {
          baseline_mu_eur: number | null
          baseline_sigma_eur: number | null
          depot_id: string | null
          depot_nom: string | null
          ecart_sigma: number | null
          produit_id: string | null
          produit_nom: string | null
          qte: number | null
          valeur_eur: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sorties_stock_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorties_stock_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_casse_pic_horaire: {
        Row: {
          depot_id: string | null
          heure: number | null
          jour_semaine: number | null
          nb_evenements: number | null
          user_hash: string | null
          valeur_perdue_eur: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sorties_stock_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dlc_alerts: {
        Row: {
          dlc: string | null
          jours_restants: number | null
          lot_id: string | null
          niveau_alerte: string | null
          produit_categorie: string | null
          produit_id: string | null
          produit_nom: string | null
          quantite_recue: number | null
          remise_suggeree_pct: number | null
          unite: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produits_lots_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fournisseurs_certif_alerte: {
        Row: {
          alerte: string | null
          certif_expire_le: string | null
          certif_numero: string | null
          certif_organisme:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          id: string | null
          jours_restants: number | null
          nom: string | null
        }
        Insert: {
          alerte?: never
          certif_expire_le?: string | null
          certif_numero?: string | null
          certif_organisme?:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          id?: string | null
          jours_restants?: never
          nom?: string | null
        }
        Update: {
          alerte?: never
          certif_expire_le?: string | null
          certif_numero?: string | null
          certif_organisme?:
            | Database["public"]["Enums"]["certif_organisme"]
            | null
          id?: string | null
          jours_restants?: never
          nom?: string | null
        }
        Relationships: []
      }
      v_lots_actifs: {
        Row: {
          certifier_name: string | null
          depot_id: string | null
          dlc: string | null
          epuise: boolean | null
          jours_restants: number | null
          lot_id: string | null
          produit_id: string | null
          produit_nom: string | null
          quantite_recue: number | null
          quantite_restante: number | null
          unite: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produits_lots_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produits_lots_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_productions_kpi: {
        Row: {
          ca_potentiel_ht: number | null
          ca_potentiel_ttc: number | null
          cout_indirects: number | null
          cout_matieres: number | null
          cout_total: number | null
          date_production: string | null
          id: string | null
          input_total_qty: number | null
          lot_numero: string | null
          marge_eur_ht: number | null
          marge_pct_ht: number | null
          output_total_qty: number | null
          recette: string | null
          rendement_pct: number | null
        }
        Relationships: []
      }
      v_staff_presents: {
        Row: {
          anomalie: Database["public"]["Enums"]["anomalie_pointage"] | null
          check_in: string | null
          depot_id: string | null
          depot_nom: string | null
          employe_id: string | null
          employe_nom: string | null
          employe_prenom: string | null
          etat: string | null
          fin_prevue: string | null
          pause_debut: string | null
          pause_fin: string | null
          pointage_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pointages_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes_public"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stockout_critiques: {
        Row: {
          computed_at: string | null
          days_cover: number | null
          depot_id: string | null
          depot_nom: string | null
          ean: string | null
          multiplicateur: number | null
          phase_courante: Database["public"]["Enums"]["hijri_phase"] | null
          produit_id: string | null
          produit_nom: string | null
          reason: string | null
          stock_actuel: number | null
          tier: Database["public"]["Enums"]["stockout_tier"] | null
          velocity_adj: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stockout_forecast_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stockout_forecast_produit_id_fkey"
            columns: ["produit_id"]
            isOneToOne: false
            referencedRelation: "produits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _pin_attempt_ip: { Args: never; Returns: string }
      adjust_stock: {
        Args: {
          p_actor_id?: string
          p_delta: number
          p_depot_id: string
          p_lot_id?: string
          p_produit_id: string
          p_reference_id?: string
          p_type: string
        }
        Returns: number
      }
      assign_next_bay: { Args: { p_commande_id: string }; Returns: string }
      bdl_ligne_push_event: {
        Args: { p_event: Json; p_ligne_id: string }
        Returns: undefined
      }
      bdl_recalc_ecart: { Args: { p_bdl_id: string }; Returns: number }
      consume_lot_fefo: {
        Args: { p_depot_id?: string; p_produit_id: string; p_quantite: number }
        Returns: string
      }
      current_user_role: { Args: never; Returns: string }
      dlc_remise_plancher: { Args: { niveau: string }; Returns: number }
      fournisseur_certif_halal_valide: {
        Args: { p_fournisseur_id: string }
        Returns: boolean
      }
      get_employe_safe: {
        Args: { p_id: string }
        Returns: {
          depot_principal_id: string
          id: string
          is_active: boolean
          nom: string
          prenom: string
          role: string
        }[]
      }
      pointage_check_in: {
        Args: { p_depot_id: string; p_device_id?: string; p_employe_id: string }
        Returns: string
      }
      pointage_check_out: { Args: { p_employe_id: string }; Returns: string }
      prix_vente_unitaire_eur: {
        Args: { price_per_kg: number; prix_drive_cents: number }
        Returns: number
      }
      refresh_casse_views: { Args: never; Returns: undefined }
      refresh_mv_ventes_quotidiennes: { Args: never; Returns: undefined }
      set_user_role: {
        Args: { p_email: string; p_role: string }
        Returns: undefined
      }
      transfer_stock: {
        Args: {
          p_actor_id?: string
          p_depot_dest: string
          p_depot_source: string
          p_produit_id: string
          p_quantite: number
          p_reference_id?: string
        }
        Returns: number
      }
      unaccent: { Args: { "": string }; Returns: string }
      validate_promo_code: {
        Args: { p_code: string; p_total_cents: number }
        Returns: Json
      }
      verify_pin: { Args: { p_pin: string }; Returns: string }
    }
    Enums: {
      anomalie_pointage:
        | "aucune"
        | "sans_planning"
        | "retard"
        | "depart_anticipe"
        | "oubli"
        | "pause_trop_longue"
      certif_organisme:
        | "AVS"
        | "ARGML"
        | "ACMIF"
        | "SFCVH"
        | "MOSQUEE_PARIS"
        | "AUTRE"
      hijri_event_type:
        | "ramadan_debut"
        | "ramadan_milieu"
        | "ramadan_fin_10j"
        | "ramadan_fin"
        | "aid_fitr"
        | "aid_adha"
        | "achoura"
        | "mouloud"
        | "rajab"
        | "chaabane_15"
      hijri_phase:
        | "normal"
        | "pre_ramadan_j7"
        | "ramadan_debut"
        | "ramadan_milieu"
        | "ramadan_fin_10j"
        | "aid_fitr_j3"
        | "pre_aid_adha_j7"
        | "aid_adha_j3"
        | "achoura_j3"
      po_statut:
        | "brouillon"
        | "envoyee"
        | "confirmee"
        | "partiellement_recue"
        | "recue"
        | "annulee"
      role_jour:
        | "caisse"
        | "rayon"
        | "reception"
        | "boucherie"
        | "livraison"
        | "manager"
        | "polyvalent"
      stockout_tier: "ok" | "warn" | "crit" | "blocker" | "out"
      zone_preparation_drive: "particulier" | "professionnel" | "traiteur"
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
    Enums: {
      anomalie_pointage: [
        "aucune",
        "sans_planning",
        "retard",
        "depart_anticipe",
        "oubli",
        "pause_trop_longue",
      ],
      certif_organisme: [
        "AVS",
        "ARGML",
        "ACMIF",
        "SFCVH",
        "MOSQUEE_PARIS",
        "AUTRE",
      ],
      hijri_event_type: [
        "ramadan_debut",
        "ramadan_milieu",
        "ramadan_fin_10j",
        "ramadan_fin",
        "aid_fitr",
        "aid_adha",
        "achoura",
        "mouloud",
        "rajab",
        "chaabane_15",
      ],
      hijri_phase: [
        "normal",
        "pre_ramadan_j7",
        "ramadan_debut",
        "ramadan_milieu",
        "ramadan_fin_10j",
        "aid_fitr_j3",
        "pre_aid_adha_j7",
        "aid_adha_j3",
        "achoura_j3",
      ],
      po_statut: [
        "brouillon",
        "envoyee",
        "confirmee",
        "partiellement_recue",
        "recue",
        "annulee",
      ],
      role_jour: [
        "caisse",
        "rayon",
        "reception",
        "boucherie",
        "livraison",
        "manager",
        "polyvalent",
      ],
      stockout_tier: ["ok", "warn", "crit", "blocker", "out"],
      zone_preparation_drive: ["particulier", "professionnel", "traiteur"],
    },
  },
} as const
