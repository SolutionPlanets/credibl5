import { SignupForm } from "@/components/signup-form";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Sparkles, Check } from "lucide-react";
import { Suspense } from "react";
import { Free_trail_days } from "@/lib/plan-config";

export default function Page() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-white text-reply-navy">
      {/* Background blurs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10rem] top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-reply-purple/5 blur-3xl" />
        <div className="absolute bottom-[-12rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-reply-blue/5 blur-3xl" />
      </div>

      <SiteHeader rightCtas={false} />

      <main className="relative px-4 py-10 md:px-6 md:py-14">
        <div className="mx-auto max-w-5xl">
          {/* Hero Section */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-reply-purple/20 bg-reply-purple/5 px-4 py-1.5 text-xs font-medium text-reply-purple mb-5">
              <Sparkles className="size-3.5" />
              AI-powered review management
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-reply-navy mb-3">
              Get started
            </h1>
            <p className="text-lg text-reply-muted max-w-xl mx-auto">
              Choose a plan and start replying to reviews with confidence.
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6 text-sm text-reply-muted">
              {[
                `Start free with a ${Free_trail_days}-day trial`,
                "Cancel anytime, no long-term contracts",
                "Built for multi-location teams",
              ].map((b) => (
                <span key={b} className="flex items-center gap-1.5">
                  <Check className="size-4 text-reply-green shrink-0" />
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Signup Form */}
          <Suspense
            fallback={
              <div className="text-center text-reply-navy">Loading...</div>
            }
          >
            <SignupForm />
          </Suspense>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
