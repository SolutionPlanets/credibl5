"use client";

import { useState } from "react";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import {
  PLAN_DEFINITIONS,
  type BillingCycle,
  type PlanId,
} from "@/lib/shared/plan-config";
import { createClient } from "@/lib/supabase/client";
import {
  createOrder,
  loadRazorpayScript,
  verifyPayment,
  type RazorpayOptions,
  type RazorpayResponse,
} from "@/lib/payments/razorpay";

type StepChoosePlanProps = {
  selectedPlan: PlanId;
  billingCycle: BillingCycle;
  paymentCompleted: boolean;
  paidAmountCents: number | null;
  onPlanSelect: (planId: PlanId) => void;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  onPaymentComplete: (amountPaidCents: number) => void;
};

const DISPLAY_PLANS: PlanId[] = ["free", "starter", "growth", "agency"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function StepChoosePlan({
  selectedPlan,
  billingCycle,
  paymentCompleted,
  paidAmountCents,
  onPlanSelect,
  onBillingCycleChange,
  onPaymentComplete,
}: StepChoosePlanProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [planWarning, setPlanWarning] = useState<string | null>(null);

  const isPaidPlanLocked =
    paymentCompleted &&
    selectedPlan !== "free" &&
    !PLAN_DEFINITIONS[selectedPlan].isCustom;

  const handlePlanSelect = (planId: PlanId) => {
    if (isProcessing) {
      return;
    }

    setPaymentError(null);

    if (isPaidPlanLocked && planId !== selectedPlan) {
      setPlanWarning(
        `Your current plan is ${PLAN_DEFINITIONS[selectedPlan].name}. You can change plans after completing onboarding.`
      );
      return;
    }

    setPlanWarning(null);
    onPlanSelect(planId);
  };

  const handlePayment = async (planId: PlanId) => {
    setPaymentError(null);
    setPlanWarning(null);
    setIsProcessing(true);

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setPaymentError("Failed to load payment gateway. Please try again.");
        setIsProcessing(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setPaymentError("Session expired. Please sign in again.");
        setIsProcessing(false);
        return;
      }

      const order = await createOrder(session.access_token, planId, billingCycle);

      const options: RazorpayOptions = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "Credibl5",
        description: `${PLAN_DEFINITIONS[planId].name} Plan - ${billingCycle}`,
        prefill: { email: session.user?.email ?? undefined },
        theme: { color: "#0f172a" },
        handler: async (response: RazorpayResponse) => {
          try {
            const {
              data: { session: refreshedSession },
            } = await supabase.auth.getSession();
            const accessToken = refreshedSession?.access_token ?? session.access_token;

            const verification = await verifyPayment(accessToken, {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              plan_type: planId,
              billing_cycle: billingCycle,
            });
            onPaymentComplete(verification.amount_paid_cents ?? order.amount);
          } catch (error) {
            setPaymentError(
              error instanceof Error
                ? error.message
                : "Payment verification failed. Please contact support."
            );
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-reply-purple">
          Step 4
        </p>
        <h1 className="mt-2 text-3xl font-bold text-reply-navy">Choose your plan</h1>
        <p className="mt-3 text-base text-reply-muted">
          Start free or pick the plan that fits your team.
        </p>
      </div>

      <div className="mt-6 flex justify-center">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
          {(["monthly", "yearly"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              className={cn(
                "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
                billingCycle === cycle
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-950",
                isPaidPlanLocked && "cursor-not-allowed opacity-60"
              )}
              onClick={() => {
                if (isPaidPlanLocked) {
                  setPlanWarning(
                    `Your current plan is ${PLAN_DEFINITIONS[selectedPlan].name}. Billing cycle changes are available after onboarding.`
                  );
                  return;
                }
                setPlanWarning(null);
                onBillingCycleChange(cycle);
              }}
              disabled={isProcessing}
            >
              {cycle === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {DISPLAY_PLANS.map((planId) => {
          const plan = PLAN_DEFINITIONS[planId];
          const price =
            billingCycle === "yearly" ? plan.YearlyPrice : plan.MonthlyPrice;
          const isSelected = selectedPlan === planId;
          const isPaid = planId !== "free" && !plan.isCustom;
          const isCustom = Boolean(plan.isCustom);
          const isPopular = Boolean(plan.popular);
          const hasLockedState = isPaidPlanLocked && planId !== selectedPlan;

          return (
            <div
              key={planId}
              role="button"
              tabIndex={isProcessing ? -1 : 0}
              onClick={() => handlePlanSelect(planId)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handlePlanSelect(planId);
                }
              }}
              aria-disabled={isProcessing || hasLockedState}
              className={cn(
                "relative flex flex-col rounded-2xl border p-5 text-left transition-all",
                isSelected
                  ? "border-reply-purple bg-reply-purple/5 ring-2 ring-reply-purple/30"
                  : "border-slate-200 bg-white hover:border-slate-300",
                (isProcessing || hasLockedState) && "cursor-not-allowed opacity-60"
              )}
            >
              {isPopular && (
                <span className="absolute -top-2.5 right-4 rounded-full bg-cyan-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-800">
                  Popular
                </span>
              )}

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-bold text-reply-navy">{plan.name}</span>
                {isSelected && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-reply-purple text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>

              <div className="mt-2">
                {isCustom ? (
                  <span className="text-2xl font-extrabold text-reply-navy">Custom</span>
                ) : (
                  <>
                    <span className="text-2xl font-extrabold text-reply-navy">
                      {formatCurrency(price ?? 0)}
                    </span>
                    <span className="ml-1 text-sm text-slate-500">
                      /{billingCycle === "monthly" ? "mo" : "yr"}
                    </span>
                  </>
                )}
              </div>

              <ul className="mt-4 space-y-1.5">
                {plan.signupFeatures.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-xs text-slate-600">
                    <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-500" />
                    {feat}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-4">
                {paymentCompleted && isSelected && isPaid ? (
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    <div className="flex items-center justify-center gap-1.5">
                      <Check className="h-4 w-4" />
                      Payment complete
                    </div>
                    {paidAmountCents !== null && (
                      <p className="mt-1 text-center text-xs font-medium text-emerald-800">
                        Paid {formatCurrency(paidAmountCents / 100)}
                      </p>
                    )}
                  </div>
                ) : isSelected && isPaid ? (
                  <Button
                    type="button"
                    className="h-10 w-full rounded-xl bg-reply-navy text-white hover:bg-reply-navy/90"
                    disabled={isProcessing}
                    onClick={(event) => {
                      event.stopPropagation();
                      handlePayment(planId);
                    }}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Pay {formatCurrency(price ?? 0)}
                      </>
                    )}
                  </Button>
                ) : isSelected && isCustom ? (
                  <a
                    href="/contact"
                    className="flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-reply-navy hover:bg-slate-200"
                  >
                    Contact sales
                  </a>
                ) : isSelected && planId === "free" ? (
                  <div className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
                    <Sparkles className="h-4 w-4" />
                    Free - no payment needed
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {planWarning && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {planWarning}
        </p>
      )}

      {paymentError && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {paymentError}
        </p>
      )}
    </div>
  );
}
