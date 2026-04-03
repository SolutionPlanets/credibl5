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
  billingCycle: BillingCycle,
  currency: string = "USD"
): Promise<{ id: string; amount: number; currency: string }> {
  console.log(`Creating Razorpay order for plan ${planType}, cycle ${billingCycle}, currency ${currency}`);
  const res = await fetch(`${BACKEND_URL}/payments/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan_type: planType, billing_cycle: billingCycle, currency }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to create order" }));
    console.error("Razorpay order creation failed:", err);
    throw new Error(err.detail ?? "Failed to create order. Please check your internet connection.");
  }

  const order = await res.json();
  console.log("Successfully created Razorpay order:", order.id);
  return order;
}

export async function verifyPayment(
  token: string,
  data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
    plan_type: PlanId;
    billing_cycle: BillingCycle;
    currency?: string;
  }
): Promise<{
  success: boolean;
  plan_type?: string;
  amount_paid_cents?: number;
  payment_currency?: string;
  message?: string;
}> {
  console.log(`Verifying payment signature for order: ${data.razorpay_order_id}`);
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
    console.error("Payment verification failed:", err);
    throw new Error(err.detail ?? err.error ?? "Payment verification failed. If your money was deducted, please contact support.");
  }

  const result = await res.json();
  console.log("Payment verified successfully:", result);
  return result;
}
