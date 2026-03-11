import React from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { cn } from "@/lib/utils";

type MarketingPageShellProps = {
    title: string;
    description?: string;
    children: React.ReactNode;
    containerClassName?: string;
    showBackToHome?: boolean;
};

export function MarketingPageShell({
    title,
    description,
    children,
    containerClassName,
    showBackToHome = false,
}: MarketingPageShellProps) {
    return (
        // 1. Added flex & flex-col to push the footer to the bottom naturally
        <div className="relative flex min-h-svh flex-col overflow-hidden bg-slate-50 text-reply-navy">

            {/* Decorative Background Effects */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {/* Fixed: Replaced invalid 'w-lg', 'h-120' classes with exact arbitrary values */}
                <div className="absolute -left-40 -top-48 h-[30rem] w-[30rem] rounded-full bg-reply-purple/10 blur-[100px]" />
                <div className="absolute -bottom-48 -right-40 h-[32rem] w-[32rem] rounded-full bg-reply-blue/10 blur-[100px]" />
            </div>

            {/* Header */}
            <SiteHeader showBackToHome={showBackToHome} />

            {/* 2. Added flex-1 to ensure main takes up available space */}
            <main className="relative z-10 flex flex-1 flex-col items-center px-4 pb-20 pt-16 md:px-6">

                {/* 3. Changed to <article> for better SEO/Screen Readers */}
                <article
                    className={cn(
                        "w-full max-w-3xl rounded-3xl border border-slate-200/60 bg-white p-8 shadow-sm ring-1 ring-slate-900/5 md:p-12",
                        containerClassName
                    )}
                >
                    {/* Header section of the document */}
                    <header className="mb-10 space-y-4 border-b border-slate-100 pb-8">
                        <h1 className="text-balance text-3xl font-bold tracking-tight text-reply-navy md:text-5xl">
                            {title}
                        </h1>

                        {/* 4. Simplified conditional rendering */}
                        {description && (
                            <p className="text-pretty text-lg leading-relaxed text-slate-500">
                                {description}
                            </p>
                        )}
                    </header>

                    {/* Document Content */}
                    <div className="text-slate-600 leading-relaxed space-y-6">
                        {children}
                    </div>
                </article>
            </main>

            {/* Footer */}
            <SiteFooter />
        </div>
    );
}