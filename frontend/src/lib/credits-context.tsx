"use client";

import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CreditState {
  total: number;
  used: number;
  remaining: number;
}

interface CreditContextValue {
  credits: CreditState;
  setCredits: (credits: CreditState) => void;
  refreshCredits: () => Promise<CreditState | null>;
}

const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({
  children,
  initialCredits,
  userId,
}: {
  children: React.ReactNode;
  initialCredits: CreditState;
  userId: string | null;
}) {
  const [credits, setCreditsState] = useState<CreditState>(initialCredits);

  // Sync when parent (layout) pushes new values via realtime subscription
  useEffect(() => {
    setCreditsState(initialCredits);
  }, [initialCredits.total, initialCredits.used, initialCredits.remaining]);

  const setCredits = useCallback((next: CreditState) => {
    setCreditsState(next);
  }, []);

  const refreshCredits = useCallback(async (): Promise<CreditState | null> => {
    if (!userId) return null;
    const supabase = createClient();
    const { data } = await supabase
      .from("subscription_plans")
      .select("total_ai_credits,ai_credits_used,remaining_ai_credits")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      const next: CreditState = {
        total: data.total_ai_credits ?? 0,
        used: data.ai_credits_used ?? 0,
        remaining: data.remaining_ai_credits ?? 0,
      };
      setCreditsState(next);
      return next;
    }
    return null;
  }, [userId]);

  return (
    <CreditContext.Provider value={{ credits, setCredits, refreshCredits }}>
      {children}
    </CreditContext.Provider>
  );
}

export function useCredits(): CreditContextValue {
  const ctx = useContext(CreditContext);
  if (!ctx) {
    throw new Error("useCredits must be used within a CreditProvider");
  }
  return ctx;
}
