export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          identifier: string
          provider: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          identifier: string
          provider: string
          tenant_id: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          identifier?: string
          provider?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          created_at: string
          id: string
          identifier: string
          invited_by: string | null
          provider: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          invited_by?: string | null
          provider: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          invited_by?: string | null
          provider?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan?: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      auth_tenant: { Args: never; Returns: string }
      is_member_of: { Args: { p_tenant_id: string }; Returns: boolean }
    }
    Enums: {
      tenant_role: "admin" | "member" | "viewer"
    }
    CompositeTypes: { [_ in never]: never }
  }
}
