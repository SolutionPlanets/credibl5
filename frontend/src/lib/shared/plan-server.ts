import { createAdminClient } from "@/lib/supabase/server";
import {
    FREE_PLAN_DEFAULTS,
    AGENCY_PLAN_DEFAULTS,
    type PlanDefinition,
} from "./plan-config";

/**
 * Server-side plan lookup for Next.js API routes that can't use React context.
 * Queries the Supabase `plans` table directly using the admin client.
 * Returns static defaults for free/agency plans without a DB call.
 */
export async function getServerPlanDefinition(
    planType: string
): Promise<PlanDefinition> {
    if (planType === "free") return FREE_PLAN_DEFAULTS;
    if (planType === "agency") return AGENCY_PLAN_DEFAULTS;

    try {
        const admin = await createAdminClient();
        const { data } = await admin
            .from("plans")
            .select(
                "plan_type, name, credits, max_locations, features, limits_config, is_popular"
            )
            .eq("plan_type", planType)
            .maybeSingle();

        if (!data) return FREE_PLAN_DEFAULTS;

        const shortNameMap: Record<string, string> = { starter: "Basic", growth: "Pro" };
        const limitsConfig = (data.limits_config ?? {}) as Record<string, unknown>;

        return {
            id: data.plan_type as PlanDefinition["id"],
            name: data.name,
            shortName: shortNameMap[data.plan_type] || data.name,
            maxLocations: data.max_locations ?? 0,
            AiCredits: data.credits ?? 0,
            MonthlyPrice: null,
            YearlyPrice: null,
            popular: data.is_popular ?? false,
            autoReplyEnabled: Boolean(limitsConfig.autoReplyEnabled),
            pricingFeatures: (data.features as string[]) ?? [],
            signupFeatures: (data.features as string[]) ?? [],
        };
    } catch {
        return FREE_PLAN_DEFAULTS;
    }
}
