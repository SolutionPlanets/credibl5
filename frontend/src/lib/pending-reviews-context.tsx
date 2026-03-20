"use client";
import { createContext, useContext, useState } from "react";
import React from "react";

interface PendingReviewsContextValue {
  pendingCount: number;
  setPendingCount: (count: number) => void;
}

const PendingReviewsContext = createContext<PendingReviewsContextValue>({
  pendingCount: 0,
  setPendingCount: () => {},
});

export function PendingReviewsProvider({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  return (
    <PendingReviewsContext.Provider value={{ pendingCount, setPendingCount }}>
      {children}
    </PendingReviewsContext.Provider>
  );
}

export function usePendingReviews() {
  return useContext(PendingReviewsContext);
}
