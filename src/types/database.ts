export type UserRole = "super_admin" | "branch_leader";
export type InvitationStatus = "pending" | "accepted" | "expired";
export type UniformCategory = "top" | "bottom" | "footwear" | "accessory" | "outer" | "head";
export type PreviewStatus = "none" | "processing" | "ready" | "failed";
export type Gender = "male" | "female";
export type BodyZone =
  | "head" | "top" | "outer" | "bottom" | "footwear"
  | "accessory_neck" | "accessory_wrist_left" | "accessory_wrist_right"
  | "accessory_belt" | "accessory_chest_pin" | "accessory_bag";

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          slug: string;
          view_code: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["branches"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: UserRole;
          branch_id: string | null;
          avatar_url: string | null;
          must_change_password: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      invitations: {
        Row: {
          id: string;
          email: string;
          branch_id: string;
          role: UserRole;
          status: InvitationStatus;
          expires_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["invitations"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
      };
      departments: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["departments"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["departments"]["Insert"]>;
      };
      uniforms: {
        Row: {
          id: string;
          branch_id: string;
          department_id: string;
          name: string;
          category: UniformCategory;
          image_url: string | null;
          raw_image_url: string | null;
          storage_path: string | null;
          description: string | null;
          is_archived: boolean;
          bg_removed: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["uniforms"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["uniforms"]["Insert"]>;
      };
      combinations: {
        Row: {
          id: string;
          branch_id: string;
          department_id: string;
          name: string;
          description: string | null;
          canvas_data: Record<string, unknown> | null;
          preview_url: string | null;
          // AI preview columns (Phase 1 migration)
          male_composite_url: string | null;
          female_composite_url: string | null;
          male_gif_url: string | null;
          female_gif_url: string | null;
          preview_status: PreviewStatus;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["combinations"]["Row"], "id" | "created_at" | "preview_status"> & { preview_status?: PreviewStatus };
        Update: Partial<Database["public"]["Tables"]["combinations"]["Insert"]>;
      };
      combination_zone_items: {
        Row: {
          id: string;
          combination_id: string;
          gender: Gender;
          zone: BodyZone;
          uniform_id: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["combination_zone_items"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["combination_zone_items"]["Insert"]>;
      };
      replicate_jobs: {
        Row: {
          id: string;
          combination_id: string | null;
          prediction_id: string;
          job_type: string;
          gender: Gender | null;
          sequence_index: number;
          total_steps: number;
          current_image_url: string | null;
          next_uniform_id: string | null;
          status: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["replicate_jobs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["replicate_jobs"]["Insert"]>;
      };
      schedule_assignments: {
        Row: {
          id: string;
          schedule_id: string;
          department_id: string;
          combination_id: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["schedule_assignments"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["schedule_assignments"]["Insert"]>;
      };
      department_members: {
        Row: {
          id: string;
          department_id: string;
          branch_id: string;
          name: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["department_members"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["department_members"]["Insert"]>;
      };
      combination_items: {
        Row: {
          id: string;
          combination_id: string;
          uniform_id: string;
          layer_order: number;
          x: number;
          y: number;
          scale_x: number;
          scale_y: number;
          rotation: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["combination_items"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["combination_items"]["Insert"]>;
      };
      schedules: {
        Row: {
          id: string;
          branch_id: string;
          combination_id: string | null;
          service_date: string;
          title: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["schedules"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["schedules"]["Insert"]>;
      };
      inventory_items: {
        Row: {
          id: string;
          branch_id: string;
          uniform_id: string;
          quantity: number;
          unit: string;
          reorder_level: number;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["inventory_items"]["Row"], "id" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["inventory_items"]["Insert"]>;
      };
      inventory_transactions: {
        Row: {
          id: string;
          branch_id: string;
          inventory_item_id: string;
          change_amount: number;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["inventory_transactions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["inventory_transactions"]["Insert"]>;
      };
      announcements: {
        Row: {
          id: string;
          branch_id: string;
          title: string;
          body: string | null;
          is_published: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["announcements"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["announcements"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          branch_id: string | null;
          user_id: string | null;
          action: string;
          table_name: string | null;
          record_id: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at">;
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      body_zone: BodyZone;
    };
  };
}

// Convenience row types
export type Branch = Database["public"]["Tables"]["branches"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Invitation = Database["public"]["Tables"]["invitations"]["Row"];
export type Department = Database["public"]["Tables"]["departments"]["Row"];
export type DepartmentMember = Database["public"]["Tables"]["department_members"]["Row"];
export type Uniform = Database["public"]["Tables"]["uniforms"]["Row"];
export type Combination = Database["public"]["Tables"]["combinations"]["Row"];
export type CombinationItem = Database["public"]["Tables"]["combination_items"]["Row"];
export type CombinationZoneItem = Database["public"]["Tables"]["combination_zone_items"]["Row"];
export type ReplicateJob = Database["public"]["Tables"]["replicate_jobs"]["Row"];
export type Schedule = Database["public"]["Tables"]["schedules"]["Row"];
export type ScheduleAssignment = Database["public"]["Tables"]["schedule_assignments"]["Row"];
export type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"];
export type InventoryTransaction = Database["public"]["Tables"]["inventory_transactions"]["Row"];
export type Announcement = Database["public"]["Tables"]["announcements"]["Row"];
export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

// Extended types with computed fields
export type DepartmentWithCounts = Department & {
  uniform_count: number;
  combination_count: number;
  member_count: number;
};

// Zone item with joined uniform data (uniform may be null if the uniform was deleted)
export type CombinationZoneItemWithUniform = CombinationZoneItem & {
  uniform: Uniform | null;
};

// Schedule with nested assignments
export type ScheduleWithAssignments = Schedule & {
  assignments: Array<ScheduleAssignment & {
    department: Department;
    combination: Combination;
  }>;
};
