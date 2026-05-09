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
      allowlist: {
        Row: {
          created_at: string
          id: string
          identifier: string
          invited_by: string | null
          note: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          invited_by?: string | null
          note?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          invited_by?: string | null
          note?: string | null
          provider?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          identifier: string
          provider: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          identifier: string
          provider: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          identifier?: string
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
