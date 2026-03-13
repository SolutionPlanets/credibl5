import { createClient } from "@/lib/server";
import { redirect } from "next/navigation";
import { ConnectGoogleButton } from "@/components/protected/connect-google-button";

type ProtectedPageProps = {
  searchParams?: {
    google?: string | string[];
  };
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
    .select("google_connected_at")
    .eq("id", user.id)
    .maybeSingle();
  const isGoogleConnected =
    Boolean(profileData?.google_connected_at) ||
    user.user_metadata?.google_connected === true;
  const googleState = getSingleQueryValue(searchParams?.google);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-reply-navy">Welcome, {displayName}</h1>
        <p className="text-slate-500 mt-1">Your dashboard is ready.</p>
      </div>

      {googleState === "connected" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          Google Business account connected successfully.
        </div>
      )}

      {googleState === "missing_refresh_token" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Google did not return an offline refresh token. Please connect again.
        </div>
      )}

      {googleState === "save_failed" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          We could not save your Google connection. Please try again.
        </div>
      )}

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
            <p className="mt-1 text-xs text-slate-400">Google account connected</p>
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
