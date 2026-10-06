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
      applications: {
        Row: {
          commutes_to_sahel: boolean | null
          consents_to_processing: boolean
          created_at: string
          current_employer: string | null
          current_job_title: string | null
          current_salary_egp: number
          cv_file_name: string
          cv_parsed_at: string | null
          cv_path: string
          cv_summary: Json | null
          date_of_birth: string | null
          declares_accurate: boolean
          email: string
          expected_salary_egp: number
          full_name: string
          graduation_year: number
          id: string
          job_id: string
          linkedin_url: string | null
          location: string
          match_rationale: string | null
          match_score: number | null
          mobile: string
          notice_period: Database["public"]["Enums"]["notice_period"]
          opened_at: string | null
          other_benefits: string | null
          position: string
          scored_at: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          years_of_experience: number
        }
        Insert: {
          commutes_to_sahel?: boolean | null
          consents_to_processing: boolean
          created_at?: string
          current_employer?: string | null
          current_job_title?: string | null
          current_salary_egp: number
          cv_file_name: string
          cv_parsed_at?: string | null
          cv_path: string
          cv_summary?: Json | null
          date_of_birth?: string | null
          declares_accurate: boolean
          email: string
          expected_salary_egp: number
          full_name: string
          graduation_year: number
          id?: string
          job_id: string
          linkedin_url?: string | null
          location: string
          match_rationale?: string | null
          match_score?: number | null
          mobile: string
          notice_period: Database["public"]["Enums"]["notice_period"]
          opened_at?: string | null
          other_benefits?: string | null
          position: string
          scored_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          years_of_experience: number
        }
        Update: {
          commutes_to_sahel?: boolean | null
          consents_to_processing?: boolean
          created_at?: string
          current_employer?: string | null
          current_job_title?: string | null
          current_salary_egp?: number
          cv_file_name?: string
          cv_parsed_at?: string | null
          cv_path?: string
          cv_summary?: Json | null
          date_of_birth?: string | null
          declares_accurate?: boolean
          email?: string
          expected_salary_egp?: number
          full_name?: string
          graduation_year?: number
          id?: string
          job_id?: string
          linkedin_url?: string | null
          location?: string
          match_rationale?: string | null
          match_score?: number | null
          mobile?: string
          notice_period?: Database["public"]["Enums"]["notice_period"]
          opened_at?: string | null
          other_benefits?: string | null
          position?: string
          scored_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          years_of_experience?: number
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_evaluations: {
        Row: {
          assessment_id: string
          created_at: string
          description: string | null
          grade: string | null
          grade_level: Database["public"]["Enums"]["evaluation_grade"] | null
          id: string
          metric_id: string | null
          min_grade: Database["public"]["Enums"]["evaluation_grade"] | null
          remarks: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          description?: string | null
          grade?: string | null
          grade_level?: Database["public"]["Enums"]["evaluation_grade"] | null
          id?: string
          metric_id?: string | null
          min_grade?: Database["public"]["Enums"]["evaluation_grade"] | null
          remarks?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          description?: string | null
          grade?: string | null
          grade_level?: Database["public"]["Enums"]["evaluation_grade"] | null
          id?: string
          metric_id?: string | null
          min_grade?: Database["public"]["Enums"]["evaluation_grade"] | null
          remarks?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_evaluations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "interview_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_evaluations_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_path: string | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      email_notification_logs: {
        Row: {
          assessment_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          recipient: string | null
          status: string
          subject: string | null
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          recipient?: string | null
          status: string
          subject?: string | null
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          recipient?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_notification_logs_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "interview_assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_metrics: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      hr_mail_tokens: {
        Row: {
          connected_at: string
          last_used_at: string | null
          mailbox: string
          refresh_token_enc: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          last_used_at?: string | null
          mailbox: string
          refresh_token_enc: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          last_used_at?: string | null
          mailbox?: string
          refresh_token_enc?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hr_staff: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_hr_contact: boolean
          job_title: string | null
          name: string
          phone: string | null
          signature_address: string | null
          signature_website: string | null
          sort_order: number
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_hr_contact?: boolean
          job_title?: string | null
          name: string
          phone?: string | null
          signature_address?: string | null
          signature_website?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_hr_contact?: boolean
          job_title?: string | null
          name?: string
          phone?: string | null
          signature_address?: string | null
          signature_website?: string | null
          sort_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_staff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "hr_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_assessments: {
        Row: {
          age: number
          application_id: string | null
          bonus: boolean
          bonus_months: number | null
          commutes_to_sahel: boolean | null
          created_at: string
          current_employer: string | null
          current_net_salary_egp: number
          cv_file_name: string | null
          cv_parsed_at: string | null
          cv_path: string | null
          cv_summary: Json | null
          decision: Database["public"]["Enums"]["assessment_decision"] | null
          declares_accurate: boolean
          email: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          expected_salary_egp: number | null
          final_position: string | null
          first_interview_comments: string | null
          first_interviewer_name: string | null
          full_name: string
          grade: string | null
          graduation_year: number
          hr_contact: string
          id: string
          interview_date: string
          job_id: string | null
          line_manager_date: string | null
          line_manager_name: string | null
          marital_status: Database["public"]["Enums"]["marital_status"] | null
          match_rationale: string | null
          match_score: number | null
          mobile: string
          nationality: string
          nationality_other: string | null
          notice_period: string | null
          opened_at: string | null
          position: string
          profit_share: boolean
          profit_share_months: number | null
          proposed_salary_egp: number | null
          proposed_salary_enc: string | null
          reasons_for_leaving: string | null
          rejection_email_recipient: string | null
          rejection_email_sent_at: string | null
          rejection_email_sent_by: string | null
          reporting_to: string | null
          scored_at: string | null
          second_interview_comments: string | null
          second_interviewer_name: string | null
          source: Database["public"]["Enums"]["assessment_source"]
          suggested_questions: Json | null
          updated_at: string
        }
        Insert: {
          age: number
          application_id?: string | null
          bonus?: boolean
          bonus_months?: number | null
          commutes_to_sahel?: boolean | null
          created_at?: string
          current_employer?: string | null
          current_net_salary_egp: number
          cv_file_name?: string | null
          cv_parsed_at?: string | null
          cv_path?: string | null
          cv_summary?: Json | null
          decision?: Database["public"]["Enums"]["assessment_decision"] | null
          declares_accurate: boolean
          email: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          expected_salary_egp?: number | null
          final_position?: string | null
          first_interview_comments?: string | null
          first_interviewer_name?: string | null
          full_name: string
          grade?: string | null
          graduation_year: number
          hr_contact: string
          id?: string
          interview_date: string
          job_id?: string | null
          line_manager_date?: string | null
          line_manager_name?: string | null
          marital_status?: Database["public"]["Enums"]["marital_status"] | null
          match_rationale?: string | null
          match_score?: number | null
          mobile: string
          nationality: string
          nationality_other?: string | null
          notice_period?: string | null
          opened_at?: string | null
          position: string
          profit_share?: boolean
          profit_share_months?: number | null
          proposed_salary_egp?: number | null
          proposed_salary_enc?: string | null
          reasons_for_leaving?: string | null
          rejection_email_recipient?: string | null
          rejection_email_sent_at?: string | null
          rejection_email_sent_by?: string | null
          reporting_to?: string | null
          scored_at?: string | null
          second_interview_comments?: string | null
          second_interviewer_name?: string | null
          source: Database["public"]["Enums"]["assessment_source"]
          suggested_questions?: Json | null
          updated_at?: string
        }
        Update: {
          age?: number
          application_id?: string | null
          bonus?: boolean
          bonus_months?: number | null
          commutes_to_sahel?: boolean | null
          created_at?: string
          current_employer?: string | null
          current_net_salary_egp?: number
          cv_file_name?: string | null
          cv_parsed_at?: string | null
          cv_path?: string | null
          cv_summary?: Json | null
          decision?: Database["public"]["Enums"]["assessment_decision"] | null
          declares_accurate?: boolean
          email?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          expected_salary_egp?: number | null
          final_position?: string | null
          first_interview_comments?: string | null
          first_interviewer_name?: string | null
          full_name?: string
          grade?: string | null
          graduation_year?: number
          hr_contact?: string
          id?: string
          interview_date?: string
          job_id?: string | null
          line_manager_date?: string | null
          line_manager_name?: string | null
          marital_status?: Database["public"]["Enums"]["marital_status"] | null
          match_rationale?: string | null
          match_score?: number | null
          mobile?: string
          nationality?: string
          nationality_other?: string | null
          notice_period?: string | null
          opened_at?: string | null
          position?: string
          profit_share?: boolean
          profit_share_months?: number | null
          proposed_salary_egp?: number | null
          proposed_salary_enc?: string | null
          reasons_for_leaving?: string | null
          rejection_email_recipient?: string | null
          rejection_email_sent_at?: string | null
          rejection_email_sent_by?: string | null
          reporting_to?: string | null
          scored_at?: string | null
          second_interview_comments?: string | null
          second_interviewer_name?: string | null
          source?: Database["public"]["Enums"]["assessment_source"]
          suggested_questions?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_assessments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_assessments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "interview_assessments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_evaluation_metrics: {
        Row: {
          job_id: string
          metric_id: string
          min_grade: Database["public"]["Enums"]["evaluation_grade"] | null
          sort_order: number
        }
        Insert: {
          job_id: string
          metric_id: string
          min_grade?: Database["public"]["Enums"]["evaluation_grade"] | null
          sort_order?: number
        }
        Update: {
          job_id?: string
          metric_id?: string
          min_grade?: Database["public"]["Enums"]["evaluation_grade"] | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_evaluation_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_evaluation_metrics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_evaluation_metrics_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "evaluation_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      job_views: {
        Row: {
          id: number
          job_id: string
          viewed_at: string
          visitor_hash: string
        }
        Insert: {
          id?: never
          job_id: string
          viewed_at?: string
          visitor_hash: string
        }
        Update: {
          id?: never
          job_id?: string
          viewed_at?: string
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_views_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_stats"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_views_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company_id: string | null
          created_at: string
          department_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          ends_at: string | null
          id: string
          location: string
          requirements: string[]
          requires_commute_ack: boolean
          responsibilities: string[]
          seniority_level: Database["public"]["Enums"]["seniority_level"]
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["job_status"]
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          department_id: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          ends_at?: string | null
          id?: string
          location: string
          requirements?: string[]
          requires_commute_ack?: boolean
          responsibilities?: string[]
          seniority_level?: Database["public"]["Enums"]["seniority_level"]
          slug: string
          starts_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          department_id?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          ends_at?: string | null
          id?: string
          location?: string
          requirements?: string[]
          requires_commute_ack?: boolean
          responsibilities?: string[]
          seniority_level?: Database["public"]["Enums"]["seniority_level"]
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      job_stats: {
        Row: {
          applicant_count: number | null
          distinct_viewer_count: number | null
          job_id: string | null
          total_view_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_hr: { Args: never; Returns: boolean }
      job_is_live: {
        Args: { j: Database["public"]["Tables"]["jobs"]["Row"] }
        Returns: boolean
      }
    }
    Enums: {
      application_status:
        | "new"
        | "reviewing"
        | "shortlisted"
        | "rejected"
        | "hired"
      assessment_decision: "Accepted" | "Hold" | "Reject" | "Shortlisted"
      assessment_source:
        | "Job Portal"
        | "Referral"
        | "Recruitment Agency"
        | "Walk-in"
        | "Social Media"
        | "LinkedIn"
        | "Company Website"
        | "Other"
      employment_status: "Employed" | "Unemployed" | "Student"
      employment_type: "Full-time" | "Part-time" | "Contract" | "Internship"
      evaluation_grade:
        | "Unsatisfactory"
        | "Needs Improvement"
        | "Meets Expectations"
        | "Exceeds Expectations"
        | "Outstanding"
      job_status: "draft" | "open" | "closed" | "archived"
      marital_status: "Single" | "Married" | "Divorced" | "Widowed"
      notice_period: "Immediate" | "2 Weeks" | "1 Month" | "2 Months" | "Other"
      seniority_level: "Entry" | "Mid-level" | "Senior" | "Lead" | "Executive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  sourcing: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      candidate_notes: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          job_id: string
          note: string
          person_id: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          note: string
          person_id: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          note?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "candidate_notes_job_id_person_id_fkey"
            columns: ["job_id", "person_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["job_id", "person_id"]
          },
        ]
      }
      candidate_views: {
        Row: {
          first_viewed_at: string
          job_id: string
          person_id: string
          user_id: string
        }
        Insert: {
          first_viewed_at?: string
          job_id: string
          person_id: string
          user_id: string
        }
        Update: {
          first_viewed_at?: string
          job_id?: string
          person_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_views_job_id_person_id_fkey"
            columns: ["job_id", "person_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["job_id", "person_id"]
          },
          {
            foreignKeyName: "candidate_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          email: string
          invited_by: string | null
          role: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          invited_by?: string | null
          role: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string | null
          role?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      job_analyses: {
        Row: {
          created_at: string
          id: string
          job_id: string
          model: string
          output: Json
          prompt_version: string
          provider_call_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          model: string
          output: Json
          prompt_version: string
          provider_call_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          model?: string
          output?: Json
          prompt_version?: string
          provider_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_analyses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_analyses_provider_call_id_fkey"
            columns: ["provider_call_id"]
            isOneToOne: false
            referencedRelation: "provider_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      job_candidates: {
        Row: {
          found_at: string
          job_id: string
          latest_match_id: string | null
          match_score: number | null
          person_id: string
          pre_score: number | null
          scored_at: string | null
          search_run_id: string | null
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
        }
        Insert: {
          found_at?: string
          job_id: string
          latest_match_id?: string | null
          match_score?: number | null
          person_id: string
          pre_score?: number | null
          scored_at?: string | null
          search_run_id?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Update: {
          found_at?: string
          job_id?: string
          latest_match_id?: string | null
          match_score?: number | null
          person_id?: string
          pre_score?: number | null
          scored_at?: string | null
          search_run_id?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_latest_match_id_fkey"
            columns: ["latest_match_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_candidates_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_requirements: {
        Row: {
          canonical: string | null
          created_at: string
          id: string
          job_id: string
          kind: string
          sort_order: number
          text: string
          weight: number
        }
        Insert: {
          canonical?: string | null
          created_at?: string
          id?: string
          job_id: string
          kind: string
          sort_order?: number
          text: string
          weight?: number
        }
        Update: {
          canonical?: string | null
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          sort_order?: number
          text?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_requirements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          city: string | null
          company_id: string | null
          country_code: string
          created_at: string
          description: string
          embedding: string | null
          employment_type: string | null
          id: string
          max_experience: number | null
          min_experience: number | null
          owner_id: string
          seniority: string | null
          title: string
          updated_at: string
          work_arrangement: string | null
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          country_code?: string
          created_at?: string
          description: string
          embedding?: string | null
          employment_type?: string | null
          id?: string
          max_experience?: number | null
          min_experience?: number | null
          owner_id: string
          seniority?: string | null
          title: string
          updated_at?: string
          work_arrangement?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string | null
          country_code?: string
          created_at?: string
          description?: string
          embedding?: string | null
          employment_type?: string | null
          id?: string
          max_experience?: number | null
          min_experience?: number | null
          owner_id?: string
          seniority?: string | null
          title?: string
          updated_at?: string
          work_arrangement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          created_at: string
          education_score: number | null
          experience_score: number | null
          id: string
          items: Json
          job_id: string
          location_score: number | null
          match_score: number
          model: string
          person_id: string
          prompt_version: string
          provider_call_id: string | null
          seniority_score: number | null
          skills_score: number | null
          summary: string | null
          weights: Json | null
          job_version_id: string | null
        }
        Insert: {
          created_at?: string
          education_score?: number | null
          experience_score?: number | null
          id?: string
          items?: Json
          job_id: string
          location_score?: number | null
          match_score: number
          model: string
          person_id: string
          prompt_version: string
          provider_call_id?: string | null
          seniority_score?: number | null
          skills_score?: number | null
          summary?: string | null
          weights?: Json | null
          job_version_id?: string | null
        }
        Update: {
          created_at?: string
          education_score?: number | null
          experience_score?: number | null
          id?: string
          items?: Json
          job_id?: string
          location_score?: number | null
          match_score?: number
          model?: string
          person_id?: string
          prompt_version?: string
          provider_call_id?: string | null
          seniority_score?: number | null
          skills_score?: number | null
          summary?: string | null
          weights?: Json | null
          job_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_results_job_id_person_id_fkey"
            columns: ["job_id", "person_id"]
            isOneToOne: false
            referencedRelation: "job_candidates"
            referencedColumns: ["job_id", "person_id"]
          },
          {
            foreignKeyName: "match_results_provider_call_id_fkey"
            columns: ["provider_call_id"]
            isOneToOne: false
            referencedRelation: "provider_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          requested_at: string
          role: string
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          requested_at?: string
          role?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          requested_at?: string
          role?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      people: {
        Row: {
          about: string | null
          city: string | null
          connections_count: number | null
          country_code: string | null
          created_at: string
          current_company: string | null
          current_company_li_id: string | null
          current_title: string | null
          embedding: string | null
          enriched_at: string | null
          enrichment_error: string | null
          enrichment_source: string | null
          enrichment_status: string
          experience_years: number | null
          first_name: string | null
          followers_count: number | null
          full_name: string | null
          headline: string | null
          hiring: boolean | null
          id: string
          identity_key: string
          input_slugs: string[]
          last_name: string | null
          linkedin_member_id: string | null
          linkedin_object_urn: string | null
          linkedin_public_id: string | null
          location_evidence: string | null
          location_method: string | null
          location_text: string | null
          location_verified: boolean | null
          open_to_work: boolean | null
          photo_fetched_at: string | null
          photo_url: string | null
          premium: boolean | null
          profile_url: string | null
          region: string | null
          registered_at: string | null
          search_snippet: string | null
          section_totals: Json | null
          updated_at: string
          verified: boolean | null
        }
        Insert: {
          about?: string | null
          city?: string | null
          connections_count?: number | null
          country_code?: string | null
          created_at?: string
          current_company?: string | null
          current_company_li_id?: string | null
          current_title?: string | null
          embedding?: string | null
          enriched_at?: string | null
          enrichment_error?: string | null
          enrichment_source?: string | null
          enrichment_status?: string
          experience_years?: number | null
          first_name?: string | null
          followers_count?: number | null
          full_name?: string | null
          headline?: string | null
          hiring?: boolean | null
          id?: string
          identity_key: string
          input_slugs?: string[]
          last_name?: string | null
          linkedin_member_id?: string | null
          linkedin_object_urn?: string | null
          linkedin_public_id?: string | null
          location_evidence?: string | null
          location_method?: string | null
          location_text?: string | null
          location_verified?: boolean | null
          open_to_work?: boolean | null
          photo_fetched_at?: string | null
          photo_url?: string | null
          premium?: boolean | null
          profile_url?: string | null
          region?: string | null
          registered_at?: string | null
          search_snippet?: string | null
          section_totals?: Json | null
          updated_at?: string
          verified?: boolean | null
        }
        Update: {
          about?: string | null
          city?: string | null
          connections_count?: number | null
          country_code?: string | null
          created_at?: string
          current_company?: string | null
          current_company_li_id?: string | null
          current_title?: string | null
          embedding?: string | null
          enriched_at?: string | null
          enrichment_error?: string | null
          enrichment_source?: string | null
          enrichment_status?: string
          experience_years?: number | null
          first_name?: string | null
          followers_count?: number | null
          full_name?: string | null
          headline?: string | null
          hiring?: boolean | null
          id?: string
          identity_key?: string
          input_slugs?: string[]
          last_name?: string | null
          linkedin_member_id?: string | null
          linkedin_object_urn?: string | null
          linkedin_public_id?: string | null
          location_evidence?: string | null
          location_method?: string | null
          location_text?: string | null
          location_verified?: boolean | null
          open_to_work?: boolean | null
          photo_fetched_at?: string | null
          photo_url?: string | null
          premium?: boolean | null
          profile_url?: string | null
          region?: string | null
          registered_at?: string | null
          search_snippet?: string | null
          section_totals?: Json | null
          updated_at?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      person_certifications: {
        Row: {
          created_at: string
          credential_url: string | null
          expires_on: string | null
          id: string
          issued_on: string | null
          issuer: string | null
          issuer_li_url: string | null
          person_id: string
          source: string
          title: string
        }
        Insert: {
          created_at?: string
          credential_url?: string | null
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          issuer_li_url?: string | null
          person_id: string
          source: string
          title: string
        }
        Update: {
          created_at?: string
          credential_url?: string | null
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          issuer_li_url?: string | null
          person_id?: string
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_certifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_education: {
        Row: {
          created_at: string
          degree: string | null
          description: string | null
          end_year: number | null
          field_of_study: string | null
          id: string
          person_id: string
          school: string | null
          school_li_id: string | null
          sort_order: number
          source: string
          start_year: number | null
        }
        Insert: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_year?: number | null
          field_of_study?: string | null
          id?: string
          person_id: string
          school?: string | null
          school_li_id?: string | null
          sort_order?: number
          source: string
          start_year?: number | null
        }
        Update: {
          created_at?: string
          degree?: string | null
          description?: string | null
          end_year?: number | null
          field_of_study?: string | null
          id?: string
          person_id?: string
          school?: string | null
          school_li_id?: string | null
          sort_order?: number
          source?: string
          start_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "person_education_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_experiences: {
        Row: {
          company: string | null
          company_li_id: string | null
          company_universal_name: string | null
          created_at: string
          description: string | null
          duration_text: string | null
          employment_type: string | null
          end_month: number | null
          end_year: number | null
          experience_group_id: string | null
          id: string
          is_current: boolean
          location: string | null
          person_id: string
          skills: string[]
          sort_order: number
          source: string
          start_month: number | null
          start_year: number | null
          title: string | null
          workplace_type: string | null
        }
        Insert: {
          company?: string | null
          company_li_id?: string | null
          company_universal_name?: string | null
          created_at?: string
          description?: string | null
          duration_text?: string | null
          employment_type?: string | null
          end_month?: number | null
          end_year?: number | null
          experience_group_id?: string | null
          id?: string
          is_current?: boolean
          location?: string | null
          person_id: string
          skills?: string[]
          sort_order?: number
          source: string
          start_month?: number | null
          start_year?: number | null
          title?: string | null
          workplace_type?: string | null
        }
        Update: {
          company?: string | null
          company_li_id?: string | null
          company_universal_name?: string | null
          created_at?: string
          description?: string | null
          duration_text?: string | null
          employment_type?: string | null
          end_month?: number | null
          end_year?: number | null
          experience_group_id?: string | null
          id?: string
          is_current?: boolean
          location?: string | null
          person_id?: string
          skills?: string[]
          sort_order?: number
          source?: string
          start_month?: number | null
          start_year?: number | null
          title?: string | null
          workplace_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_experiences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_languages: {
        Row: {
          created_at: string
          id: string
          name: string
          name_normalized: string | null
          person_id: string
          proficiency: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_normalized?: string | null
          person_id: string
          proficiency?: string | null
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_normalized?: string | null
          person_id?: string
          proficiency?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_languages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_overrides: {
        Row: {
          edited_at: string
          edited_by: string | null
          field: string
          person_id: string
          value: Json | null
        }
        Insert: {
          edited_at?: string
          edited_by?: string | null
          field: string
          person_id: string
          value?: Json | null
        }
        Update: {
          edited_at?: string
          edited_by?: string | null
          field?: string
          person_id?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "person_overrides_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "person_overrides_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_skills: {
        Row: {
          created_at: string
          endorsements: number | null
          is_top: boolean
          name: string
          person_id: string
          source: string
        }
        Insert: {
          created_at?: string
          endorsements?: number | null
          is_top?: boolean
          name: string
          person_id: string
          source: string
        }
        Update: {
          created_at?: string
          endorsements?: number | null
          is_top?: boolean
          name?: string
          person_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_skills_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_snapshots: {
        Row: {
          fetched_at: string
          id: string
          payload: Json
          person_id: string
          provider_call_id: string | null
          source: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          payload: Json
          person_id: string
          provider_call_id?: string | null
          source: string
        }
        Update: {
          fetched_at?: string
          id?: string
          payload?: Json
          person_id?: string
          provider_call_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_snapshots_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_snapshots_provider_call_id_fkey"
            columns: ["provider_call_id"]
            isOneToOne: false
            referencedRelation: "provider_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_calls: {
        Row: {
          cached_tokens: number | null
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string
          credits: number | null
          error: string | null
          finish_reason: string | null
          http_status: number | null
          id: string
          job_id: string | null
          latency_ms: number | null
          model: string | null
          person_id: string | null
          prompt_tokens: number | null
          prompt_version: string | null
          provider: string
          provider_request_id: string | null
          purpose: string
          reasoning_tokens: number | null
          request: Json | null
          response: Json | null
          search_run_id: string | null
          status: string
          tenant_key: string | null
          user_id: string | null
        }
        Insert: {
          cached_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          credits?: number | null
          error?: string | null
          finish_reason?: string | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          latency_ms?: number | null
          model?: string | null
          person_id?: string | null
          prompt_tokens?: number | null
          prompt_version?: string | null
          provider: string
          provider_request_id?: string | null
          purpose: string
          reasoning_tokens?: number | null
          request?: Json | null
          response?: Json | null
          search_run_id?: string | null
          status: string
          tenant_key?: string | null
          user_id?: string | null
        }
        Update: {
          cached_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          credits?: number | null
          error?: string | null
          finish_reason?: string | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          latency_ms?: number | null
          model?: string | null
          person_id?: string | null
          prompt_tokens?: number | null
          prompt_version?: string | null
          provider?: string
          provider_request_id?: string | null
          purpose?: string
          reasoning_tokens?: number | null
          request?: Json | null
          response?: Json | null
          search_run_id?: string | null
          status?: string
          tenant_key?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_calls_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_calls_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_calls_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_hits: {
        Row: {
          created_at: string
          id: string
          link: string
          matched_terms: string[]
          page: number
          person_id: string | null
          position: number
          provider_call_id: string | null
          query: string
          rich_snippet: Json | null
          search_run_id: string
          snippet: string | null
          subtitle: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          link: string
          matched_terms?: string[]
          page?: number
          person_id?: string | null
          position: number
          provider_call_id?: string | null
          query: string
          rich_snippet?: Json | null
          search_run_id: string
          snippet?: string | null
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          link?: string
          matched_terms?: string[]
          page?: number
          person_id?: string | null
          position?: number
          provider_call_id?: string | null
          query?: string
          rich_snippet?: Json | null
          search_run_id?: string
          snippet?: string | null
          subtitle?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_hits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_hits_provider_call_id_fkey"
            columns: ["provider_call_id"]
            isOneToOne: false
            referencedRelation: "provider_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_hits_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_run_access: {
        Row: {
          last_accessed_at: string
          search_run_id: string
          user_id: string
        }
        Insert: {
          last_accessed_at?: string
          search_run_id: string
          user_id: string
        }
        Update: {
          last_accessed_at?: string
          search_run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_run_access_search_run_id_fkey"
            columns: ["search_run_id"]
            isOneToOne: false
            referencedRelation: "search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_run_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      search_runs: {
        Row: {
          candidates_found: number
          candidates_new: number
          candidates_scored: number | null
          completed_at: string | null
          cost_usd: number
          created_at: string
          created_by: string | null
          enrich_total: number | null
          error: string | null
          heartbeat_at: string | null
          id: string
          job_id: string
          max_candidates: number | null
          provider: string
          queries: string[]
          shortlist_size: number | null
          stage: string | null
          started_at: string | null
          status: string
          tenant_key: string | null
          total_results: number | null
          workflow_run_id: string | null
          job_version_id: string | null
          kind: string
          target_person_ids: string[] | null
        }
        Insert: {
          candidates_found?: number
          candidates_new?: number
          candidates_scored?: number | null
          completed_at?: string | null
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          enrich_total?: number | null
          error?: string | null
          heartbeat_at?: string | null
          id?: string
          job_id: string
          max_candidates?: number | null
          provider: string
          queries?: string[]
          shortlist_size?: number | null
          stage?: string | null
          started_at?: string | null
          status?: string
          tenant_key?: string | null
          total_results?: number | null
          workflow_run_id?: string | null
          job_version_id?: string | null
          kind?: string
          target_person_ids?: string[] | null
        }
        Update: {
          candidates_found?: number
          candidates_new?: number
          candidates_scored?: number | null
          completed_at?: string | null
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          enrich_total?: number | null
          error?: string | null
          heartbeat_at?: string | null
          id?: string
          job_id?: string
          max_candidates?: number | null
          provider?: string
          queries?: string[]
          shortlist_size?: number | null
          stage?: string | null
          started_at?: string | null
          status?: string
          tenant_key?: string | null
          total_results?: number | null
          workflow_run_id?: string | null
          job_version_id?: string | null
          kind?: string
          target_person_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "search_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "search_runs_job_version_id_fkey"
            columns: ["job_version_id"]
            isOneToOne: false
            referencedRelation: "job_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["user_id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          daily_searches: number
          monthly_searches: number
          tenant_key: string
          updated_at: string
          updated_by: string | null
          weekly_searches: number
        }
        Insert: {
          daily_searches: number
          monthly_searches: number
          tenant_key: string
          updated_at?: string
          updated_by?: string | null
          weekly_searches: number
        }
        Update: {
          daily_searches?: number
          monthly_searches?: number
          tenant_key?: string
          updated_at?: string
          updated_by?: string | null
          weekly_searches?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activity_summary: {
        Args: { p_from?: string; p_to?: string; p_user_ids?: string[] }
        Returns: {
          action: string
          event_count: number
          last_at: string
          user_id: string
        }[]
      }
      ensure_member: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string | null
          requested_at: string
          role: string
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      member_last_sign_ins: {
        Args: never
        Returns: {
          last_sign_in_at: string
          user_id: string
        }[]
      }
      my_job_ids: { Args: never; Returns: string[] }
      my_role: { Args: never; Returns: string }
      my_team_id: { Args: never; Returns: string }
      search_usage: {
        Args: { p_tenant: string; p_tz?: string }
        Returns: {
          period: string
          resets_at: string
          searches: number
          spend_usd: number
          starts_at: string
        }[]
      }
      sourcing_files: {
        Args: {
          p_from?: string
          p_job_title?: string
          p_limit?: number
          p_min_candidates?: number
          p_min_match?: number
          p_owner_ids?: string[]
          p_status?: string
          p_to?: string
        }
        Returns: {
          average_match: number
          created_at: string
          created_by: string
          created_by_email: string
          created_by_name: string
          job_id: string
          job_title: string
          last_accessed_at: string
          last_accessed_by_email: string
          last_accessed_by_id: string
          last_accessed_by_name: string
          last_activity_at: string
          owner_email: string
          owner_id: string
          owner_name: string
          run_id: string
          shortlisted_candidates: number
          sourcing_status: string
          total_candidates: number
          unseen_candidates: number
        }[]
      }
      user_performance_stats: {
        Args: { p_from?: string; p_to?: string; p_user_ids?: string[] }
        Returns: {
          active_runs: number
          candidates_count: number
          completed_runs: number
          failed_runs: number
          jobs_count: number
          last_activity_at: string
          run_avg_count: number
          run_avg_sum: number
          runs_count: number
          status_counts: Json
          user_id: string
        }[]
      }
      visible_job_ids: { Args: never; Returns: string[] }
      visible_owner_ids: { Args: never; Returns: string[] }
      visible_run_ids: { Args: never; Returns: string[] }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      application_status: [
        "new",
        "reviewing",
        "shortlisted",
        "rejected",
        "hired",
      ],
      assessment_decision: ["Accepted", "Hold", "Reject", "Shortlisted"],
      assessment_source: [
        "Job Portal",
        "Referral",
        "Recruitment Agency",
        "Walk-in",
        "Social Media",
        "LinkedIn",
        "Company Website",
        "Other",
      ],
      employment_status: ["Employed", "Unemployed", "Student"],
      employment_type: ["Full-time", "Part-time", "Contract", "Internship"],
      evaluation_grade: [
        "Unsatisfactory",
        "Needs Improvement",
        "Meets Expectations",
        "Exceeds Expectations",
        "Outstanding",
      ],
      job_status: ["draft", "open", "closed", "archived"],
      marital_status: ["Single", "Married", "Divorced", "Widowed"],
      notice_period: ["Immediate", "2 Weeks", "1 Month", "2 Months", "Other"],
      seniority_level: ["Entry", "Mid-level", "Senior", "Lead", "Executive"],
    },
  },
  sourcing: {
    Enums: {},
  },
} as const
