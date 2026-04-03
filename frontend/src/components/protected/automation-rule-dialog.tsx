"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { Bot, FileText, Loader2, MapPin, SlidersHorizontal, Sparkles, Star, X } from "lucide-react";
import { cn } from "@/lib/shared/utils";

import type {
  AutoReplyRule,
  RuleTriggerConditions,
  RuleResponseSettings,
  CreateRulePayload,
  UpdateRulePayload,
} from "@/lib/automation/types";
import { createRule, updateRule } from "@/lib/automation/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocationRow {
  id: string;
  location_name: string;
  is_active: boolean | null;
}

interface SavedTemplateRow {
  id: string;
  title: string;
  content: string;
  review_type: string;
}

interface AutomationRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutoReplyRule | null;
  locations: LocationRow[];
  accessToken: string | null;
  onSaved: (rule: AutoReplyRule) => void;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
];

const CONTENT_TYPE_OPTIONS = [
  { value: "any", label: "Any review" },
  { value: "with_text", label: "Reviews with text" },
  { value: "without_text", label: "Reviews without text" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutomationRuleDialog({
  open,
  onOpenChange,
  rule,
  locations,
  accessToken,
  onSaved,
}: AutomationRuleDialogProps) {
  const isEditing = !!rule;

  // Form state
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Trigger conditions
  const [minRating, setMinRating] = useState(1);
  const [maxRating, setMaxRating] = useState(5);
  const [contentType, setContentType] = useState<"any" | "with_text" | "without_text">("any");
  const [keywordsInclude, setKeywordsInclude] = useState<string[]>([]);
  const [keywordsExclude, setKeywordsExclude] = useState<string[]>([]);
  const [includeInput, setIncludeInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  // Response settings
  const [responseType, setResponseType] = useState<"ai" | "template">("ai");
  const [tone, setTone] = useState("professional");
  const [templateId, setTemplateId] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  // Templates for selected location
  const [templates, setTemplates] = useState<SavedTemplateRow[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Initialize form from rule (edit mode) or defaults (create mode)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    if (rule) {
      setName(rule.name);
      setLocationId(rule.location_id);
      setIsActive(rule.is_active);
      setMinRating(rule.trigger_conditions.min_rating);
      setMaxRating(rule.trigger_conditions.max_rating);
      setContentType(rule.trigger_conditions.content_type);
      setKeywordsInclude(rule.trigger_conditions.keywords_include);
      setKeywordsExclude(rule.trigger_conditions.keywords_exclude);
      setResponseType(rule.response_settings.type);
      setTone(rule.response_settings.tone ?? "professional");
      setTemplateId(rule.response_settings.template_id ?? "");
      setCustomInstructions(rule.response_settings.custom_instructions ?? "");
    } else {
      setName("");
      setLocationId(locations[0]?.id ?? "");
      setIsActive(true);
      setMinRating(1);
      setMaxRating(5);
      setContentType("any");
      setKeywordsInclude([]);
      setKeywordsExclude([]);
      setResponseType("ai");
      setTone("professional");
      setTemplateId("");
      setCustomInstructions("");
    }
    setIncludeInput("");
    setExcludeInput("");
    setError(null);
  }, [open, rule, locations]);

  // ---------------------------------------------------------------------------
  // Fetch templates when location changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!locationId || !open) { setTemplates([]); return; }
    let cancelled = false;

    async function load() {
      setIsLoadingTemplates(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("saved_templates")
          .select("id,title,content,review_type")
          .eq("location_id", locationId)
          .order("created_at", { ascending: false });
        if (!cancelled) setTemplates((data ?? []) as SavedTemplateRow[]);
      } catch {
        if (!cancelled) setTemplates([]);
      } finally {
        if (!cancelled) setIsLoadingTemplates(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [locationId, open]);

  // ---------------------------------------------------------------------------
  // Keyword tag helpers
  // ---------------------------------------------------------------------------

  const addKeyword = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
  };

  const removeKeyword = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setList(list.filter((k) => k !== value));
  };

  const handleKeywordKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputValue: string,
    setInputValue: React.Dispatch<React.SetStateAction<string>>,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(list, setList, inputValue);
      setInputValue("");
    }
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!accessToken) return;
    if (!name.trim()) { setError("Rule name is required."); return; }
    if (!locationId) { setError("Please select a location."); return; }
    if (responseType === "template" && !templateId) { setError("Please select a template."); return; }
    if (minRating > maxRating) { setError("Min rating cannot exceed max rating."); return; }

    setIsSaving(true);
    setError(null);

    const triggerConditions: RuleTriggerConditions = {
      min_rating: minRating,
      max_rating: maxRating,
      content_type: contentType,
      keywords_include: keywordsInclude,
      keywords_exclude: keywordsExclude,
    };

    const responseSettings: RuleResponseSettings = {
      type: responseType,
      tone: responseType === "ai" ? tone : undefined,
      template_id: responseType === "template" ? templateId : undefined,
      custom_instructions: responseType === "ai" && customInstructions.trim() ? customInstructions.trim() : undefined,
    };

    try {
      let savedRule: AutoReplyRule;

      if (isEditing && rule) {
        const payload: UpdateRulePayload = {
          name: name.trim(),
          is_active: isActive,
          trigger_conditions: triggerConditions,
          response_settings: responseSettings,
        };
        savedRule = await updateRule(accessToken, rule.id, payload);
      } else {
        const payload: CreateRulePayload = {
          location_id: locationId,
          name: name.trim(),
          is_active: isActive,
          trigger_conditions: triggerConditions,
          response_settings: responseSettings,
        };
        savedRule = await createRule(accessToken, payload);
      }

      onSaved(savedRule);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rule.");
    } finally {
      setIsSaving(false);
    }
  }, [
    accessToken, name, locationId, isActive, minRating, maxRating, contentType,
    keywordsInclude, keywordsExclude, responseType, tone, templateId,
    customInstructions, isEditing, rule, onSaved,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selectedLocationName =
    locations.find((loc) => loc.id === locationId)?.location_name ?? "Select a location";

  const selectClassName =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-reply-purple focus:ring-2 focus:ring-reply-purple/20";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,780px)] max-h-[92vh] overflow-hidden p-0 sm:max-w-3xl">
        <div className="flex h-full max-h-[92vh] flex-col">
          <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/80 px-6 py-5 pr-14">
            <DialogHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
                    {isEditing ? "Edit Automation Rule" : "Create Automation Rule"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-slate-600">
                    {isEditing
                      ? "Refine when this rule triggers and how it responds."
                      : "Build a smart rule to auto-reply to matching reviews."}
                  </DialogDescription>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-300 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {isEditing ? "Editing" : "New Rule"}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                  <MapPin className="h-3.5 w-3.5" />
                  {selectedLocationName}
                </div>
                <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {minRating}-{maxRating} star range
                </div>
                <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                  {responseType === "ai" ? <Bot className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {responseType === "ai" ? "AI response" : "Template response"}
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-4 pb-1">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Sparkles className="h-4 w-4 text-reply-purple" />
                  Basic Setup
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rule-name">Rule Name</Label>
                  <Input
                    id="rule-name"
                    placeholder="e.g., Auto-reply to 5-star reviews"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    disabled={isEditing}
                    className={cn(selectClassName, "h-11 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400")}
                  >
                    <option value="">Select a location</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.location_name}</option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <SlidersHorizontal className="h-4 w-4 text-reply-purple" />
                  Trigger Conditions
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <Label className="text-xs uppercase tracking-wide text-slate-500">Minimum Rating</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={`min-${n}`}
                          type="button"
                          aria-label={`Minimum ${n} star`}
                          onClick={() => { setMinRating(n); if (n > maxRating) setMaxRating(n); }}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg border transition-all",
                            n === minRating
                              ? "border-reply-purple bg-reply-purple text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                          )}
                        >
                          <Star className={cn("h-4 w-4", n <= minRating && "fill-current")} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <Label className="text-xs uppercase tracking-wide text-slate-500">Maximum Rating</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={`max-${n}`}
                          type="button"
                          aria-label={`Maximum ${n} star`}
                          onClick={() => { setMaxRating(n); if (n < minRating) setMinRating(n); }}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg border transition-all",
                            n === maxRating
                              ? "border-reply-purple bg-reply-purple text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                          )}
                        >
                          <Star className={cn("h-4 w-4", n <= maxRating && "fill-current")} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">Review Content</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {CONTENT_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setContentType(opt.value as typeof contentType)}
                        className={cn(
                          "rounded-lg border px-2.5 py-2 text-xs font-medium transition-all",
                          contentType === opt.value
                            ? "border-reply-purple bg-reply-purple/10 text-reply-purple"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Keywords to Include <span className="font-normal text-slate-400">(optional)</span></Label>
                  <div className="flex min-h-8 flex-wrap gap-1.5">
                    {keywordsInclude.map((kw) => (
                      <Badge key={kw} variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                        {kw}
                        <button type="button" onClick={() => removeKeyword(keywordsInclude, setKeywordsInclude, kw)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Type keyword and press Enter"
                    value={includeInput}
                    onChange={(e) => setIncludeInput(e.target.value)}
                    onKeyDown={(e) =>
                      handleKeywordKeyDown(e, includeInput, setIncludeInput, keywordsInclude, setKeywordsInclude)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Keywords to Exclude <span className="font-normal text-slate-400">(optional)</span></Label>
                  <div className="flex min-h-8 flex-wrap gap-1.5">
                    {keywordsExclude.map((kw) => (
                      <Badge key={kw} variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
                        {kw}
                        <button type="button" onClick={() => removeKeyword(keywordsExclude, setKeywordsExclude, kw)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Type keyword and press Enter"
                    value={excludeInput}
                    onChange={(e) => setExcludeInput(e.target.value)}
                    onKeyDown={(e) =>
                      handleKeywordKeyDown(e, excludeInput, setExcludeInput, keywordsExclude, setKeywordsExclude)
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {responseType === "ai" ? (
                    <Bot className="h-4 w-4 text-reply-purple" />
                  ) : (
                    <FileText className="h-4 w-4 text-reply-blue" />
                  )}
                  Response Settings
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setResponseType("ai")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      responseType === "ai"
                        ? "border-reply-purple bg-reply-purple/5 text-reply-purple"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <p className="text-sm font-medium">AI Generated</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Uses 1 credit per reply</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseType("template")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      responseType === "template"
                        ? "border-reply-blue bg-reply-blue/5 text-reply-blue"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <p className="text-sm font-medium">Use Template</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Free, no credit cost</p>
                  </button>
                </div>

                {responseType === "ai" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Tone</Label>
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        className={selectClassName}
                      >
                        {TONE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Custom Instructions <span className="font-normal text-slate-400">(optional)</span></Label>
                      <textarea
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value)}
                        placeholder="e.g., Always mention our loyalty program. Keep replies under 3 sentences."
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-reply-purple focus:ring-2 focus:ring-reply-purple/20"
                      />
                    </div>
                  </div>
                )}

                {responseType === "template" && (
                  <div className="space-y-1.5">
                    <Label>Select Template</Label>
                    {isLoadingTemplates ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading templates...
                      </div>
                    ) : templates.length === 0 ? (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                        No templates found for this location. Create templates first in the Templates page.
                      </p>
                    ) : (
                      <select
                        value={templateId}
                        onChange={(e) => setTemplateId(e.target.value)}
                        className={cn(selectClassName, "focus:border-reply-blue focus:ring-reply-blue/20")}
                      >
                        <option value="">Choose a template</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} ({t.review_type})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </section>

              <section className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Rule Status</p>
                  <p className="text-xs text-slate-500">
                    {isActive ? "Rule is active and will process new reviews." : "Rule is paused and will not run."}
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={(checked) => setIsActive(!!checked)} />
              </section>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="gap-2 bg-reply-purple hover:bg-reply-purple/90"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Rule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
