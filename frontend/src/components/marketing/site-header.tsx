"use client";

import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Contact", href: "/contact" },
];

type SiteHeaderProps = {
  rightCtas?: boolean;
  showBackToHome?: boolean;
};

export function SiteHeader({
  rightCtas = true,
  showBackToHome,
}: SiteHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-all duration-300",
        isScrolled
          ? "border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link href="/" className="group inline-flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20 transition-transform group-hover:scale-105">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Reply Pulse
          </span>
        </Link>

        <nav
          aria-label="Desktop Header"
          className="hidden items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-2 py-1 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {showBackToHome && (
            <Button
              asChild
              variant="ghost"
              className="hidden rounded-full px-5 font-semibold text-slate-700 hover:bg-slate-100 md:inline-flex"
            >
              <Link href="/">Back to home</Link>
            </Button>
          )}

          {rightCtas && (
            <div className="hidden items-center gap-2 md:flex">
              <Button
                asChild
                variant="ghost"
                className="rounded-full px-5 font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-slate-950 px-5 font-semibold text-white shadow-md shadow-slate-900/20 hover:bg-slate-800"
              >
                <Link href="/auth/signup">Start free</Link>
              </Button>
            </div>
          )}

          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full border border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </DialogTrigger>

            <DialogContent className="left-auto right-0 top-0 h-svh w-[85vw] max-w-[380px] translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-white p-6 shadow-2xl">
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <div className="flex h-full flex-col">
                <div className="mb-8 inline-flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <span className="text-lg font-bold text-slate-900">Reply Pulse</span>
                </div>

                <nav aria-label="Mobile Header" className="flex flex-col gap-2">
                  {NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="rounded-2xl px-4 py-3 text-base font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                      onClick={() => setIsOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>

                <div className="mt-auto flex flex-col gap-3 pt-8">
                  {rightCtas ? (
                    <>
                      <Button
                        asChild
                        variant="outline"
                        className="w-full rounded-full border-slate-300 bg-white py-6 text-base font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Link href="/auth/login" onClick={() => setIsOpen(false)}>
                          Sign in
                        </Link>
                      </Button>
                      <Button
                        asChild
                        className="w-full rounded-full bg-slate-950 py-6 text-base font-bold text-white hover:bg-slate-800"
                      >
                        <Link href="/auth/signup" onClick={() => setIsOpen(false)}>
                          Start free
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full rounded-full border-slate-300 bg-white py-6 text-base font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Link href="/" onClick={() => setIsOpen(false)}>
                        Back to home
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
