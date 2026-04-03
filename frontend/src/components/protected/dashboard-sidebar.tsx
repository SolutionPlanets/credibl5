"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  MessageSquare,
  BarChart3,
  Zap,
  Settings,
  LogOut,
  X,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { usePendingReviews } from "@/lib/pending-reviews-context";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/protected", icon: LayoutDashboard },
  { name: "Review Inbox", href: "/protected/inbox", icon: Inbox },
  { name: "Templates", href: "/protected/templates", icon: MessageSquare },
  { name: "Reports", href: "/protected/reports", icon: BarChart3 },
  { name: "Automation", href: "/protected/automation", icon: Zap },
];

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  isGoogleConnected: boolean;
  onReconnectGoogle?: () => void;
  isReconnecting?: boolean;
}

interface SidebarNavLinkProps {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  onNavigate: () => void;
  trailing?: React.ReactNode;
}

function SidebarNavLink({ href, label, icon: Icon, isActive, onNavigate, trailing }: SidebarNavLinkProps) {
  const baseClass =
    "group relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-all duration-200";
  const inactiveClass =
    "border-transparent bg-white/40 text-slate-600 hover:border-slate-200 hover:bg-white/85 hover:text-slate-900";
  const activeClass =
    "border-slate-900/10 bg-[linear-gradient(120deg,rgba(15,23,42,0.98),rgba(30,41,59,0.95))] text-white shadow-[0_20px_30px_-24px_rgba(15,23,42,0.6)]";

  return (
    <Link href={href} className={cn(baseClass, isActive ? activeClass : inactiveClass)} onClick={onNavigate}>
      {isActive && (
        <div className="absolute inset-y-[18%] left-1 w-1 rounded-full bg-reply-purple shadow-[0_0_14px_rgba(151,71,255,0.65)]" />
      )}
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-xl border transition-all",
          isActive
            ? "border-white/20 bg-white/12 text-white"
            : "border-slate-200 bg-white/85 text-slate-500 group-hover:border-slate-300 group-hover:text-slate-900"
        )}
      >
        <Icon className="h-[1.05rem] w-[1.05rem]" />
      </span>
      <span className="font-medium tracking-[0.01em]">{label}</span>
      {trailing}
    </Link>
  );
}

export function DashboardSidebar({
  isOpen,
  onClose,
  displayName,
  isGoogleConnected,
  onReconnectGoogle,
  isReconnecting,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const isSettingsActive = pathname === "/protected/settings";
  const { pendingCount } = usePendingReviews();
  const accountInitial = displayName.charAt(0).toUpperCase();

  const sidebarTheme = {
    "--sidebar-bg-start": "248 250 252",
    "--sidebar-bg-mid": "241 245 249",
    "--sidebar-bg-end": "255 255 255",
    "--sidebar-accent": "88 125 254",
    "--sidebar-accent-soft": "151 71 255",
  } as React.CSSProperties;

  const sectionLabelClass = "px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500/90";

  const handleMobileNavigate = () => {
    if (window.innerWidth < 1024) onClose();
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside
        style={sidebarTheme}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[18rem] flex-col overflow-hidden border-r border-slate-200/85 bg-[linear-gradient(180deg,rgb(var(--sidebar-bg-start))_0%,rgb(var(--sidebar-bg-mid))_48%,rgb(var(--sidebar-bg-end))_100%)] text-slate-900 transition-transform duration-300 ease-in-out lg:relative lg:w-[17.25rem] lg:translate-x-0 xl:w-[18.25rem]",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_85%_at_0%_0%,rgba(var(--sidebar-accent),0.14)_0%,transparent_55%),radial-gradient(105%_80%_at_100%_100%,rgba(var(--sidebar-accent-soft),0.1)_0%,transparent_60%)]" />
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-reply-blue/10 blur-[88px]" />
        <div className="pointer-events-none absolute -right-24 bottom-8 h-72 w-72 rounded-full bg-reply-purple/10 blur-[92px]" />
        <div className="pointer-events-none absolute inset-x-0 top-[4.25rem] h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />

        <div className="relative z-10 flex h-[4.25rem] items-center justify-between border-b border-slate-200/80 px-4 lg:h-[4rem]">
          <Link href="/protected" className="flex items-center gap-2">
            <img src="/new_logo.png" alt="Credibl5" className="h-10 w-auto object-contain" />
          </Link>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white/75 p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 flex-1 space-y-7 overflow-y-auto px-3 py-4 lg:space-y-6 lg:px-3 lg:py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-2">
            <p className={sectionLabelClass}>Your Account</p>
            <div className="rounded-[1.6rem] border border-slate-200/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))] p-2.5 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.28)] backdrop-blur">
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="relative flex size-11 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-[linear-gradient(145deg,rgba(88,125,254,0.14),rgba(151,71,255,0.12))] font-semibold text-reply-navy">
                    <div className="absolute inset-1 rounded-lg border border-white/85" />
                    <span className="relative">{accountInitial}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.94rem] font-semibold text-slate-900">{displayName}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,1)]",
                          isGoogleConnected ? "bg-emerald-400" : "bg-amber-400"
                        )}
                      />
                      <p className="truncate text-xs text-slate-600">
                        {isGoogleConnected ? "Google Connected" : "Google Connection Needed"}
                      </p>
                    </div>
                  </div>
                </div>

                {!isGoogleConnected && onReconnectGoogle && (
                  <button
                    onClick={onReconnectGoogle}
                    disabled={isReconnecting}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition-all hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={cn("h-3 w-3", isReconnecting && "animate-spin")} />
                    {isReconnecting ? "Checking..." : "Refresh Status"}
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/85 px-2.5 py-1.5 text-[11px] text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Workspace status is healthy
              </div>
            </div>
          </div>

          <nav className="space-y-1.5">
            <p className={sectionLabelClass}>Main Menu</p>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <SidebarNavLink
                  key={item.name}
                  href={item.href}
                  label={item.name}
                  icon={item.icon}
                  isActive={isActive}
                  onNavigate={handleMobileNavigate}
                  trailing={
                    item.name === "Review Inbox" && pendingCount > 0 ? (
                      <span className="ml-auto rounded-full border border-reply-purple/25 bg-reply-purple px-2 py-0.5 text-[10px] font-bold text-white shadow-[0_10px_18px_-12px_rgba(151,71,255,0.8)]">
                        {pendingCount}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </nav>

          {/* Settings - commented out for now
          <nav className="space-y-1.5">
            <p className={sectionLabelClass}>Support</p>
            <SidebarNavLink
              href="/protected/settings"
              label="Settings"
              icon={Settings}
              isActive={isSettingsActive}
              onNavigate={handleMobileNavigate}
            />
          </nav>
          */}
        </div>

        {/* Sign Out - commented out for now
        <div className="relative z-10 border-t border-slate-200/80 bg-white/40 p-3">
          <form action="/routes/signout_routes" method="POST">
            <button
              type="submit"
              className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2.5 text-sm text-slate-600 transition-all duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <span className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white transition-colors group-hover:border-red-200 group-hover:bg-red-50">
                <LogOut className="h-4 w-4 text-slate-500 transition-colors group-hover:text-red-500" />
              </span>
              <span className="font-medium">Sign Out</span>
            </button>
          </form>
        </div>
        */}
      </aside>
    </>
  );
}
