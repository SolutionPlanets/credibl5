import type { LucideIcon } from "lucide-react";
import type { BillingCycle, PlanId } from "@/lib/shared/plan-config";

export type OnboardingDraft = {
  companyName: string;
  websiteUrl: string;
  useCase: "own_business" | "single_client" | "multiple_clients";
  goals: string[];
  source: string;
  sourceOtherText: string;
  selectedPlan: PlanId;
  billingCycle: BillingCycle;
  paymentCompleted: boolean;
  paidAmountCents: number | null;
};

export type SelectableItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
};
