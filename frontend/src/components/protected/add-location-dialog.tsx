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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, CheckCircle2, Loader2, MapPin, RefreshCw } from "lucide-react";

// Local Alert component since the UI one might be missing
const Alert = ({ children, className, variant }: any) => (
  <div className={`p-4 rounded-2xl flex gap-3 ${variant === 'destructive' ? 'bg-red-50 text-red-900 border border-red-200' : 'bg-blue-50 text-blue-900 border border-blue-200'} ${className}`}>
    {children}
  </div>
);

const AlertTitle = ({ children }: any) => <h5 className="font-bold leading-none tracking-tight">{children}</h5>;
const AlertDescription = ({ children }: any) => <div className="text-sm opacity-90">{children}</div>;

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

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
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

  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
      setStep("accounts");
      setSelectedAccount("");
      setSelectedLocation("");
      setError(null);
    }
  }, [isOpen]);

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
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
          throw new Error(errorData?.detail || "Failed to fetch accounts");
        }

        const data = await response.json();
        return (data.accounts || []) as GMBAccount[];
      })();

      accountsInflightByUser.set(userId, request);
      const fetchedAccounts = await request;
      accountsCacheByUser.set(userId, { timestamp: Date.now(), accounts: fetchedAccounts });
      setAccounts(fetchedAccounts);
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      console.error("Fetch accounts error:", err);

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
          throw new Error(errorData?.detail || "Failed to fetch locations");
        }

        const data = await response.json();
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
    } catch (err: any) {
      console.error("Save location error:", err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-sky-600" />
            Add New Location
          </DialogTitle>
          <DialogDescription>
            {step === "accounts" 
              ? "Select your Google Business account to see your locations."
              : "Choose the specific location you want to sync with Credibl5."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {error && (
            <Alert variant="destructive" className="mb-6 rounded-2xl">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 text-sky-600 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Fetching details from Google...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {step === "accounts" ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 ml-1">Select account</label>
                  <Select onValueChange={handleAccountSelect} value={selectedAccount}>
                    <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:ring-sky-500">
                      <SelectValue placeholder="Select a GMB account" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200">
                      {accounts.map((account) => (
                        <SelectItem key={account.name} value={account.name} className="py-3 rounded-lg">
                          <div className="flex flex-col">
                            <span className="font-medium">{account.accountName}</span>
                            <span className="text-xs text-slate-500 uppercase tracking-wider">{account.type}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {accounts.length === 0 && !loading && !error && (
                    <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 mt-2">
                      No Google Business accounts found. Make sure your primary Google account has at least one business verified.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-sm font-semibold text-slate-700">Select location</label>
                    <button 
                      onClick={() => setStep("accounts")}
                      className="text-xs text-sky-600 font-medium hover:underline"
                    >
                      Change account
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {locations.map((loc) => (
                      <div 
                        key={loc.name}
                        onClick={() => setSelectedLocation(loc.name)}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                          selectedLocation === loc.name 
                            ? "border-sky-500 bg-sky-50" 
                            : "border-slate-100 hover:border-sky-200 hover:bg-slate-50/50"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className={`font-bold ${selectedLocation === loc.name ? "text-sky-900" : "text-slate-900"}`}>
                              {loc.title}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{loc.address}</p>
                            <Badge variant="outline" className="mt-2 text-[10px] uppercase font-bold tracking-tight py-0 px-1.5 h-5">
                              {loc.category}
                            </Badge>
                          </div>
                          {selectedLocation === loc.name && (
                            <CheckCircle2 className="h-5 w-5 text-sky-600" />
                          )}
                        </div>
                      </div>
                    ))}
                    {locations.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-10">
                        No locations found for this account.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="rounded-xl border-slate-200 h-11 px-6 font-semibold"
            disabled={isSaving}
          >
            Cancel
          </Button>
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
              className="rounded-xl bg-sky-600 text-white h-11 px-6 font-semibold hover:bg-sky-700 shadow-lg shadow-sky-600/20"
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

const Badge = ({ children, className, variant }: any) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>
    {children}
  </span>
);
