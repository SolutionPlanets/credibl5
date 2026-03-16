import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  MapPin,
  Star,
  MessageSquare,
  ArrowRight,
  Store,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { ConnectGoogleButton } from "@/components/protected/connect-google-button";
import { GMBStatusAlert } from "@/components/protected/gmb-status-alert";

type ProtectedPageProps = {
  searchParams?:
    | {
        google?: string | string[];
        password_created?: string | string[];
      }
    | Promise<{
        google?: string | string[];
        password_created?: string | string[];
      }>;
};

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProtectedPage({ searchParams }: ProtectedPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  const displayName = user.user_metadata?.full_name || user.email || "User";
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("google_connected_at, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();
  const isGoogleConnected =
    Boolean(profileData?.google_connected_at) ||
    user.user_metadata?.google_connected === true;
  const onboardingCompleted = Boolean(profileData?.onboarding_completed);
  const resolvedSearchParams = (await searchParams) ?? {};
  const googleState = getSingleQueryValue(resolvedSearchParams.google);

  if (!onboardingCompleted && !isGoogleConnected) {
    redirect("/onboarding");
  }

  const passwordCreated = getSingleQueryValue(resolvedSearchParams.password_created) === "true";

  return (
    <div className="space-y-6">
      {passwordCreated && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="font-semibold">Password Created Successfully!</p>
          </div>
          <p className="mt-1 ml-7 text-emerald-600/80">
            You can now log in using either your Google account or your email and new password.
          </p>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-reply-navy">Welcome, {displayName}</h1>
        <p className="text-slate-500 mt-1">Your dashboard is ready.</p>
      </div>

      <GMBStatusAlert googleState={googleState} />

      {!isGoogleConnected ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-reply-navy">
            Connect your Google Business account
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            To get started, connect your Google Business Profile. Once connected, we can sync your
            locations and reviews automatically.
          </p>
          <div className="mt-6">
            <ConnectGoogleButton />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Locations</h3>
            <p className="mt-2 text-3xl font-bold text-reply-navy">0</p>
            <p className={cn(
              "mt-1 text-xs font-medium",
              isGoogleConnected ? "text-emerald-600" : "text-amber-600"
            )}>
              {isGoogleConnected ? "Google account connected" : "Google account not connected"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">Reviews</h3>
            <p className="mt-2 text-3xl font-bold text-reply-navy">0</p>
            <p className="mt-1 text-xs text-slate-400">Pending replies</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500">AI Credits</h3>
            <p className="mt-2 text-3xl font-bold text-reply-navy">-</p>
            <p className="mt-1 text-xs text-slate-400">Available this month</p>
          </div>
        </div>
      )}
    </div>
  );
}
