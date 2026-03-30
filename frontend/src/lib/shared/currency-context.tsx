"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

type CurrencyCode = "USD" | "INR";

interface PricingData {
  [planId: string]: {
    [currency: string]: {
      monthly: number;
      yearly: number;
    };
  };
}

interface CurrencyContextType {
  currency: CurrencyCode;
  locale: string;
  symbol: string;
  formatCurrency: (amount: number) => string;
  dynamicPricing: PricingData | null;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const BACKEND_URL = process.env.NEXT_PUBLIC_GMB_BACKEND_URL ?? "http://localhost:8000";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [locale, setLocale] = useState("en-US");
  const [symbol, setSymbol] = useState("$");

  // Detect location-based currency via IP geolocation, fallback to timezone
  useEffect(() => {
    let cancelled = false;

    const setINR = () => {
      setCurrency("INR");
      setLocale("en-IN");
      setSymbol("₹");
    };

    const setUSD = () => {
      setCurrency("USD");
      setLocale("en-US");
      setSymbol("$");
    };

    const detectFromTimezone = () => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone.startsWith("Asia/Kolkata") || timezone === "Asia/Calcutta") {
        setINR();
      } else {
        setUSD();
      }
    };

    const detectFromIP = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch("https://ipapi.co/json/", {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error("Geo API failed");
        const data = await res.json();

        if (cancelled) return;

        if (data.country_code === "IN") {
          setINR();
        } else {
          setUSD();
        }
      } catch {
        if (!cancelled) {
          detectFromTimezone();
        }
      }
    };

    detectFromIP();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch dynamic pricing from backend
  const { data: dynamicPricing, isLoading } = useQuery<PricingData>({
    queryKey: ["pricing"],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/pricing`);
      if (!res.ok) throw new Error("Failed to fetch pricing");
      return res.json();
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        locale,
        symbol,
        formatCurrency,
        dynamicPricing: dynamicPricing || null,
        isLoading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
