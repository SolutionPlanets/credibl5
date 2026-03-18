"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DEFAULT_DRAFT, STEP_LABELS, TOTAL_STEPS } from "@/components/onboarding/constants";
import { StepCompanyInfo } from "@/components/onboarding/steps/step-company-info";
import { StepConnect } from "@/components/onboarding/steps/step-connect";
import { StepGoals } from "@/components/onboarding/steps/step-goals";
import { StepSource } from "@/components/onboarding/steps/step-source";
import { StepChoosePlan } from "@/components/onboarding/steps/step-choose-plan";
import { Button } from "@/components/ui/button";
import type { OnboardingDraft } from "@/components/onboarding/types";
import type { BillingCycle, PlanId } from "@/lib/shared/plan-config";
import { getFriendlyAuthErrorMessage } from "@/lib/auth/auth-error-message";
import { createClient } from "@/lib/supabase/client";
import { startGoogleConnectFlow } from "@/lib/gmb/google-connect";
import { cn } from "@/lib/shared/utils";

type NewUserOnboardingProps = {
  initialEmail: string | null;
  initialGoogleConnected: boolean;
  googleState?: string;
  preselectedPlan?: PlanId;
  preselectedBilling?: BillingCycle;
};

const STORAGE_KEY = "cradible5.new-user-onboarding";

function getGoogleErrorMessage(googleState?: string) {
  if (googleState === "missing_refresh_token") {
    return "Google did not return an offline refresh token. Please connect again and approve all permissions.";
  }

  if (googleState === "save_failed") {
    return "We could not save your Google connection. Please try again.";
  }

  return null;
}

export function NewUserOnboarding({
  initialEmail,
  initialGoogleConnected,
  googleState,
  preselectedPlan,
  preselectedBilling,
}: NewUserOnboardingProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(initialGoogleConnected ? 5 : 1);
  const [draft, setDraft] = useState<OnboardingDraft>(DEFAULT_DRAFT);
  const [isLoaded, setIsLoaded] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(getGoogleErrorMessage(googleState));
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showConnectedModal, setShowConnectedModal] = useState(googleState === "connected");

  const isGoogleConnected = useMemo(
    () => initialGoogleConnected || googleState === "connected",
    [googleState, initialGoogleConnected]
  );

  useEffect(() => {
    setGoogleError(getGoogleErrorMessage(googleState));
  }, [googleState]);

  useEffect(() => {
    if (initialGoogleConnected) {
      setActiveStep(5);
    }
  }, [initialGoogleConnected]);

  // Pre-select plan from URL params
  useEffect(() => {
    if (preselectedPlan && preselectedPlan !== "free") {
      setDraft((prev) => ({
        ...prev,
        selectedPlan: preselectedPlan,
        billingCycle: preselectedBilling || "monthly",
      }));
    }
  }, [preselectedPlan, preselectedBilling]);

  useEffect(() => {
    try {
      const savedValue = window.localStorage.getItem(STORAGE_KEY);
      if (!savedValue) {
        setIsLoaded(true);
        return;
      }

      const parsed = JSON.parse(savedValue) as Partial<OnboardingDraft> & { step?: number };
      setDraft((prev) => ({
        ...prev,
        ...parsed,
      }));

      if (parsed.step && parsed.step >= 1 && parsed.step <= TOTAL_STEPS && !initialGoogleConnected) {
        setActiveStep(parsed.step);
      }
    } catch {
      // Ignore draft parsing issues and continue with defaults.
    } finally {
      setIsLoaded(true);
    }
  }, [initialGoogleConnected]);

  useEffect(() => {
    if (!isLoaded || isGoogleConnected) return;

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...draft,
        step: activeStep,
      })
    );
  }, [activeStep, draft, isGoogleConnected, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    if (isGoogleConnected) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [isGoogleConnected, isLoaded]);

  const updateDraft = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleContinue = () => {
    setStepError(null);

    if (activeStep === 2 && draft.goals.length === 0) {
      setStepError("Select at least one goal or use Skip for now.");
      return;
    }

    if (activeStep === 3 && draft.source === "other" && !draft.sourceOtherText.trim()) {
      setStepError("Please provide a short note for Other, or choose another source.");
      return;
    }

    // Step 4: Plan selection validation
    if (activeStep === 4) {
      if (draft.selectedPlan === "agency") {
        router.push("/contact");
        return;
      }
      if (draft.selectedPlan !== "free" && !draft.paymentCompleted) {
        setStepError("Please complete payment for the selected plan.");
        return;
      }
    }

    setActiveStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setStepError(null);
    setActiveStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSkip = () => {
    setStepError(null);
    setActiveStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const toggleGoal = (id: string) => {
    setStepError(null);
    setDraft((prev) => {
      const nextGoals = prev.goals.includes(id)
        ? prev.goals.filter((goal) => goal !== id)
        : [...prev.goals, id];

      return {
        ...prev,
        goals: nextGoals,
      };
    });
  };

  const handleConnectGoogle = async () => {
    setGoogleError(null);
    setIsGoogleLoading(true);

    try {
      const supabase = createClient();
      await startGoogleConnectFlow({ supabase, nextPath: "/onboarding" });
    } catch (error) {
      setGoogleError(
        getFriendlyAuthErrorMessage(error, "Unable to start Google Business connection flow.")
      );
      setIsGoogleLoading(false);
    }
  };

  const goToDashboard = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    router.push("/protected?google=connected");
    router.refresh();
  };

  return (
    <div className="min-h-svh bg-[#f7f6f3] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-4xl rounded-[2rem] border border-slate-200 bg-white/95 px-4 py-8 shadow-xl sm:px-8 sm:py-10">
        <OnboardingStepper activeStep={activeStep} />

        <div className="mx-auto mt-8 w-full max-w-3xl">
          {activeStep === 1 && (
            <StepCompanyInfo
              companyName={draft.companyName}
              websiteUrl={draft.websiteUrl}
              useCase={draft.useCase}
              onCompanyNameChange={(value) => updateDraft("companyName", value)}
              onWebsiteUrlChange={(value) => updateDraft("websiteUrl", value)}
              onUseCaseChange={(value) => updateDraft("useCase", value)}
            />
          )}

          {activeStep === 2 && <StepGoals goals={draft.goals} onGoalToggle={toggleGoal} />}

          {activeStep === 3 && (
            <StepSource
              source={draft.source}
              sourceOtherText={draft.sourceOtherText}
              onSourceSelect={(value) => {
                setStepError(null);
                updateDraft("source", value);
              }}
              onSourceOtherChange={(value) => updateDraft("sourceOtherText", value)}
            />
          )}

          {activeStep === 4 && (
            <StepChoosePlan
              selectedPlan={draft.selectedPlan}
              billingCycle={draft.billingCycle}
              paymentCompleted={draft.paymentCompleted}
              paidAmountCents={draft.paidAmountCents}
              onPlanSelect={(planId) => {
                setStepError(null);
                setDraft((prev) => {
                  if (prev.selectedPlan === planId) {
                    return prev;
                  }

                  return {
                    ...prev,
                    selectedPlan: planId,
                    paymentCompleted: false,
                    paidAmountCents: null,
                  };
                });
              }}
              onBillingCycleChange={(cycle) => updateDraft("billingCycle", cycle)}
              onPaymentComplete={(amountPaidCents) => {
                updateDraft("paymentCompleted", true);
                updateDraft("paidAmountCents", amountPaidCents);
                setActiveStep(5);
              }}
            />
          )}

          {activeStep === 5 && (
            <StepConnect
              email={initialEmail}
              isGoogleConnected={isGoogleConnected}
              isGoogleLoading={isGoogleLoading}
              googleError={googleError}
              onConnectGoogle={handleConnectGoogle}
              onGoToDashboard={goToDashboard}
            />
          )}

          {stepError && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {stepError}
            </p>
          )}

          {/* Navigation for steps 1-3 (standard flow) */}
          {activeStep < 4 && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {activeStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-slate-300 px-4 text-reply-navy hover:bg-slate-100"
                    onClick={handleBack}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl px-4 text-reply-muted hover:bg-slate-100"
                  onClick={handleSkip}
                >
                  Skip for now
                </Button>
              </div>

              <Button
                type="button"
                className="h-11 rounded-xl bg-reply-navy px-5 text-white hover:bg-reply-navy/90"
                onClick={handleContinue}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Navigation for step 4 (Choose Plan) — Back + Continue */}
          {activeStep === 4 && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-slate-300 px-4 text-reply-navy hover:bg-slate-100"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <Button
                type="button"
                className="h-11 rounded-xl bg-reply-navy px-5 text-white hover:bg-reply-navy/90"
                onClick={handleContinue}
              >
                {draft.selectedPlan === "free" ? "Continue with Free" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Navigation for step 5 (Connect Google) — Back only */}
          {activeStep === 5 && (
            <div className="mt-8 flex items-center justify-start">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-slate-300 px-4 text-reply-navy hover:bg-slate-100"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          )}
        </div>
      </div>

      {showConnectedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-reply-navy">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  Google Account Connected and Synced
                </h2>
                <p className="text-sm leading-6 text-reply-muted">
                  Your Google Business account is now linked and ready. We will start pulling
                  locations and reviews into your dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectedModal(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-reply-navy"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={goToDashboard}
                className="h-11 rounded-xl bg-reply-navy px-5 text-white hover:bg-reply-navy/90"
              >
                Close
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingStepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-y-3 text-sm">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isComplete = activeStep > stepNumber;
        const isCurrent = activeStep === stepNumber;

        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isComplete && "border-reply-green bg-reply-green text-white",
                  isCurrent && "border-reply-navy bg-reply-navy text-white",
                  !isComplete && !isCurrent && "border-slate-300 bg-white text-reply-muted"
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : stepNumber}
              </span>
              <span
                className={cn(
                  "font-semibold",
                  isCurrent ? "text-reply-navy" : isComplete ? "text-reply-green" : "text-slate-400"
                )}
              >
                {label}
              </span>
            </div>

            {index < STEP_LABELS.length - 1 && (
              <span className="mx-3 text-slate-300 sm:mx-4" aria-hidden>
                &gt;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
