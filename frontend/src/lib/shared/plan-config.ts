export type PlanId = "free" | "starter" | "growth" | "agency";
export type BillingCycle = "monthly" | "yearly";

export const Free_trail_days = 30;

export type PlanDefinition = {
    id: PlanId;
    name: string;
    shortName: string;
    maxLocations: number;
    AiCredits: number;
    MonthlyPrice: number | null;
    YearlyPrice: number | null;
    isCustom?: boolean;
    popular?: boolean;
    trialInfo?: string;
    pricingFeatures: string[];
    signupFeatures: string[];
    autoReplyEnabled: boolean;
};

export type AddonPack = {
    plan_type: string;
    name: string;
    credits: number;
    pricing: { USD?: number; INR?: number };
};

// ---------------------------------------------------------------------------
// Static defaults for plans NOT stored in the database
// ---------------------------------------------------------------------------

export const FREE_PLAN_DEFAULTS: PlanDefinition = {
    id: "free",
    name: `${Free_trail_days}-Day Free Trial`,
    shortName: "Trial",
    maxLocations: 1,
    AiCredits: 50,
    MonthlyPrice: 0,
    YearlyPrice: 0,
    trialInfo: `${Free_trail_days} days free`,
    autoReplyEnabled: false,
    pricingFeatures: [
        "1 Google My Business location",
        "50 AI review replies",
        "Manual AI replies allowed",
        "Auto Reply disabled",
        `Plan expires after ${Free_trail_days} days`,
        "Email support",
    ],
    signupFeatures: [
        "1 GMB location",
        "50 AI reviews total",
        "Manual AI replies allowed",
        "Auto Reply disabled",
        "Email support",
    ],
};

export const AGENCY_PLAN_DEFAULTS: PlanDefinition = {
    id: "agency",
    name: "Custom",
    shortName: "Custom",
    maxLocations: -1,
    AiCredits: 2000,
    MonthlyPrice: null,
    YearlyPrice: null,
    isCustom: true,
    autoReplyEnabled: true,
    pricingFeatures: [
        "Contact sales",
        "Custom location count & credits",
        "Auto Reply enabled",
        "Multi-user team access",
        "Optional agency controls",
        "White-label option",
        "Dedicated account manager",
    ],
    signupFeatures: [
        "Custom locations & credits",
        "Auto Reply enabled",
        "Multi-user access",
        "White-label option",
        "Dedicated manager",
    ],
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "agency"];

export const PLAN_RANK: Record<PlanId, number> = {
    free: 0,
    starter: 1,
    growth: 2,
    agency: 3,
};

export function isPlanId(value: string | null | undefined): value is PlanId {
    return Boolean(value && ["free", "starter", "growth", "agency"].includes(value));
}

// ---------------------------------------------------------------------------
// Build PlanDefinition records from the /pricing API response
// ---------------------------------------------------------------------------

interface ApiPlan {
    plan_type: string;
    name: string;
    credits: number;
    max_locations: number;
    is_popular?: boolean;
    is_custom?: boolean;
    features?: string[];
    limits_config?: { autoReplyEnabled?: boolean; [key: string]: unknown };
    pricing?: { USD?: { monthly: number; yearly: number }; INR?: { monthly: number; yearly: number } };
}

export function buildPlanDefinitions(
    apiPlans: Record<string, ApiPlan>
): Record<PlanId, PlanDefinition> {
    const result: Record<string, PlanDefinition> = {};

    // Always include free and agency from static defaults
    result.free = FREE_PLAN_DEFAULTS;
    result.agency = AGENCY_PLAN_DEFAULTS;

    // Map DB plans
    for (const [key, plan] of Object.entries(apiPlans)) {
        if (key === "free" || key === "agency") continue;
        if (!isPlanId(key)) continue;

        const usdPricing = plan.pricing?.USD;
        const shortNameMap: Record<string, string> = { starter: "Basic", growth: "Pro" };

        result[key] = {
            id: key as PlanId,
            name: plan.name || key,
            shortName: shortNameMap[key] || plan.name || key,
            maxLocations: plan.max_locations ?? 0,
            AiCredits: plan.credits ?? 0,
            MonthlyPrice: usdPricing?.monthly ?? null,
            YearlyPrice: usdPricing?.yearly ?? null,
            popular: plan.is_popular ?? false,
            autoReplyEnabled: plan.limits_config?.autoReplyEnabled ?? false,
            pricingFeatures: plan.features ?? [],
            signupFeatures: plan.features ?? [],
        };
    }

    return result as Record<PlanId, PlanDefinition>;
}

// ---------------------------------------------------------------------------
// Plan lookup helpers (accept optional dynamic definitions)
// ---------------------------------------------------------------------------

export function getPlanDefinition(
    planId: string | null | undefined,
    planDefinitions?: Record<PlanId, PlanDefinition> | null
): PlanDefinition {
    const id = (planId as PlanId) || "free";
    if (planDefinitions && planDefinitions[id]) {
        return planDefinitions[id];
    }
    // Static fallback for free and agency
    if (id === "free") return FREE_PLAN_DEFAULTS;
    if (id === "agency") return AGENCY_PLAN_DEFAULTS;
    return FREE_PLAN_DEFAULTS;
}

export function getPlanCreditLimit(
    planId: string | null | undefined,
    planDefinitions?: Record<PlanId, PlanDefinition> | null
): number {
    return getPlanDefinition(planId, planDefinitions).AiCredits;
}

export function getPlanLocationLimit(
    planId: string | null | undefined,
    planDefinitions?: Record<PlanId, PlanDefinition> | null
): number {
    return getPlanDefinition(planId, planDefinitions).maxLocations;
}

export function getPlanPrice(
    planId: string | null | undefined,
    billingCycle: BillingCycle,
    dynamicPricing?: Record<string, Record<string, { monthly: number; yearly: number }>> | null,
    currency: string = "USD"
): number | null {
    if (dynamicPricing && planId && dynamicPricing[planId] && dynamicPricing[planId][currency]) {
        const prices = dynamicPricing[planId][currency];
        return billingCycle === "yearly" ? prices.yearly : prices.monthly;
    }

    const plan = getPlanDefinition(planId);
    return billingCycle === "yearly" ? plan.YearlyPrice : plan.MonthlyPrice;
}

export function createPlanDates(
    planId: string | null | undefined,
    billingCycle: BillingCycle = "monthly",
    from = new Date()
) {
    const startDate = new Date(from);
    const endDate = new Date(startDate);

    if (planId === "free") {
        endDate.setDate(endDate.getDate() + Free_trail_days);
    } else if (billingCycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 1);
    }

    return { startDate, endDate };
}

export function getStoredBillingCycle(
    planId: string | null | undefined,
    billingCycle: BillingCycle = "monthly"
) {
    return planId === "free" ? "trial" : billingCycle;
}
