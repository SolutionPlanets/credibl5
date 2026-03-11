import React from "react";
import { Check, Sparkles } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { cn } from "@/lib/utils";

type AuthPageShellProps = {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    benefits?: string[];
    className?: string;
};

export function AuthPageShell({
    title,
    subtitle,
    children,
    benefits,
    className,
}: AuthPageShellProps) {
    return (
        // 1. Matched bg-slate-50 and added flex-col for sticky footer
        <div className="relative flex min-h-svh flex-col overflow-hidden bg-slate-50 text-reply-navy">

            {/* Decorative Background Effects - Aligned with the marketing shell */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-40 -top-48 h-[30rem] w-[30rem] rounded-full bg-reply-purple/10 blur-[100px]" />
                <div className="absolute -bottom-48 -right-40 h-[32rem] w-[32rem] rounded-full bg-reply-blue/10 blur-[100px]" />
            </div>

            <SiteHeader rightCtas={false} />

            {/* 2. Added flex-1 and items-center to perfectly center the grid vertically */}
            <main className={cn("relative z-10 flex flex-1 items-center px-4 py-12 md:px-6", className)}>
                <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">

                    {/* Left side - Benefits (desktop only) */}
                    <div className="hidden lg:block">
                        {/* 3. Updated border and shadow to match the premium marketing card look */}
                        <div className="rounded-3xl border border-slate-200/60 bg-white p-10 shadow-sm ring-1 ring-slate-900/5">

                            <div className="inline-flex items-center gap-2 rounded-full border border-reply-purple/20 bg-reply-purple/5 px-3 py-1.5 text-xs font-semibold text-reply-purple">
                                <Sparkles className="size-3.5" />
                                AI-powered review management
                            </div>

                            <h1 className="mt-8 text-balance text-4xl font-extrabold tracking-tight text-reply-navy">
                                {title}
                            </h1>
                            <p className="mt-4 text-lg leading-relaxed text-slate-500">
                                {subtitle}
                            </p>

                            {/* 4. Cleaner conditional, plus a custom background circle for the checkmarks */}
                            {benefits && benefits.length > 0 && (
                                <ul className="mt-10 space-y-5 text-[15px] font-medium text-slate-700">
                                    {benefits.map((b) => (
                                        <li key={b} className="flex items-start gap-3">
                                            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                                                <Check className="size-3.5 text-green-600" />
                                            </div>
                                            <span className="leading-snug">{b}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* Right side - Form */}
                    <div className="flex w-full justify-center lg:justify-end">
                        {children}
                    </div>
                </div>
            </main>

            <SiteFooter />
        </div>
    );
}