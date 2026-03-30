"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/shared/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Copy,
  Loader2,
  MapPin,
  Mic2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { BrandVoiceForm } from "@/components/protected/brand-voice-form";
import type { BrandVoiceRow } from "@/components/protected/brand-voice-form";
import { generateMockTemplates } from "@/lib/mock-template-generator";
import type { GeneratedTemplate } from "@/lib/mock-template-generator";

interface LocationRow {
  id: string;
  location_name: string;
  is_active: boolean | null;
}

interface SavedTemplateRow {
  id: string;
  user_id: string;
  email: string | null;
  brand_voice_id: string;
  location_id: string;
  title: string;
  content: string;
  review_type: string;
  created_at: string;
}

function formatDate(value: string | null): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const toneLabel: Record<string, string> = {
  professional: "Professional",
  formal: "Formal",
  casual: "Casual",
  friendly: "Friendly",
};

const reviewTypeBadge: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  negative: "bg-rose-100 text-rose-700",
  neutral: "bg-amber-100 text-amber-700",
};

export default function TemplatesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoiceRow[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplateRow[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editBrandVoice, setEditBrandVoice] = useState<BrandVoiceRow | null>(null);
  const [generatedTemplates, setGeneratedTemplates] = useState<GeneratedTemplate[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState<string | null>(null);
  const [isDeletingVoice, setIsDeletingVoice] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false);

  const fetchBrandVoices = useCallback(
    async (uid: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("brand_voices")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as BrandVoiceRow[];
    },
    []
  );

  const fetchSavedTemplates = useCallback(
    async (uid: string) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("saved_templates")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as SavedTemplateRow[];
    },
    []
  );

  const initializePage = useCallback(async () => {
    setIsBootstrapping(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/auth/login");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? null);

      const { data: locationData, error: locationError } = await supabase
        .from("locations")
        .select("id,location_name,is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (locationError) throw new Error(locationError.message);
      setLocations((locationData ?? []) as LocationRow[]);

      const [voices, templates] = await Promise.all([
        fetchBrandVoices(user.id),
        fetchSavedTemplates(user.id),
      ]);
      setBrandVoices(voices);
      setSavedTemplates(templates);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsBootstrapping(false);
    }
  }, [fetchBrandVoices, fetchSavedTemplates, router]);

  useEffect(() => {
    void initializePage();
  }, [initializePage]);

  /* ── Derived data ── */

  const locationNameById = useMemo(() => {
    return new Map(locations.map((loc) => [loc.id, loc.location_name]));
  }, [locations]);

  const activeLocations = useMemo(() => {
    return locations.filter((loc) => loc.is_active);
  }, [locations]);

  const filteredLocations = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    if (!search) return activeLocations;
    return activeLocations.filter((loc) =>
      loc.location_name.toLowerCase().includes(search)
    );
  }, [activeLocations, searchQuery]);

  const brandVoiceByLocationId = useMemo(() => {
    const map = new Map<string, BrandVoiceRow>();
    for (const bv of brandVoices) {
      map.set(bv.location_id, bv);
    }
    return map;
  }, [brandVoices]);

  const selectedBrandVoice = useMemo(() => {
    if (!selectedLocationId) return null;
    return brandVoiceByLocationId.get(selectedLocationId) ?? null;
  }, [selectedLocationId, brandVoiceByLocationId]);

  const templatesForSelected = useMemo(() => {
    if (!selectedLocationId) return [];
    return savedTemplates.filter((t) => t.location_id === selectedLocationId);
  }, [savedTemplates, selectedLocationId]);

  /* ── Auto-select first location ── */

  useEffect(() => {
    if (filteredLocations.length === 0) {
      setSelectedLocationId(null);
      return;
    }
    if (!selectedLocationId || !filteredLocations.some((loc) => loc.id === selectedLocationId)) {
      setSelectedLocationId(filteredLocations[0].id);
    }
  }, [filteredLocations, selectedLocationId]);

  // Clear generated templates when selection changes
  useEffect(() => {
    setGeneratedTemplates([]);
  }, [selectedLocationId]);

  /* ── Handlers ── */

  const handleGenerateTemplates = useCallback(async () => {
    if (!selectedLocationId || !userId) return;

    const bv = brandVoiceByLocationId.get(selectedLocationId);
    if (!bv) {
      setErrorMessage("Please create a brand voice for this location first.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    const gateRes = await fetch("/routes/ai_generate_routes", { method: "POST" });
    if (!gateRes.ok) {
      const body = await gateRes.json().catch(() => ({}));
      setErrorMessage(body.error ?? "Too many generation requests. Please wait before generating again.");
      setIsGenerating(false);
      return;
    }

    setTimeout(() => {
      void (async () => {
        const templates = generateMockTemplates({
          id: bv.id,
          business_name: bv.business_name,
          tone: bv.tone,
          key_phrases: bv.key_phrases,
          phrases_to_avoid: bv.phrases_to_avoid,
          signature_signoff: bv.signature_signoff,
          target_audience: bv.target_audience,
          brand_values: bv.brand_values,
          industry: bv.industry,
          preferred_response_length: bv.preferred_response_length,
          language_dialect: bv.language_dialect,
          example_responses: bv.example_responses,
        });

        // Auto-save: delete old templates for this location, then insert the 3 new ones
        try {
          const supabase = createClient();

          // Delete existing saved templates for this location
          const { error: deleteError } = await supabase
            .from("saved_templates")
            .delete()
            .eq("user_id", userId)
            .eq("location_id", selectedLocationId);

          if (deleteError) throw new Error(deleteError.message);

          // Insert the 3 new templates
          const rows = templates.map((t) => ({
            user_id: userId,
            email: userEmail,
            brand_voice_id: bv.id,
            location_id: selectedLocationId,
            title: t.title,
            content: t.content,
            review_type: t.review_type,
          }));

          const { error: insertError } = await supabase.from("saved_templates").insert(rows);
          if (insertError) throw new Error(insertError.message);

          const freshTemplates = await fetchSavedTemplates(userId);
          setSavedTemplates(freshTemplates);
          setSuccessMessage("Templates generated successfully!");
          setTimeout(() => setSuccessMessage(null), 4000);
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to save generated templates.");
          setTimeout(() => setErrorMessage(null), 4000);
        }

        setIsGenerating(false);
      })();
    }, 1200);
  }, [selectedLocationId, userId, userEmail, brandVoiceByLocationId, fetchSavedTemplates]);

  const handleSaveTemplate = useCallback(
    async (template: GeneratedTemplate) => {
      if (!userId || !selectedBrandVoice) return;

      setIsSavingTemplate(template.title);
      setErrorMessage(null);

      try {
        const supabase = createClient();
        const { error } = await supabase.from("saved_templates").insert({
          user_id: userId,
          email: userEmail,
          brand_voice_id: selectedBrandVoice.id,
          location_id: selectedBrandVoice.location_id,
          title: template.title,
          content: template.content,
          review_type: template.review_type,
        });

        if (error) throw new Error(error.message);

        const freshTemplates = await fetchSavedTemplates(userId);
        setSavedTemplates(freshTemplates);
        setSuccessMessage(`Template "${template.title}" saved.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to save template.");
      } finally {
        setIsSavingTemplate(null);
      }
    },
    [fetchSavedTemplates, selectedBrandVoice, userId, userEmail]
  );

  const handleDeleteSavedTemplate = useCallback(
    async (templateId: string) => {
      if (!userId) return;

      try {
        const supabase = createClient();
        const { error } = await supabase.from("saved_templates").delete().eq("id", templateId);
        if (error) throw new Error(error.message);

        setSavedTemplates((prev) => prev.filter((t) => t.id !== templateId));
        setSuccessMessage("Template deleted.");
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to delete template.");
      }
    },
    [userId]
  );

  const handleDeleteBrandVoice = useCallback(async () => {
    if (!userId || !selectedBrandVoice) return;

    setIsDeletingVoice(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("brand_voices")
        .delete()
        .eq("id", selectedBrandVoice.id);

      if (error) throw new Error(error.message);

      const freshVoices = await fetchBrandVoices(userId);
      setBrandVoices(freshVoices);
      const freshTemplates = await fetchSavedTemplates(userId);
      setSavedTemplates(freshTemplates);
      setGeneratedTemplates([]);
      setSuccessMessage("Brand voice deleted.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to delete brand voice.");
    } finally {
      setIsDeletingVoice(false);
    }
  }, [fetchBrandVoices, fetchSavedTemplates, selectedBrandVoice, userId]);

  const handleCopyTemplate = useCallback((content: string, index: number) => {
    void navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleSaveAllTemplates = useCallback(async () => {
    if (!userId || !selectedBrandVoice || generatedTemplates.length === 0) return;

    setIsSavingAll(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const rows = generatedTemplates.map((t) => ({
        user_id: userId,
        email: userEmail,
        brand_voice_id: selectedBrandVoice.id,
        location_id: selectedBrandVoice.location_id,
        title: t.title,
        content: t.content,
        review_type: t.review_type,
      }));

      const { error } = await supabase.from("saved_templates").insert(rows);
      if (error) throw new Error(error.message);

      const freshTemplates = await fetchSavedTemplates(userId);
      setSavedTemplates(freshTemplates);
      setGeneratedTemplates([]);
      setSuccessMessage("All templates saved successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMessage(`Failed to save templates: ${msg}. Please try again.`);
    } finally {
      setIsSavingAll(false);
    }
  }, [fetchSavedTemplates, generatedTemplates, selectedBrandVoice, userId, userEmail]);

  const handleStartEditTemplate = useCallback((template: SavedTemplateRow) => {
    setEditingTemplateId(template.id);
    setEditingContent(template.content);
  }, []);

  const handleCancelEditTemplate = useCallback(() => {
    setEditingTemplateId(null);
    setEditingContent("");
  }, []);

  const handleUpdateTemplate = useCallback(async (templateId: string) => {
    if (!userId) return;

    setIsUpdatingTemplate(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("saved_templates")
        .update({ content: editingContent })
        .eq("id", templateId);

      if (error) throw new Error(error.message);

      setSavedTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, content: editingContent } : t))
      );
      setEditingTemplateId(null);
      setEditingContent("");
      setSuccessMessage("Template updated successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMessage(`Failed to update template: ${msg}. Please try again.`);
    } finally {
      setIsUpdatingTemplate(false);
    }
  }, [editingContent, userId]);

  const handleFormSuccess = useCallback(async () => {
    if (!userId) return;
    const freshVoices = await fetchBrandVoices(userId);
    setBrandVoices(freshVoices);
    setSuccessMessage(editBrandVoice ? "Brand voice updated." : "Brand voice created.");
    setEditBrandVoice(null);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, [editBrandVoice, fetchBrandVoices, userId]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero Section */}
      <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge className="border-none bg-violet-100 text-violet-700 hover:bg-violet-100">Templates</Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Brand Voice & Templates</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
              Create brand voice profiles and generate review response templates.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Locations</p>
              <p className="text-xl font-bold text-slate-900">{activeLocations.length}</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">Voices</p>
              <p className="text-xl font-bold text-violet-900">{brandVoices.length}</p>
            </div>
            <Button
              onClick={() => {
                setEditBrandVoice(null);
                setIsFormOpen(true);
              }}
              disabled={isBootstrapping}
              className="h-11 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Brand Voice
            </Button>
          </div>
        </div>
      </section>

      {/* Messages */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Main Content */}
      {isBootstrapping ? (
        <div className="flex h-48 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : locations.length === 0 ? (
        <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-10 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <MapPin className="h-6 w-6" />
            </div>
            <p className="mt-4 text-lg font-semibold text-slate-900">No locations connected yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Add your first location from the dashboard, then return here to create brand voices.
            </p>
            <Button
              onClick={() => router.push("/protected")}
              className="mt-6 rounded-xl bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Locations + Brand Voice — equal height side by side */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[0.95fr_1.3fr]">
            {/* Left Panel — Locations List */}
            <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm xl:h-full">
              <CardHeader className="border-b border-slate-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-900">Locations</CardTitle>
                    <CardDescription>{activeLocations.length} active location(s)</CardDescription>
                  </div>
                </div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search locations..."
                    className="h-10 rounded-xl border-slate-200 pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
                {filteredLocations.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <MapPin className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">No locations found</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {searchQuery ? "Try a different search term." : "Add locations from the dashboard."}
                    </p>
                  </div>
                ) : (
                  filteredLocations.map((loc) => {
                    const isSelected = selectedLocationId === loc.id;
                    const hasBrandVoice = brandVoiceByLocationId.has(loc.id);
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setSelectedLocationId(loc.id)}
                        className={cn(
                          "w-full rounded-2xl border p-3 text-left transition-all",
                          isSelected
                            ? "border-violet-300 bg-violet-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-lg",
                                hasBrandVoice ? "bg-violet-100" : "bg-slate-100"
                              )}
                            >
                              <MapPin
                                className={cn(
                                  "h-4 w-4",
                                  hasBrandVoice ? "text-violet-600" : "text-slate-400"
                                )}
                              />
                            </div>
                            <p className="text-sm font-semibold text-slate-900 truncate">
                              {loc.location_name}
                            </p>
                          </div>
                          {hasBrandVoice && (
                            <Badge className="shrink-0 border-none bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-100">
                              <Mic2 className="mr-1 h-3 w-3" />
                              Voice
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Right Panel — Brand Voice Details */}
            <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm xl:h-full">
              {!selectedBrandVoice ? (
                <>
                  <CardHeader className="border-b border-slate-100 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold text-slate-900">Brand Voice</CardTitle>
                        <CardDescription>
                          {selectedLocationId
                            ? locationNameById.get(selectedLocationId) ?? "Selected location"
                            : "Select a location"}
                        </CardDescription>
                      </div>
                      {selectedLocationId && (
                        <Button
                          onClick={() => {
                            setEditBrandVoice(null);
                            setIsFormOpen(true);
                          }}
                          className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Create Voice
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                      <Mic2 className="mx-auto h-6 w-6 text-slate-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        {selectedLocationId
                          ? "No brand voice configured for this location"
                          : "Select a location to view details"}
                      </p>
                      {selectedLocationId && (
                        <p className="mt-1 text-xs text-slate-500">
                          Create a brand voice to start generating templates.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </>
              ) : (
                <>
                  <CardHeader className="border-b border-slate-100 p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold text-slate-900">Brand Voice</CardTitle>
                        <CardDescription>
                          {locationNameById.get(selectedBrandVoice.location_id) ?? "Location"}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleGenerateTemplates}
                          disabled={isGenerating}
                          className="h-9 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
                        >
                          {isGenerating ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-3.5 w-3.5" />
                          )}
                          {templatesForSelected.length > 0 ? "Generate New Template" : "Generate Template"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditBrandVoice(selectedBrandVoice);
                            setIsFormOpen(true);
                          }}
                          className="h-8 w-8 rounded-lg text-slate-500 hover:text-violet-600"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDeleteBrandVoice()}
                          disabled={isDeletingVoice}
                          className="h-8 w-8 rounded-lg text-slate-500 hover:text-rose-600"
                        >
                          {isDeletingVoice ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
                    {/* Brand Voice Summary */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{selectedBrandVoice.business_name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge className="border-none bg-violet-100 text-violet-700">
                            {toneLabel[selectedBrandVoice.tone] ?? selectedBrandVoice.tone}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {formatDate(selectedBrandVoice.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {selectedBrandVoice.industry && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Industry
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{selectedBrandVoice.industry}</p>
                        </div>
                      )}
                      {selectedBrandVoice.target_audience && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Target Audience
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{selectedBrandVoice.target_audience}</p>
                        </div>
                      )}
                      {selectedBrandVoice.preferred_response_length && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Response Length
                          </p>
                          <p className="mt-1 text-sm capitalize text-slate-700">
                            {selectedBrandVoice.preferred_response_length}
                          </p>
                        </div>
                      )}
                      {selectedBrandVoice.language_dialect && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Language
                          </p>
                          <p className="mt-1 text-sm text-slate-700">{selectedBrandVoice.language_dialect}</p>
                        </div>
                      )}
                    </div>

                    {selectedBrandVoice.key_phrases.length > 0 && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Key Phrases
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedBrandVoice.key_phrases.map((phrase, i) => (
                            <span
                              key={i}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
                            >
                              {phrase}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedBrandVoice.brand_values && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Brand Values
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{selectedBrandVoice.brand_values}</p>
                      </div>
                    )}

                    {selectedBrandVoice.signature_signoff && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Sign-off
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{selectedBrandVoice.signature_signoff}</p>
                      </div>
                    )}
                  </CardContent>
                </>
              )}
            </Card>
          </div>

          {/* Templates — separate full-width section below */}
          {selectedBrandVoice && (
            <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-900">
                      Templates: - {locationNameById.get(selectedBrandVoice.location_id) ?? "Location"}
                    </CardTitle>
                    <CardDescription>Generated and saved response templates</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-5">
                {/* Generated Templates */}
                {generatedTemplates.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Generated Templates</p>
                      <Button
                        onClick={() => void handleSaveAllTemplates()}
                        disabled={isSavingAll}
                        className="h-8 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-700"
                      >
                        {isSavingAll ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3 w-3" />
                        )}
                        Save All
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {generatedTemplates.map((template, index) => (
                        <div
                          key={index}
                          className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Badge
                              className={cn(
                                "border-none px-2 py-0.5 text-[10px] font-semibold uppercase",
                                reviewTypeBadge[template.review_type] ?? "bg-slate-100 text-slate-600"
                              )}
                            >
                              {template.review_type}
                            </Badge>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCopyTemplate(template.content, index)}
                                className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700"
                              >
                                {copiedIndex === index ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void handleSaveTemplate(template)}
                                disabled={isSavingTemplate === template.title || isSavingAll}
                                className="h-7 w-7 rounded-lg text-slate-400 hover:text-violet-600"
                              >
                                {isSavingTemplate === template.title ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{template.title}</p>
                          <p className="mt-2 flex-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                            {template.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Saved Templates */}
                {templatesForSelected.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-800">
                      Saved Templates ({templatesForSelected.length})
                    </p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {templatesForSelected.map((template) => {
                        const isEditing = editingTemplateId === template.id;
                        return (
                          <div
                            key={template.id}
                            className={cn(
                              "flex flex-col rounded-2xl border p-4",
                              isEditing
                                ? "border-violet-200 bg-violet-50/30"
                                : "border-slate-100 bg-slate-50"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge
                                className={cn(
                                  "border-none px-2 py-0.5 text-[10px] font-semibold uppercase",
                                  reviewTypeBadge[template.review_type] ?? "bg-slate-100 text-slate-600"
                                )}
                              >
                                {template.review_type}
                              </Badge>
                              <div className="flex items-center gap-1">
                                {isEditing ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => void handleUpdateTemplate(template.id)}
                                      disabled={isUpdatingTemplate}
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-emerald-600"
                                    >
                                      {isUpdatingTemplate ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Check className="h-3 w-3" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={handleCancelEditTemplate}
                                      disabled={isUpdatingTemplate}
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleStartEditTemplate(template)}
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-violet-600"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(template.content);
                                      }}
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => void handleDeleteSavedTemplate(template.id)}
                                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-800">{template.title}</p>
                              <span className="text-[10px] text-slate-400">
                                {formatDate(template.created_at)}
                              </span>
                            </div>
                            {isEditing ? (
                              <textarea
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                className="mt-2 w-full flex-1 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 outline-none transition-colors focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
                                rows={6}
                              />
                            ) : (
                              <p className="mt-2 flex-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                                {template.content}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {generatedTemplates.length === 0 && templatesForSelected.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <Sparkles className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">No templates yet</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Click &quot;Generate Template&quot; above to create response templates.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Brand Voice Form Dialog */}
      <BrandVoiceForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditBrandVoice(null);
        }}
        onSuccess={() => void handleFormSuccess()}
        locations={locations}
        editData={editBrandVoice}
        defaultLocationId={selectedLocationId ?? undefined}
      />
    </div>
  );
}
