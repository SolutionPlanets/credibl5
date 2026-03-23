"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu, Search, Bell, HelpCircle, MapPin, CheckCircle2 } from "lucide-react";
import { DashboardSidebar } from "@/components/protected/dashboard-sidebar";
import { PendingReviewsProvider } from "@/lib/pending-reviews-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [isLocationsOpen, setIsLocationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase
        .from("user_profiles")
        .select("google_connected_at")
        .eq("id", user.id)
        .maybeSingle();

      const { data: locationsData } = await supabase
        .from("locations")
        .select("id,location_name,is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      setIsGoogleConnected(
        Boolean(profileData?.google_connected_at) || 
        user.user_metadata?.google_connected === true
      );
      setLocations(locationsData || []);
      setLoading(false);
    };

    checkUser();
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-slate-50">
        <div className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const displayName = user?.user_metadata?.full_name || user?.email || "User";

  const selectedLocationId = searchParams.get("locationId");
  const selectedLocationName = React.useMemo(() => {
    if (!selectedLocationId) return "All Locations";
    const loc = locations.find(l => l.id === selectedLocationId);
    return loc ? loc.location_name : "All Locations";
  }, [selectedLocationId, locations]);

  return (
    <PendingReviewsProvider>
    <div className="flex h-svh overflow-hidden bg-slate-50 text-reply-navy">
      <DashboardSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        displayName={displayName}
        isGoogleConnected={isGoogleConnected}
      />

      {/* Content Area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between z-30">
          <div className="flex items-center flex-1">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="lg:hidden p-2 -ml-2 mr-2 text-slate-500 hover:text-indigo-600 transition-colors rounded-lg"
            >
              <Menu className="h-5 w-5" />
            </button>
            
            <div className="relative max-w-2xl w-full hidden sm:flex items-center gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <Input 
                  type="search" 
                  placeholder="Search reviews, locations..." 
                  className="pl-10 h-10 bg-slate-100/50 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all rounded-xl"
                />
              </div>

              {/* Locations Dropdown */}
              <div className="relative">
                <Button 
                  variant="outline" 
                  onClick={() => setIsLocationsOpen(!isLocationsOpen)}
                  onBlur={() => setTimeout(() => setIsLocationsOpen(false), 200)}
                  className="h-10 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl px-4"
                >
                  <MapPin className="mr-2 h-4 w-4 text-slate-500 shrink-0" />
                  <span className="truncate max-w-[150px]">{selectedLocationName}</span>
                </Button>
                {isLocationsOpen && (
                  <div className="absolute top-12 right-0 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Connected Locations</p>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto py-1">
                      {locations.length === 0 ? (
                        <p className="p-4 text-sm text-slate-500 text-center">No locations connected</p>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setIsLocationsOpen(false);
                              router.push("/protected");
                            }}
                            className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100"
                          >
                            <span className="text-sm font-semibold text-slate-800">All Locations</span>
                            {!selectedLocationId && (
                              <div className="flex items-center justify-center shrink-0 h-6 px-2 bg-slate-100 rounded-md">
                                <CheckCircle2 className="h-3.5 w-3.5 text-slate-600 mr-1" />
                                <span className="text-[10px] uppercase font-bold text-slate-700">Selected</span>
                              </div>
                            )}
                          </button>
                          {locations.map((loc) => (
                            <button 
                              key={loc.id} 
                              onClick={() => {
                                setIsLocationsOpen(false);
                                router.push(`/protected?locationId=${loc.id}`);
                              }}
                              className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                            >
                              <span className={`text-sm font-semibold truncate mr-3 ${selectedLocationId === loc.id ? 'text-indigo-700' : 'text-slate-800'}`} title={loc.location_name}>
                              {loc.location_name}
                            </span>
                            <div className="flex items-center gap-2">
                              {loc.is_active && (
                                <div className="flex items-center justify-center shrink-0 h-6 px-2 bg-emerald-100 rounded-md">
                                  <span className="text-[10px] uppercase font-bold text-emerald-700">Active</span>
                                </div>
                              )}
                              {selectedLocationId === loc.id && (
                                <div className="flex items-center justify-center shrink-0 h-6 px-2 bg-indigo-100 rounded-md">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 mr-1" />
                                  <span className="text-[10px] uppercase font-bold text-indigo-700">Selected</span>
                                </div>
                              )}
                            </div>  
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="hidden md:flex items-center px-3 py-1.5 bg-indigo-50 rounded-full border border-indigo-100/50">
              <span className="text-xs font-bold text-indigo-700">142</span>
              <span className="ml-1.5 text-[11px] font-medium text-indigo-600/80">AI Credits</span>
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-2.5 right-2.5 size-2 bg-red-500 rounded-full border-2 border-white" />
              </Button>
              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                <HelpCircle className="h-5 w-5" />
              </Button>
            </div>

            <div className="h-10 w-px bg-slate-200 mx-1 hidden sm:block" />

            <div className="flex items-center gap-3 pl-1">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-bold text-slate-900 leading-none">{displayName.split(' ')[0]}</p>
                <p className="text-[10px] font-medium text-slate-500 mt-1 uppercase tracking-wider">Administrator</p>
              </div>
              <div className="size-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-600/20 ring-2 ring-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Main Section */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-slate-50/50 pb-12">
          {/* Subtle page background decoration */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-100/30 blur-[120px] rounded-full" />
            <div className="absolute bottom-[10%] right-[5%] w-[30%] h-[30%] bg-sky-100/20 blur-[100px] rounded-full" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl p-4 sm:p-6 lg:p-10">
            {children}
          </div>
        </main>
      </div>
    </div>
    </PendingReviewsProvider>
  );
}
