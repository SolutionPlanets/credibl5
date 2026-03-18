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
} from "lucide-react";
import { cn } from "@/lib/shared/utils";

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
}

export function DashboardSidebar({ isOpen, onClose, displayName, isGoogleConnected }: DashboardSidebarProps) {
  const pathname = usePathname();
  const isSettingsActive = pathname === "/protected/settings";

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden" 
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[17.25rem] flex-col overflow-hidden border-r border-cyan-900/30 bg-[linear-gradient(180deg,#020617_0%,#041124_52%,#071a2f_100%)] text-slate-200 transition-transform duration-300 ease-in-out lg:relative lg:w-[16.75rem] lg:translate-x-0 xl:w-[17.75rem]",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-[80px]" />
        <div className="pointer-events-none absolute -right-20 bottom-12 h-64 w-64 rounded-full bg-blue-500/10 blur-[90px]" />

        <div className="relative z-10 flex h-[4.5rem] items-center justify-between border-b border-white/10 px-5 lg:h-16">
          <Link href="/protected" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-[0_12px_30px_-16px_rgba(34,211,238,0.9)]">
              <span className="text-lg font-bold leading-none text-slate-950">C</span>
            </div>
            <div>
              <span className="block text-[1.7rem] font-semibold tracking-tight text-white lg:text-xl">Credibl5</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Review Ops</span>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 flex-1 space-y-6 overflow-y-auto px-3 py-4 lg:space-y-5 lg:px-3 lg:py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1.5">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Your Account</p>
            <div className="rounded-3xl border border-cyan-900/45 bg-white/[0.03] p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-950/40 p-2.5">
                <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 font-bold text-cyan-200">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className={cn("size-2 rounded-full", isGoogleConnected ? "bg-emerald-400" : "bg-amber-400")} />
                    <p className="truncate text-xs text-slate-300/85">
                      {isGoogleConnected ? "Google Connected" : "Google Not Connected"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-cyan-500/5 px-2.5 py-1.5 text-[11px] text-cyan-100/80">
                <ShieldCheck className="h-3.5 w-3.5" />
                Workspace status is healthy
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Main Menu</p>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center rounded-2xl border px-3 py-2 text-sm transition-all duration-200",
                    isActive
                      ? "border-cyan-400/35 bg-cyan-400/14 text-cyan-50 shadow-[0_14px_30px_-22px_rgba(34,211,238,0.9)]"
                      : "border-transparent text-slate-300/85 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                  )}
                  onClick={() => {
                    if (window.innerWidth < 1024) onClose();
                  }}
                >
                  <span
                    className={cn(
                      "mr-3 inline-block h-7 w-1.5 rounded-full transition-all",
                      isActive ? "bg-cyan-300" : "bg-transparent group-hover:bg-cyan-300/50"
                    )}
                  />
                  <item.icon
                    className={cn(
                      "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                      isActive ? "text-cyan-200" : "text-slate-400 group-hover:text-slate-100"
                    )}
                  />
                  <span className="font-medium">{item.name}</span>
                  {item.name === "Review Inbox" && (
                    <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                      12
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <nav className="space-y-1">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400/80">Support</p>
            <Link
              href="/protected/settings"
              className={cn(
                "group flex items-center rounded-2xl border px-3 py-2 text-sm transition-all duration-200",
                isSettingsActive
                  ? "border-cyan-400/35 bg-cyan-400/14 text-cyan-50 shadow-[0_14px_30px_-22px_rgba(34,211,238,0.9)]"
                  : "border-transparent text-slate-300/85 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
              )}
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
            >
              <span
                className={cn(
                  "mr-3 inline-block h-7 w-1.5 rounded-full transition-all",
                  isSettingsActive ? "bg-cyan-300" : "bg-transparent group-hover:bg-cyan-300/40"
                )}
              />
              <Settings
                className={cn(
                  "mr-3 h-5 w-5 transition-colors",
                  isSettingsActive ? "text-cyan-200" : "text-slate-400 group-hover:text-slate-100"
                )}
              />
              <span className="font-medium">Settings</span>
            </Link>
          </nav>
        </div>

        <div className="relative z-10 border-t border-white/10 p-3">
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm text-slate-300 transition-all duration-200 hover:border-red-300/30 hover:bg-red-500/10 hover:text-red-200"
            >
              <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-slate-950/60 transition-colors group-hover:border-red-300/30 group-hover:bg-red-500/15">
                <LogOut className="h-4 w-4 text-slate-400 transition-colors group-hover:text-red-300" />
              </span>
              <span className="font-medium">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
