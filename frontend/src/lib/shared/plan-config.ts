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

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
    free: {
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
    },
    starter: {
        id: "starter",
        name: "Basic",
        shortName: "Basic",
        maxLocations: 2,
        AiCredits: 100,
        MonthlyPrice: 20,
        YearlyPrice: 200,
        autoReplyEnabled: false,
        pricingFeatures: [
            "2 active locations",
            "100 AI credits/month",
            "Auto Reply disabled",
            "Brand voice training",
            "Response templates",
            "Email support",
        ],
        signupFeatures: [
            "2 active locations",
            "100 AI credits/month",
            "Auto Reply disabled",
            "Brand voice training",
            "Email support",
        ],
    },
    growth: {
        id: "growth",
        name: "Pro",
        shortName: "Pro",
        maxLocations: 5,
        AiCredits: 500,
        MonthlyPrice: 50,
        YearlyPrice: 500,
        popular: true,
        autoReplyEnabled: true,
        pricingFeatures: [
            "Up to 5 active locations",
            "500 AI credits/month",
            "Auto Reply enabled",
            "Custom brand voice training",
            "Advanced templates builder",
            "Priority support",
            "Analytics dashboard",
        ],
        signupFeatures: [
            "5 active locations",
            "500 AI responses/month",
            "Auto Reply enabled",
            "Custom brand voice",
            "Priority support",
        ],
    },
    agency: {
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
    },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "agency"];

export const PLAN_RANK: Record<PlanId, number> = {
    free: 0,
    starter: 1,
    growth: 2,
    agency: 3,
};

export function isPlanId(value: string | null | undefined): value is PlanId {
    return Boolean(value && value in PLAN_DEFINITIONS);
}

export const AI_ADDON_PRICING = [
    { credits: 20, price: 299 },
    { credits: 50, price: 499 },
    { credits: 100, price: 899 },
] as const;

export function getPlanDefinition(
    planId: string | null | undefined
): PlanDefinition {
    return (
        PLAN_DEFINITIONS[(planId as PlanId) || "free"] ?? PLAN_DEFINITIONS.free
    );
}

export function getPlanCreditLimit(
    planId: string | null | undefined
): number {
    return getPlanDefinition(planId).AiCredits;
}

export function getPlanLocationLimit(
    planId: string | null | undefined
): number {
    return getPlanDefinition(planId).maxLocations;
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