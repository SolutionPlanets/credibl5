import type { BillingCycle, PlanId } from "@/lib/shared/plan-config";

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  image?: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void | Promise<void>;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
    };
  }
}

const BACKEND_URL = process.env.NEXT_PUBLIC_GMB_BACKEND_URL ?? "http://localhost:8000";

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (document.getElementById("razorpay-script")) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function createOrder(
  token: string,
  planType: PlanId,
  billingCycle: BillingCycle
): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch(`${BACKEND_URL}/payments/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan_type: planType, billing_cycle: billingCycle }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create order" }));
    throw new Error(err.detail ?? "Failed to create order");
  }

  return res.json();
}

export async function verifyPayment(
  token: string,
  data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    plan_type: PlanId;
    billing_cycle: BillingCycle;
  }
): Promise<{
  success: boolean;
  plan_type?: string;
  amount_paid_cents?: number;
  payment_currency?: string;
  message?: string;
}> {
  const res = await fetch(`${BACKEND_URL}/payments/verify-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Payment verification failed" }));
    throw new Error(err.detail ?? err.error ?? "Payment verification failed");
  }

  return res.json();
}
