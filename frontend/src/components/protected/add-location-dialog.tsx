"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, Loader2, MapPin, RefreshCw, Store } from "lucide-react";

// Local Alert component since the UI one might be missing
type AlertVariant = "default" | "destructive";

type AlertProps = {
  children: React.ReactNode;
  className?: string;
  variant?: AlertVariant;
};

const Alert = ({ children, className = "", variant = "default" }: AlertProps) => (
  <div className={`p-4 rounded-2xl flex gap-3 ${variant === "destructive" ? "bg-red-50 text-red-900 border border-red-200" : "bg-blue-50 text-blue-900 border border-blue-200"} ${className}`}>
    {children}
  </div>
);

const AlertTitle = ({ children }: { children: React.ReactNode }) => (
  <h5 className="font-bold leading-none tracking-tight">{children}</h5>
);
const AlertDescription = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm opacity-90">{children}</div>
);

interface AddLocationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface GMBAccount {
  name: string;
  accountName: string;
  type: string;
  role: string;
}

interface GMBLocation {
  name: string;
  title: string;
  address: string;
  category: string;
}

const ACCOUNTS_CACHE_TTL_MS = 10 * 60 * 1000;
const LOCATIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 65 * 1000;

type CachedAccounts = { timestamp: number; accounts: GMBAccount[] };
type CachedLocations = { timestamp: number; locations: GMBLocation[] };

const accountsCacheByUser = new Map<string, CachedAccounts>();
const accountsInflightByUser = new Map<string, Promise<GMBAccount[]>>();
const accountsRateLimitUntilByUser = new Map<string, number>();
const locationsCacheByUserAccount = new Map<string, CachedLocations>();
const locationsInflightByUserAccount = new Map<string, Promise<GMBLocation[]>>();
const locationsRateLimitUntilByUserAccount = new Map<string, number>();

const isQuotaError = (message: string) => {
  const lower = message.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("requests per minute") ||
    lower.includes("429")
  );
};

const isReconnectError = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    return code === "GOOGLE_RECONNECT_REQUIRED" || code === "GOOGLE_AUTH_ERROR";
  }
  return false;
};

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return "Something went wrong. Please try again.";
};

export function AddLocationDialog({ isOpen, onClose, onSuccess }: AddLocationDialogProps) {
  const [step, setStep] = useState<"accounts" | "locations">("accounts");
  const [accounts, setAccounts] = useState<GMBAccount[]>([]);
  const [locations, setLocations] = useState<GMBLocation[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      setStep("accounts");
      setSelectedAccount("");
      setSelectedLocation("");
      setError(null);
      setNeedsReconnect(false);
    }
  }, [isOpen]);

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    setNeedsReconnect(false);
    let userId = "";

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) throw new Error("Not authenticated");
      userId = session.user.id;

      const rateLimitUntil = accountsRateLimitUntilByUser.get(userId) ?? 0;
      if (Date.now() < rateLimitUntil) {
        const staleCache = accountsCacheByUser.get(userId);
        if (staleCache?.accounts?.length) {
          setAccounts(staleCache.accounts);
        }
        const retrySeconds = Math.max(1, Math.ceil((rateLimitUntil - Date.now()) / 1000));
        setError(`Google API rate limit is active. Please retry in about ${retrySeconds} seconds.`);
        return;
      }

      const freshCache = accountsCacheByUser.get(userId);
      if (freshCache && Date.now() - freshCache.timestamp < ACCOUNTS_CACHE_TTL_MS) {
        setAccounts(freshCache.accounts);
        return;
      }

      const inflightRequest = accountsInflightByUser.get(userId);
      if (inflightRequest) {
        const inflightAccounts = await inflightRequest;
        setAccounts(inflightAccounts);
        return;
      }

      const request = (async () => {
        const response = await fetch(`${process.env.NEXT_PUBLIC_GMB_BACKEND_URL}/gmb/accounts`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const detail = errorData?.detail;
          if (typeof detail === 'object' && detail !== null) {
            throw detail; // Throw the error object directly
          }
          throw new Error(detail || "Failed to fetch accounts");
        }

        const data = await response.json();
        // If the backend sent a stale/rate-limited response
        if (data.rate_limited && data.message) {
          setError(data.message);
        }
        return (data.accounts || []) as GMBAccount[];
      })();

      accountsInflightByUser.set(userId, request);
      const fetchedAccounts = await request;
      accountsCacheByUser.set(userId, { timestamp: Date.now(), accounts: fetchedAccounts });
      setAccounts(fetchedAccounts);
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      console.error("Fetch accounts error:", err);

      if (isReconnectError(err)) {
        setNeedsReconnect(true);
        setError(message);
        return;
      }

      const staleCache = userId ? accountsCacheByUser.get(userId) : undefined;
      if (staleCache?.accounts?.length && isQuotaError(message)) {
        accountsRateLimitUntilByUser.set(userId, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        setAccounts(staleCache.accounts);
        setError("Google API is rate-limited right now. Showing your cached accounts. Please retry in about 1 minute.");
        return;
      }

      if (isQuotaError(message)) {
        if (userId) {
          accountsRateLimitUntilByUser.set(userId, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        }
        setError("Google API rate limit reached. Please wait about 1 minute and try again.");
        return;
      }

      setError(message);
    } finally {
      if (userId) {
        accountsInflightByUser.delete(userId);
      }
      setLoading(false);
    }
  };

  const handleReconnectGoogle = async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/auth/login';
        return;
      }
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_GMB_BACKEND_URL}/auth/google/url?next=${encodeURIComponent('/protected')}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) throw new Error("Failed to get Google auth URL");
      const { authorization_url } = await res.json();
      window.location.href = authorization_url;
    } catch {
      window.location.href = '/protected';
    }
  };

  const fetchLocations = async (accountName: string) => {
    setLoading(true);
    setError(null);
    let cacheKey = "";

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) throw new Error("Not authenticated");
      cacheKey = `${session.user.id}:${accountName}`;

      const rateLimitUntil = locationsRateLimitUntilByUserAccount.get(cacheKey) ?? 0;
      if (Date.now() < rateLimitUntil) {
        const staleCache = locationsCacheByUserAccount.get(cacheKey);
        if (staleCache?.locations?.length) {
          setLocations(staleCache.locations);
          setStep("locations");
        }
        const retrySeconds = Math.max(1, Math.ceil((rateLimitUntil - Date.now()) / 1000));
        setError(`Google API rate limit is active. Please retry in about ${retrySeconds} seconds.`);
        return;
      }

      const freshCache = locationsCacheByUserAccount.get(cacheKey);
      if (freshCache && Date.now() - freshCache.timestamp < LOCATIONS_CACHE_TTL_MS) {
        setLocations(freshCache.locations);
        setStep("locations");
        return;
      }

      const inflightRequest = locationsInflightByUserAccount.get(cacheKey);
      if (inflightRequest) {
        const inflightLocations = await inflightRequest;
        setLocations(inflightLocations);
        setStep("locations");
        return;
      }

      const request = (async () => {
        const response = await fetch(`${process.env.NEXT_PUBLIC_GMB_BACKEND_URL}/gmb/locations?accountName=${encodeURIComponent(accountName)}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const detail = errorData?.detail;
          if (typeof detail === 'object' && detail !== null) {
            throw detail;
          }
          throw new Error(detail || "Failed to fetch locations");
        }

        const data = await response.json();
        if (data.rate_limited && data.message) {
          setError(data.message);
        }
        return (data.locations || []) as GMBLocation[];
      })();

      locationsInflightByUserAccount.set(cacheKey, request);
      const fetchedLocations = await request;
      locationsCacheByUserAccount.set(cacheKey, { timestamp: Date.now(), locations: fetchedLocations });
      setLocations(fetchedLocations);
      setStep("locations");
    } catch (err: unknown) {
      console.error("Fetch locations error:", err);
      const message = toErrorMessage(err);
      if (cacheKey && isQuotaError(message)) {
        locationsRateLimitUntilByUserAccount.set(cacheKey, Date.now() + RATE_LIMIT_COOLDOWN_MS);
      }
      setError(isQuotaError(message) ? "Google API rate limit reached. Please wait about 1 minute and try again." : message);
    } finally {
      if (cacheKey) {
        locationsInflightByUserAccount.delete(cacheKey);
      }
      setLoading(false);
    }
  };

  const handleAccountSelect = (value: string) => {
    setSelectedAccount(value);
  };

  const handleNextStep = () => {
    if (selectedAccount) {
      fetchLocations(selectedAccount);
    }
  };

  const handleSaveLocation = async () => {
    if (!selectedLocation) return;

    setIsSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) throw new Error("Not authenticated");

      const location = locations.find(l => l.name === selectedLocation);
      if (!location) throw new Error("Selected location not found");

      // Extract location ID from the name (format: accounts/{accountId}/locations/{locationId})
      const locationId = selectedLocation.split("/").pop() || "";
      const accountId = selectedAccount.split("/").pop() || "";

      const response = await fetch(`${process.env.NEXT_PUBLIC_GMB_BACKEND_URL}/gmb/locations/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          gmbAccountId: accountId,
          locationId: locationId,
          locationName: location.title,
          address: location.address,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Handle plan limit error specifically
        if (errorData.detail && typeof errorData.detail === 'object' && errorData.detail.code === 'PLAN_LIMIT_REACHED') {
          throw new Error(errorData.detail.message);
        }
        throw new Error(errorData.detail || "Failed to save location");
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      console.error("Save location error:", err);
      setError(toErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] overflow-hidden rounded-[28px] border border-slate-200 p-0">
        <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-cyan-50 to-emerald-50">
          <DialogHeader className="px-6 pb-4 pt-6">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3 text-slate-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <MapPin className="h-5 w-5" />
              </span>
              Add New Location
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {step === "accounts"
                ? "Pick the Google account you want to connect."
                : "Select the location you want to sync with Credibl5."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-5">
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${step === "accounts"
                  ? "border-sky-300 bg-sky-100 text-sky-800"
                  : "border-slate-200 bg-white/70 text-slate-500"
                  }`}
              >
                1. Select Account
              </div>
              <div
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${step === "locations"
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                  : "border-slate-200 bg-white/70 text-slate-500"
                  }`}
              >
                2. Select Location
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 pt-5">
          {error && (
            <Alert variant="destructive" className="mb-6 rounded-2xl flex flex-col items-start gap-1">
              <div className="flex gap-3 items-center">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertTitle>{needsReconnect ? "Reconnection Required" : "Error"}</AlertTitle>
              </div>
              <AlertDescription className="mt-1 ml-7">
                {error}
                {(needsReconnect || (typeof error === 'string' && (error.includes('Google connection') || error.includes('reconnect')))) && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReconnectGoogle}
                      className="bg-white/10 border-red-200 hover:bg-white/20 text-red-900 rounded-xl font-bold"
                    >
                      Reconnect Google Account
                    </Button>
                  </div>
                )}
                {!needsReconnect && (typeof error === 'string' && (error.includes('authenticated') || error.includes('Supabase session') || error.includes('access token'))) && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.location.href = '/auth/login'}
                      className="bg-white/10 border-red-200 hover:bg-white/20 text-red-900 rounded-xl font-bold"
                    >
                      Return to Login
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 text-sky-600 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Fetching details from Google...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {step === "accounts" ? (
                <div className="space-y-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 ml-1">
                    Google Business Accounts
                  </label>
                  <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-1">
                    {accounts.map((account) => {
                      const isSelected = selectedAccount === account.name;
                      return (
                        <button
                          key={account.name}
                          type="button"
                          onClick={() => handleAccountSelect(account.name)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${isSelected
                            ? "border-sky-400 bg-sky-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg ${isSelected
                                  ? "bg-sky-200 text-sky-800"
                                  : "bg-slate-100 text-slate-600"
                                  }`}
                              >
                                <Building2 className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {account.accountName || "Google Business Account"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {account.type || "Account"} | {account.role || "Member"}
                                </p>
                              </div>
                            </div>
                            {isSelected ? (
                              <CheckCircle2 className="h-5 w-5 text-sky-600" />
                            ) : (
                              <span className="mt-0.5 h-4 w-4 rounded-full border border-slate-300" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {accounts.length === 0 && !loading && !error && (
                    <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 mt-2">
                      No Google Business accounts found. Make sure your primary Google account has at least one business verified.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Available Locations</label>
                    <button
                      onClick={() => {
                        setStep("accounts");
                        setSelectedLocation("");
                      }}
                      className="text-xs text-sky-700 font-semibold hover:underline"
                    >
                      Change account
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                    {locations.map((loc) => (
                      <button
                        type="button"
                        key={loc.name}
                        onClick={() => setSelectedLocation(loc.name)}
                        className={`w-full p-4 rounded-2xl border text-left transition-all ${selectedLocation === loc.name
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-lg ${selectedLocation === loc.name
                                  ? "bg-emerald-200 text-emerald-800"
                                  : "bg-slate-100 text-slate-600"
                                  }`}
                              >
                                <Store className="h-3.5 w-3.5" />
                              </span>
                              <p className={`font-bold truncate ${selectedLocation === loc.name ? "text-emerald-900" : "text-slate-900"}`}>
                                {loc.title}
                              </p>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 line-clamp-1">
                              <MapPin className="mr-1 inline h-3 w-3" />
                              {loc.address || "Address not available"}
                            </p>
                            <span className="mt-2 inline-flex h-5 items-center rounded-full border border-slate-200 bg-white px-2 text-[10px] font-bold uppercase tracking-tight text-slate-600">
                              {loc.category || "General"}
                            </span>
                          </div>
                          <div className="pt-0.5">
                            {selectedLocation === loc.name ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <span className="block h-4 w-4 rounded-full border border-slate-300" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    {locations.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-10">
                        No locations found for this account.
                      </p>
                    )}
                  </div>
                  {selectedLocation && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      Location selected. You can now save and start sync.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:justify-between">
          {step === "accounts" && (
            <Button
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-slate-200 h-11 px-6 font-semibold bg-white hover:bg-slate-100"
              disabled={isSaving}
            >
              Cancel
            </Button>
          )}
          {step === "locations" && (
            <Button
              variant="outline"
              onClick={() => {
                setStep("accounts");
                setSelectedLocation("");
              }}
              className="rounded-xl border-slate-200 h-11 px-6 font-semibold bg-white hover:bg-slate-100"
              disabled={isSaving}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {step === "accounts" ? (
            <Button
              onClick={handleNextStep}
              disabled={!selectedAccount || loading}
              className="rounded-xl bg-slate-900 text-white h-11 px-6 font-semibold hover:bg-slate-800"
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={handleSaveLocation}
              disabled={!selectedLocation || isSaving}
              className="rounded-xl bg-emerald-600 text-white h-11 px-6 font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : "Add Location"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
