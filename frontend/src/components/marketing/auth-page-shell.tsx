import React from "react";
import { CheckCircle2 } from "lucide-react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { cn } from "@/lib/shared/utils";

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
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12rem] top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute right-[-10rem] top-[20%] h-[24rem] w-[24rem] rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-[40%] h-[24rem] w-[24rem] rounded-full bg-pink-200/25 blur-3xl" />
      </div>

      <SiteHeader rightCtas={false} showBackToHome />

      <main className={cn("relative z-10 flex flex-1 items-center px-4 py-12 md:px-6", className)}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="hidden lg:block">
            <div className="rounded-[2rem] border border-slate-200/70 bg-white/85 p-10 shadow-xl shadow-slate-900/5 backdrop-blur">
              <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">
                Secure Access
              </p>

              <h1 className="mt-6 text-5xl font-extrabold leading-tight tracking-tight text-slate-900">
                {title}
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
                {subtitle}
              </p>

              {benefits && benefits.length > 0 && (
                <ul className="mt-9 space-y-4">
                  {benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-[15px] font-medium text-slate-700">{benefit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="flex w-full justify-center lg:justify-end">{children}</section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
