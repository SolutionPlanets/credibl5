"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "../ui/dialog";

// 1. Define the links array OUTSIDE the component for better performance
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

    // 2. Handle the scroll state for the background blur effect
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // 3. The refactored UI
    return (
        <header
            className={cn(
                "sticky top-0 z-50 w-full transition-all duration-200",
                isScrolled
                    ? "bg-slate-50/90 shadow-sm backdrop-blur-md border-b border-slate-200/50"
                    : "bg-transparent border-b border-transparent"
            )}
        >
            <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-4 md:px-8">

                {/* Logo */}
                <Link href="/" className="flex items-center gap-2">
                    <span className="text-xl font-bold text-reply-navy">
                        Reply Pulse
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <nav
                    aria-label="Desktop Header"
                    className="hidden items-center gap-8 text-[15px] font-medium text-slate-700 md:flex"
                >
                    {NAV_LINKS.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="transition-colors hover:text-reply-purple"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex items-center gap-4">

                    {/* CTAs (Desktop) */}
                    {showBackToHome && (
                        <Button
                            asChild
                            variant="ghost"
                            className="hidden rounded-full font-medium text-slate-700 hover:bg-slate-200 hover:text-reply-purple md:inline-flex"
                        >
                            <Link href="/">Back to home</Link>
                        </Button>
                    )}

                    {rightCtas && (
                        <div className="hidden items-center gap-3 md:flex">
                            <Button
                                asChild
                                variant="ghost"
                                className="rounded-full font-medium text-slate-700 hover:bg-slate-200 hover:text-reply-purple"
                            >
                                <Link href="/auth/login">Login</Link>
                            </Button>
                            <Button
                                asChild
                                className="rounded-full bg-reply-purple px-6 font-semibold text-slate-50 shadow-md shadow-reply-purple/20 transition-all hover:bg-reply-purple/90 hover:shadow-lg hover:shadow-reply-purple/30"
                            >
                                <Link href="/auth/signup">Start Your Free Trial</Link>
                            </Button>
                        </div>
                    )}

                    {/* Mobile Menu Toggle */}
                    <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-slate-700 hover:bg-slate-200 md:hidden"
                                aria-label="Open menu"
                            >
                                <Menu className="size-6" />
                            </Button>
                        </DialogTrigger>

                        <DialogContent className="left-auto right-0 top-0 h-svh w-[85vw] max-w-[400px] translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-slate-50 p-6 shadow-2xl sm:max-w-[400px]">
                            <DialogTitle className="sr-only">Menu</DialogTitle>
                            <div className="flex h-full flex-col">

                                <div className="mb-8">
                                    <span className="text-xl font-bold text-reply-navy">
                                        Reply Pulse
                                    </span>
                                </div>

                                {/* Mobile Navigation */}
                                <nav
                                    aria-label="Mobile Header"
                                    className="flex flex-col gap-6 text-lg font-semibold text-slate-800"
                                >
                                    {NAV_LINKS.map((link) => (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className="transition-colors hover:text-reply-purple"
                                            onClick={() => setIsOpen(false)} // Closes menu when clicked
                                        >
                                            {link.label}
                                        </Link>
                                    ))}
                                </nav>

                                {/* Mobile CTAs */}
                                <div className="mt-auto flex flex-col gap-4 pt-8">
                                    {rightCtas ? (
                                        <>
                                            <Button
                                                asChild
                                                variant="outline"
                                                className="w-full rounded-full border-slate-300 bg-slate-50 py-6 text-base font-semibold text-slate-700 hover:bg-slate-100"
                                            >
                                                <Link
                                                    href="/auth/login"
                                                    onClick={() => setIsOpen(false)}
                                                >
                                                    Login
                                                </Link>
                                            </Button>
                                            <Button
                                                asChild
                                                className="w-full rounded-full bg-reply-purple py-6 text-base font-bold text-slate-50 shadow-md shadow-reply-purple/20"
                                            >
                                                <Link
                                                    href="/auth/signup"
                                                    onClick={() => setIsOpen(false)}
                                                >
                                                    Start Your Free Trial
                                                </Link>
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            asChild
                                            variant="outline"
                                            className="w-full rounded-full border-slate-300 bg-slate-50 py-6 text-base font-semibold text-slate-700 hover:bg-slate-100"
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