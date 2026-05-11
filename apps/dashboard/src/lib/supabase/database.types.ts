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
      api_keys: {
        Row: { created_at: string; created_by: string | null; id: string; key_id: string; last_used_at: string | null; name: string; revoked_at: string | null; scope: Database["public"]["Enums"]["api_key_scope"]; secret_hash: string; tenant_id: string }
        Insert: { created_at?: string; created_by?: string | null; id?: string; key_id: string; last_used_at?: string | null; name: string; revoked_at?: string | null; scope?: Database["public"]["Enums"]["api_key_scope"]; secret_hash: string; tenant_id: string }
        Update: { created_at?: string; created_by?: string | null; id?: string; key_id?: string; last_used_at?: string | null; name?: string; revoked_at?: string | null; scope?: Database["public"]["Enums"]["api_key_scope"]; secret_hash?: string; tenant_id?: string }
        Relationships: [{ foreignKeyName: "api_keys_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      bindings: {
        Row: { bound_at: string; notes: string | null; provider_id: string; provisional: boolean; role: string; tenant_id: string }
        Insert: { bound_at?: string; notes?: string | null; provider_id: string; provisional?: boolean; role: string; tenant_id: string }
        Update: { bound_at?: string; notes?: string | null; provider_id?: string; provisional?: boolean; role?: string; tenant_id?: string }
        Relationships: [{ foreignKeyName: "bindings_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      memory_files: {
        Row: { body_blocks: Json; content: string; created_at: string; fields: Json; frontmatter: Json; id: string; path: string; slug: string | null; status: Database["public"]["Enums"]["memory_status"]; tenant_id: string; title: string | null; type: Database["public"]["Enums"]["memory_type"] | null; updated_at: string }
        Insert: { body_blocks?: Json; content: string; created_at?: string; fields?: Json; frontmatter?: Json; id?: string; path: string; slug?: string | null; status?: Database["public"]["Enums"]["memory_status"]; tenant_id: string; title?: string | null; type?: Database["public"]["Enums"]["memory_type"] | null; updated_at?: string }
        Update: { body_blocks?: Json; content?: string; created_at?: string; fields?: Json; frontmatter?: Json; id?: string; path?: string; slug?: string | null; status?: Database["public"]["Enums"]["memory_status"]; tenant_id?: string; title?: string | null; type?: Database["public"]["Enums"]["memory_type"] | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "memory_files_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      memory_relations: {
        Row: { created_at: string; created_by: string | null; dst_id: string; id: string; kind: Database["public"]["Enums"]["memory_relation_kind"]; src_id: string; tenant_id: string }
        Insert: { created_at?: string; created_by?: string | null; dst_id: string; id?: string; kind: Database["public"]["Enums"]["memory_relation_kind"]; src_id: string; tenant_id: string }
        Update: { created_at?: string; created_by?: string | null; dst_id?: string; id?: string; kind?: Database["public"]["Enums"]["memory_relation_kind"]; src_id?: string; tenant_id?: string }
        Relationships: [{ foreignKeyName: "memory_relations_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }, { foreignKeyName: "memory_relations_src_id_fkey"; columns: ["src_id"]; isOneToOne: false; referencedRelation: "memory_files"; referencedColumns: ["id"] }, { foreignKeyName: "memory_relations_dst_id_fkey"; columns: ["dst_id"]; isOneToOne: false; referencedRelation: "memory_files"; referencedColumns: ["id"] }]
      }
      operations_log: {
        Row: { action: string; actor: string; id: number; lkg_at_emit: number | null; payload: Json; state_hash: string | null; target: string | null; tenant_id: string; ts: string; v: number }
        Insert: { action: string; actor: string; id?: number; lkg_at_emit?: number | null; payload?: Json; state_hash?: string | null; target?: string | null; tenant_id: string; ts?: string; v: number }
        Update: { action?: string; actor?: string; id?: number; lkg_at_emit?: number | null; payload?: Json; state_hash?: string | null; target?: string | null; tenant_id?: string; ts?: string; v?: number }
        Relationships: [{ foreignKeyName: "operations_log_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      profiles: {
        Row: { avatar_url: string | null; created_at: string; display_name: string | null; identifier: string; provider: string; tenant_id: string; user_id: string }
        Insert: { avatar_url?: string | null; created_at?: string; display_name?: string | null; identifier: string; provider: string; tenant_id: string; user_id: string }
        Update: { avatar_url?: string | null; created_at?: string; display_name?: string | null; identifier?: string; provider?: string; tenant_id?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "profiles_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      proposals_accepted: {
        Row: { accepted_at: string; accepted_by: string | null; body: string; frontmatter: Json; hash: string | null; proposal_id: string; tenant_id: string }
        Insert: { accepted_at?: string; accepted_by?: string | null; body: string; frontmatter?: Json; hash?: string | null; proposal_id: string; tenant_id: string }
        Update: { accepted_at?: string; accepted_by?: string | null; body?: string; frontmatter?: Json; hash?: string | null; proposal_id?: string; tenant_id?: string }
        Relationships: [{ foreignKeyName: "proposals_accepted_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      proposals_rejected: {
        Row: { body: string; frontmatter: Json; proposal_id: string; reason: string; rejected_at: string; rejected_by: string | null; tenant_id: string }
        Insert: { body: string; frontmatter?: Json; proposal_id: string; reason: string; rejected_at?: string; rejected_by?: string | null; tenant_id: string }
        Update: { body?: string; frontmatter?: Json; proposal_id?: string; reason?: string; rejected_at?: string; rejected_by?: string | null; tenant_id?: string }
        Relationships: [{ foreignKeyName: "proposals_rejected_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      queue_items: {
        Row: { body: string; created_at: string; cross_leaf_impact: Json | null; frontmatter: Json; id: string; manager_review: Json | null; promotion_check: Json | null; proposal_id: string; reject_reason: string | null; resolved_at: string | null; status: Database["public"]["Enums"]["queue_status"]; tenant_id: string }
        Insert: { body: string; created_at?: string; cross_leaf_impact?: Json | null; frontmatter?: Json; id?: string; manager_review?: Json | null; promotion_check?: Json | null; proposal_id: string; reject_reason?: string | null; resolved_at?: string | null; status?: Database["public"]["Enums"]["queue_status"]; tenant_id: string }
        Update: { body?: string; created_at?: string; cross_leaf_impact?: Json | null; frontmatter?: Json; id?: string; manager_review?: Json | null; promotion_check?: Json | null; proposal_id?: string; reject_reason?: string | null; resolved_at?: string | null; status?: Database["public"]["Enums"]["queue_status"]; tenant_id?: string }
        Relationships: [{ foreignKeyName: "queue_items_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      role_templates: {
        Row: { base_role: Database["public"]["Enums"]["tenant_role"]; created_at: string; description: string; display_name: string; focus_areas: string[]; is_predefined: boolean; permission_tags: string[]; slug: string }
        Insert: { base_role: Database["public"]["Enums"]["tenant_role"]; created_at?: string; description?: string; display_name: string; focus_areas?: string[]; is_predefined?: boolean; permission_tags?: string[]; slug: string }
        Update: { base_role?: Database["public"]["Enums"]["tenant_role"]; created_at?: string; description?: string; display_name?: string; focus_areas?: string[]; is_predefined?: boolean; permission_tags?: string[]; slug?: string }
        Relationships: []
      }
      tenant_invitations: {
        Row: { consumed_at: string | null; created_at: string; id: string; identifier: string; invitation_token: string | null; invited_by: string | null; provider: string; role: Database["public"]["Enums"]["tenant_role"]; template_slug: string | null; tenant_id: string }
        Insert: { consumed_at?: string | null; created_at?: string; id?: string; identifier: string; invitation_token?: string | null; invited_by?: string | null; provider: string; role?: Database["public"]["Enums"]["tenant_role"]; template_slug?: string | null; tenant_id: string }
        Update: { consumed_at?: string | null; created_at?: string; id?: string; identifier?: string; invitation_token?: string | null; invited_by?: string | null; provider?: string; role?: Database["public"]["Enums"]["tenant_role"]; template_slug?: string | null; tenant_id?: string }
        Relationships: [{ foreignKeyName: "tenant_invitations_template_slug_fkey"; columns: ["template_slug"]; isOneToOne: false; referencedRelation: "role_templates"; referencedColumns: ["slug"] }, { foreignKeyName: "tenant_invitations_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      tenant_members: {
        Row: { joined_at: string; role: Database["public"]["Enums"]["tenant_role"]; template_slug: string | null; tenant_id: string; user_id: string }
        Insert: { joined_at?: string; role?: Database["public"]["Enums"]["tenant_role"]; template_slug?: string | null; tenant_id: string; user_id: string }
        Update: { joined_at?: string; role?: Database["public"]["Enums"]["tenant_role"]; template_slug?: string | null; tenant_id?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "tenant_members_template_slug_fkey"; columns: ["template_slug"]; isOneToOne: false; referencedRelation: "role_templates"; referencedColumns: ["slug"] }, { foreignKeyName: "tenant_members_tenant_id_fkey"; columns: ["tenant_id"]; isOneToOne: false; referencedRelation: "tenants"; referencedColumns: ["id"] }]
      }
      tenants: {
        Row: { created_at: string; created_by: string | null; id: string; name: string; plan: string; slug: string }
        Insert: { created_at?: string; created_by?: string | null; id?: string; name: string; plan?: string; slug: string }
        Update: { created_at?: string; created_by?: string | null; id?: string; name?: string; plan?: string; slug?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      _compose_api_key: { Args: { p_key_id: string; p_secret: string }; Returns: string }
      _require_admin: { Args: never; Returns: { out_actor: string; out_tenant_id: string; out_user_id: string }[] }
      accept_proposal: { Args: { p_proposal_id: string }; Returns: undefined }
      auth_tenant: { Args: never; Returns: string }
      change_member_role: { Args: { p_new_role: Database["public"]["Enums"]["tenant_role"]; p_user_id: string }; Returns: undefined }
      consume_invitation_token: { Args: { p_token: string }; Returns: undefined }
      create_api_key: { Args: { p_name: string; p_scope?: Database["public"]["Enums"]["api_key_scope"] }; Returns: string }
      create_invitation: { Args: { p_identifier: string; p_provider: string; p_template_slug?: string }; Returns: string }
      create_tenant_with_seed: { Args: { p_name: string; p_owner_user_id: string; p_slug: string }; Returns: string }
      is_member_of: { Args: { p_tenant_id: string }; Returns: boolean }
      reject_proposal: { Args: { p_proposal_id: string; p_reason: string }; Returns: undefined }
      remove_member: { Args: { p_user_id: string }; Returns: undefined }
      resolve_api_key: { Args: { p_token: string }; Returns: { out_key_id: string; out_scope: Database["public"]["Enums"]["api_key_scope"]; out_tenant_id: string }[] }
      resolve_invitation_token: { Args: { p_token: string }; Returns: { out_consumed: boolean; out_email: string; out_provider: string; out_role: Database["public"]["Enums"]["tenant_role"]; out_tenant_name: string; out_tenant_slug: string }[] }
      revoke_api_key: { Args: { p_key_id: string }; Returns: undefined }
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined }
      setup_self_serve_tenant: { Args: { p_email: string; p_name: string; p_slug: string }; Returns: string }
    }
    Enums: {
      api_key_scope: "read" | "write" | "admin"
      memory_relation_kind: "cites" | "supersedes" | "implements" | "exemplifies" | "owned_by"
      memory_status: "draft" | "active" | "archived"
      memory_type: "voice" | "decision" | "glossary" | "vendor" | "product" | "team" | "skill"
      queue_status: "pending" | "accepted" | "rejected"
      tenant_role: "admin" | "member" | "viewer"
    }
    CompositeTypes: { [_ in never]: never }
  }
}
