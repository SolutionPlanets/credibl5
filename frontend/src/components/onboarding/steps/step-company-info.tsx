import { Building2, Globe2 } from "lucide-react";

import type { OnboardingDraft } from "@/components/onboarding/types";
import { cn } from "@/lib/shared/utils";

type StepCompanyInfoProps = {
  companyName: string;
  websiteUrl: string;
  useCase: OnboardingDraft["useCase"];
  onCompanyNameChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onUseCaseChange: (value: OnboardingDraft["useCase"]) => void;
};

export function StepCompanyInfo({
  companyName,
  websiteUrl,
  useCase,
  onCompanyNameChange,
  onWebsiteUrlChange,
  onUseCaseChange,
}: StepCompanyInfoProps) {
  const useCaseOptions: Array<{ id: OnboardingDraft["useCase"]; title: string }> = [
    { id: "own_business", title: "My own business" },
    { id: "single_client", title: "A single client" },
    { id: "multiple_clients", title: "Multiple clients (agency)" },
  ];

  return (
    <div>
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-reply-purple">Step 1</p>
        <h1 className="mt-2 text-3xl font-bold text-reply-navy">Welcome to Cradible5</h1>
        <p className="mt-3 text-base text-reply-muted">Tell us a bit about your company.</p>
      </div>

      <div className="mt-8 space-y-5">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-reply-navy">Company Name</span>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={companyName}
              onChange={(event) => onCompanyNameChange(event.target.value)}
              placeholder="Your company name"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-reply-navy outline-none transition-colors focus:border-reply-purple"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-reply-navy">Website URL</span>
          <div className="relative">
            <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              value={websiteUrl}
              onChange={(event) => onWebsiteUrlChange(event.target.value)}
              placeholder="https://www.example.com"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-reply-navy outline-none transition-colors focus:border-reply-purple"
            />
          </div>
          <p className="text-xs text-reply-muted">
            We can use this to help identify your review profiles.
          </p>
        </label>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-reply-navy">I use Cradible5 for:</p>
          <div className="space-y-2">
            {useCaseOptions.map((option) => {
              const isSelected = useCase === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onUseCaseChange(option.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all",
                    isSelected
                      ? "border-reply-purple bg-reply-purple/10 text-reply-navy"
                      : "border-slate-300 bg-white text-reply-muted hover:border-slate-400"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-4 w-4 rounded-full border",
                      isSelected ? "border-reply-purple" : "border-slate-400"
                    )}
                  >
                    {isSelected && (
                      <span className="m-auto h-2 w-2 rounded-full bg-reply-purple" aria-hidden />
                    )}
                  </span>
                  {option.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
