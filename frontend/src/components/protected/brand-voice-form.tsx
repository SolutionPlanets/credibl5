"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mic2, Sparkles } from "lucide-react";

interface LocationRow {
  id: string;
  location_name: string;
  address?: string | null;
  is_active: boolean | null;
}

// Industry detection keywords mapped to inferred profiles
const INDUSTRY_PROFILES: Record<string, {
  industry: string;
  targetAudience: string;
  brandValues: string;
  keyPhrases: string;
  phrasesToAvoid: string;
  tone: string;
}> = {
  dental: {
    industry: "Healthcare / Dental",
    targetAudience: "Patients, Families, Local community",
    brandValues: "Patient comfort, Quality care, Trust, Modern dentistry",
    keyPhrases: "quality care, experienced team, patient comfort, gentle approach",
    phrasesToAvoid: "cheap, discount, painless guaranteed",
    tone: "professional",
  },
  hospital: {
    industry: "Healthcare",
    targetAudience: "Patients, Families, Caregivers",
    brandValues: "Compassionate care, Medical excellence, Patient safety",
    keyPhrases: "compassionate care, expert medical team, patient well-being",
    phrasesToAvoid: "cheap, discount, sorry for the inconvenience",
    tone: "professional",
  },
  clinic: {
    industry: "Healthcare",
    targetAudience: "Patients, Local community",
    brandValues: "Accessible care, Expertise, Patient-first approach",
    keyPhrases: "expert care, dedicated team, your health matters",
    phrasesToAvoid: "cheap, sorry for the inconvenience",
    tone: "professional",
  },
  restaurant: {
    industry: "Food & Dining",
    targetAudience: "Food lovers, Families, Couples, Local diners",
    brandValues: "Authentic flavors, Fresh ingredients, Warm hospitality",
    keyPhrases: "delicious food, warm atmosphere, fresh ingredients, great dining",
    phrasesToAvoid: "cheap eats, fast food, sorry for the wait",
    tone: "friendly",
  },
  cafe: {
    industry: "Food & Beverage",
    targetAudience: "Coffee lovers, Remote workers, Students, Casual diners",
    brandValues: "Quality coffee, Cozy atmosphere, Community space",
    keyPhrases: "freshly brewed, cozy vibes, quality coffee, welcoming space",
    phrasesToAvoid: "cheap, instant, sorry for the inconvenience",
    tone: "casual",
  },
  salon: {
    industry: "Beauty & Wellness",
    targetAudience: "Style-conscious individuals, Professionals",
    brandValues: "Expert styling, Personalized service, Trendsetting looks",
    keyPhrases: "expert stylists, personalized care, beautiful results",
    phrasesToAvoid: "cheap cuts, budget, sorry for the inconvenience",
    tone: "friendly",
  },
  spa: {
    industry: "Health & Wellness",
    targetAudience: "Wellness seekers, Professionals, Self-care enthusiasts",
    brandValues: "Relaxation, Rejuvenation, Holistic wellness",
    keyPhrases: "relaxation, rejuvenation, wellness journey, self-care",
    phrasesToAvoid: "cheap, discount deal, sorry for the inconvenience",
    tone: "professional",
  },
  gym: {
    industry: "Fitness & Wellness",
    targetAudience: "Fitness enthusiasts, Health-conscious individuals",
    brandValues: "Health, Strength, Community, Personal growth",
    keyPhrases: "fitness journey, expert trainers, achieve your goals",
    phrasesToAvoid: "easy results, no effort, sorry for the inconvenience",
    tone: "friendly",
  },
  hotel: {
    industry: "Hospitality & Travel",
    targetAudience: "Travelers, Business visitors, Tourists, Families",
    brandValues: "Exceptional hospitality, Comfort, Memorable experiences",
    keyPhrases: "warm hospitality, comfortable stay, memorable experience",
    phrasesToAvoid: "cheap rooms, budget, sorry for the inconvenience",
    tone: "formal",
  },
  store: {
    industry: "Retail",
    targetAudience: "Shoppers, Local community",
    brandValues: "Quality products, Customer satisfaction, Value",
    keyPhrases: "quality products, great value, customer satisfaction",
    phrasesToAvoid: "cheap stuff, clearance, sorry for the inconvenience",
    tone: "friendly",
  },
  school: {
    industry: "Education",
    targetAudience: "Students, Parents, Educators",
    brandValues: "Academic excellence, Holistic development, Safe learning",
    keyPhrases: "academic excellence, nurturing environment, student success",
    phrasesToAvoid: "cheap education, easy grades, sorry for the inconvenience",
    tone: "formal",
  },
  law: {
    industry: "Legal Services",
    targetAudience: "Individuals, Businesses seeking legal counsel",
    brandValues: "Justice, Integrity, Expert representation",
    keyPhrases: "expert counsel, dedicated representation, trusted advice",
    phrasesToAvoid: "cheap rates, guaranteed outcome, sorry for the inconvenience",
    tone: "formal",
  },
};

const DEFAULT_PROFILE = {
  industry: "General Services",
  targetAudience: "Local community, Customers",
  brandValues: "Quality service, Customer satisfaction, Trust, Reliability",
  keyPhrases: "excellent service, dedicated team, customer satisfaction",
  phrasesToAvoid: "cheap, sorry for the inconvenience",
  tone: "professional",
};

function inferProfileFromName(locationName: string): typeof DEFAULT_PROFILE {
  const lower = locationName.toLowerCase();
  for (const [keyword, profile] of Object.entries(INDUSTRY_PROFILES)) {
    if (lower.includes(keyword)) return profile;
  }
  return DEFAULT_PROFILE;
}

export interface BrandVoiceRow {
  id: string;
  user_id: string;
  location_id: string;
  business_name: string;
  tone: string;
  key_phrases: string[];
  phrases_to_avoid: string[];
  signature_signoff: string;
  target_audience: string;
  brand_values: string;
  industry: string;
  preferred_response_length: string;
  language_dialect: string;
  example_responses: string[];
  created_at: string;
  updated_at: string;
}

interface BrandVoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  locations: LocationRow[];
  editData?: BrandVoiceRow | null;
  defaultLocationId?: string;
}

const toneOptions = [
  { value: "professional", label: "Professional" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
];

const responseLengthOptions = [
  { value: "short", label: "Short (1-2 sentences)" },
  { value: "medium", label: "Medium (2-3 sentences)" },
  { value: "detailed", label: "Detailed (4-5 sentences)" },
];

export function BrandVoiceForm({
  isOpen,
  onClose,
  onSuccess,
  locations,
  editData,
  defaultLocationId,
}: BrandVoiceFormProps) {
  const [locationId, setLocationId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [brandValues, setBrandValues] = useState("");
  const [tone, setTone] = useState("professional");
  const [keyPhrases, setKeyPhrases] = useState("");
  const [phrasesToAvoid, setPhrasesToAvoid] = useState("");
  const [preferredResponseLength, setPreferredResponseLength] = useState("medium");
  const [languageDialect, setLanguageDialect] = useState("English");
  const [signatureSignoff, setSignatureSignoff] = useState("");
  const [exampleResponses, setExampleResponses] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isFilling, setIsFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFillWithAI = () => {
    if (!locationId) {
      setError("Please select a location first to auto-fill.");
      return;
    }

    const selectedLocation = locations.find((loc) => loc.id === locationId);
    if (!selectedLocation) {
      setError("Location not found.");
      return;
    }

    setIsFilling(true);
    setError(null);

    // Simulate AI processing delay
    setTimeout(() => {
      const locName = selectedLocation.location_name;
      const profile = inferProfileFromName(locName);

      setBusinessName(locName);
      setIndustry(profile.industry);
      setTargetAudience(profile.targetAudience);
      setBrandValues(profile.brandValues);
      setTone(profile.tone);
      setKeyPhrases(profile.keyPhrases);
      setPhrasesToAvoid(profile.phrasesToAvoid);
      setPreferredResponseLength("medium");
      setLanguageDialect("English");
      setSignatureSignoff(`Best regards, ${locName} Team`);
      setIsFilling(false);
    }, 800);
  };

  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setLocationId(editData.location_id);
        setBusinessName(editData.business_name);
        setIndustry(editData.industry);
        setTargetAudience(editData.target_audience);
        setBrandValues(editData.brand_values);
        setTone(editData.tone);
        setKeyPhrases(editData.key_phrases.join(", "));
        setPhrasesToAvoid(editData.phrases_to_avoid.join(", "));
        setPreferredResponseLength(editData.preferred_response_length);
        setLanguageDialect(editData.language_dialect);
        setSignatureSignoff(editData.signature_signoff);
        setExampleResponses(editData.example_responses.join("\n---\n"));
      } else {
        setLocationId(defaultLocationId ?? "");
        setBusinessName("");
        setIndustry("");
        setTargetAudience("");
        setBrandValues("");
        setTone("professional");
        setKeyPhrases("");
        setPhrasesToAvoid("");
        setPreferredResponseLength("medium");
        setLanguageDialect("English");
        setSignatureSignoff("");
        setExampleResponses("");
      }
      setError(null);
    }
  }, [isOpen, editData]);

  const handleSave = async () => {
    if (!locationId) {
      setError("Please select a location.");
      return;
    }
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) throw new Error("Not authenticated");

      const payload = {
        user_id: user.id,
        location_id: locationId,
        business_name: businessName.trim(),
        tone,
        key_phrases: keyPhrases
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        phrases_to_avoid: phrasesToAvoid
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        signature_signoff: signatureSignoff.trim(),
        target_audience: targetAudience.trim(),
        brand_values: brandValues.trim(),
        industry: industry.trim(),
        preferred_response_length: preferredResponseLength,
        language_dialect: languageDialect.trim(),
        example_responses: exampleResponses
          .split("---")
          .map((s) => s.trim())
          .filter(Boolean),
        updated_at: new Date().toISOString(),
      };

      if (editData) {
        const { error: updateError } = await supabase
          .from("brand_voices")
          .update(payload)
          .eq("id", editData.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase
          .from("brand_voices")
          .insert(payload);
        if (insertError) {
          if (insertError.message.includes("duplicate") || insertError.code === "23505") {
            throw new Error("A brand voice already exists for this location. Please edit the existing one.");
          }
          throw new Error(insertError.message);
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const activeLocations = locations.filter((loc) => loc.is_active);
  const selectClasses =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-slate-400";
  const inputClasses =
    "h-11 rounded-xl border-slate-200";
  const textareaClasses =
    "w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-slate-400";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[780px] overflow-hidden rounded-[28px] border border-slate-200 p-0">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50">
          <DialogHeader className="px-6 pb-4 pt-6">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-2xl font-bold flex items-center gap-3 text-slate-900">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Mic2 className="h-5 w-5" />
                </span>
                {editData ? "Edit Brand Voice" : "Create Brand Voice"}
              </DialogTitle>
              <Button
                onClick={handleFillWithAI}
                disabled={isFilling || !locationId}
                className="mr-8 h-9 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-xs font-semibold text-white shadow-md shadow-violet-500/20 hover:from-violet-700 hover:to-fuchsia-700 transition-all"
              >
                {isFilling ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Fill with AI
              </Button>
            </div>
            <DialogDescription className="text-slate-600">
              Define your brand&apos;s tone and style for AI-generated review responses.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Location *
                </Label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className={selectClasses}
                  disabled={!!editData}
                >
                  <option value="">Select a location</option>
                  {activeLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.location_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Business Name *
                </Label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Trisa Dental Solutions"
                  className={inputClasses}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Industry
                </Label>
                <Input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Healthcare, Dental, Restaurant"
                  className={inputClasses}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Target Audience
                </Label>
                <Input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Families, Young professionals"
                  className={inputClasses}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Brand Values
                </Label>
                <textarea
                  value={brandValues}
                  onChange={(e) => setBrandValues(e.target.value)}
                  placeholder="e.g. Quality care, Patient comfort, Innovation..."
                  rows={3}
                  className={textareaClasses}
                />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Tone / Style *
                </Label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className={selectClasses}
                >
                  {toneOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Key Phrases to Include
                </Label>
                <textarea
                  value={keyPhrases}
                  onChange={(e) => setKeyPhrases(e.target.value)}
                  placeholder="Comma-separated: quality service, patient care, expertise"
                  rows={2}
                  className={textareaClasses}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Phrases to Avoid
                </Label>
                <textarea
                  value={phrasesToAvoid}
                  onChange={(e) => setPhrasesToAvoid(e.target.value)}
                  placeholder="Comma-separated: cheap, sorry for the inconvenience"
                  rows={2}
                  className={textareaClasses}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Preferred Response Length
                </Label>
                <select
                  value={preferredResponseLength}
                  onChange={(e) => setPreferredResponseLength(e.target.value)}
                  className={selectClasses}
                >
                  {responseLengthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Language
                  </Label>
                  <Input
                    value={languageDialect}
                    onChange={(e) => setLanguageDialect(e.target.value)}
                    placeholder="English"
                    className={inputClasses}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Sign-off
                  </Label>
                  <Input
                    value={signatureSignoff}
                    onChange={(e) => setSignatureSignoff(e.target.value)}
                    placeholder="Best regards, Team"
                    className={inputClasses}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Example Responses
                </Label>
                <textarea
                  value={exampleResponses}
                  onChange={(e) => setExampleResponses(e.target.value)}
                  placeholder="Paste example replies (separate with ---)"
                  rows={3}
                  className={textareaClasses}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-between">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl border-slate-200 h-11 px-6 font-semibold bg-white hover:bg-slate-100"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={isSaving || !locationId || !businessName.trim()}
            className="rounded-xl bg-violet-600 text-white h-11 px-6 font-semibold hover:bg-violet-700 shadow-lg shadow-violet-600/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : editData ? (
              "Update Brand Voice"
            ) : (
              "Save Brand Voice"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
