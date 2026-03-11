import { createClient } from "@/lib/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/login");
  }

  const displayName =
    user.user_metadata?.full_name || user.email || "User";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-reply-navy">
          Welcome, {displayName}
        </h1>
        <p className="text-slate-500 mt-1">
          Your dashboard is ready. Start managing your reviews.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Locations</h3>
          <p className="mt-2 text-3xl font-bold text-reply-navy">0</p>
          <p className="mt-1 text-xs text-slate-400">
            Connect your Google Business Profile
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Reviews</h3>
          <p className="mt-2 text-3xl font-bold text-reply-navy">0</p>
          <p className="mt-1 text-xs text-slate-400">Pending replies</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">AI Credits</h3>
          <p className="mt-2 text-3xl font-bold text-reply-navy">—</p>
          <p className="mt-1 text-xs text-slate-400">Available this month</p>
        </div>
      </div>
    </div>
  );
}
