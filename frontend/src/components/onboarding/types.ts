import type { LucideIcon } from "lucide-react";

export type OnboardingDraft = {
  companyName: string;
  websiteUrl: string;
  useCase: "own_business" | "single_client" | "multiple_clients";
  goals: string[];
  source: string;
  sourceOtherText: string;
};

export type SelectableItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};
