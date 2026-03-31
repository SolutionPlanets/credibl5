export interface RuleTriggerConditions {
  min_rating: number;
  max_rating: number;
  content_type: "any" | "with_text" | "without_text";
  keywords_include: string[];
  keywords_exclude: string[];
}

export interface RuleResponseSettings {
  type: "ai" | "template";
  tone?: string;
  template_id?: string;
  custom_instructions?: string;
}

export interface AutoReplyRule {
  id: string;
  user_id: string;
  location_id: string;
  name: string;
  is_active: boolean;
  trigger_conditions: RuleTriggerConditions;
  response_settings: RuleResponseSettings;
  created_at: string;
  updated_at: string;
}

export interface AutomationStats {
  active_rules: number;
  replies_today: number;
  replies_this_week: number;
  automation_credits_used: number;
}

export interface AutoReplyLog {
  id: string;
  user_id: string;
  rule_id: string | null;
  location_id: string | null;
  review_id: string | null;
  rule_name: string | null;
  action: "replied" | "skipped_no_credits" | "skipped_error" | "matched";
  reply_text: string | null;
  credits_consumed: number;
  error_message: string | null;
  created_at: string;
}

export interface AutomationLogsResponse {
  logs: AutoReplyLog[];
  page: number;
  limit: number;
  total: number;
}

export interface CreateRulePayload {
  location_id: string;
  name: string;
  is_active: boolean;
  trigger_conditions: RuleTriggerConditions;
  response_settings: RuleResponseSettings;
}

export interface UpdateRulePayload {
  name?: string;
  is_active?: boolean;
  trigger_conditions?: RuleTriggerConditions;
  response_settings?: RuleResponseSettings;
}
