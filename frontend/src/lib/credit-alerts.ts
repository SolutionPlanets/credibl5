import { toast } from "sonner";

/**
 * Show a toast when an AI credit is successfully deducted.
 */
export function showCreditDeducted(remaining: number) {
  toast.info(`1 AI credit used. ${remaining} remaining.`, { duration: 3000 });
}

/**
 * Show an error toast when the user tries an AI action with no credits.
 */
export function showInsufficientCredits() {
  toast.error("Insufficient AI credits", {
    description:
      "This action requires AI credits. Purchase more credits or upgrade your plan.",
    action: {
      label: "Buy Credits",
      onClick: () => {
        window.location.href = "/protected/settings";
      },
    },
    duration: 8000,
  });
}

/**
 * Show a warning toast when credits are running low (≤20%).
 */
export function showLowCreditWarning(remaining: number, total: number) {
  const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;

  if (pct <= 10) {
    toast.warning("AI credits critically low", {
      description: `Only ${remaining} of ${total} credits remaining. Top up to avoid interruptions.`,
      duration: 8000,
    });
  } else {
    toast.warning("AI credits running low", {
      description: `${remaining} of ${total} credits remaining (${pct}%).`,
      duration: 6000,
    });
  }
}

/**
 * Show an error toast when credits are completely exhausted.
 */
export function showCreditsExhausted() {
  toast.error("AI credits exhausted", {
    description:
      "You have no AI credits remaining. AI-powered features are paused until you top up.",
    action: {
      label: "Buy Credits",
      onClick: () => {
        window.location.href = "/protected/settings";
      },
    },
    duration: 10000,
  });
}

/**
 * Check credit levels and show a one-time session alert if low/exhausted.
 * Uses sessionStorage to avoid repeated alerts in the same session.
 */
export function checkAndAlertCredits(remaining: number, total: number) {
  if (total <= 0) return;

  const pct = Math.round((remaining / total) * 100);
  const storageKey = "cradible5.credit-alert-shown";

  // Only show once per session
  if (typeof window !== "undefined" && sessionStorage.getItem(storageKey)) {
    return;
  }

  if (remaining === 0) {
    showCreditsExhausted();
    sessionStorage.setItem(storageKey, "exhausted");
  } else if (pct <= 20) {
    showLowCreditWarning(remaining, total);
    sessionStorage.setItem(storageKey, "low");
  }
}
