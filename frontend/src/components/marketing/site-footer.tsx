import Link from "next/link";
// Assuming you have lucide-react installed based on your navbar code
import { Twitter, Linkedin, Github } from "lucide-react";

// 1. Centralize your links data for easy maintenance
const FOOTER_LINKS = [
    {
        title: "Product",
        links: [
            { label: "Features", href: "/#features" },
            { label: "Pricing", href: "/#pricing" },
            { label: "Start Free Trial", href: "/auth/signup" },
        ],
    },
    {
        title: "Company",
        links: [
            { label: "About Us", href: "/about" },
            { label: "Contact Sales", href: "/contact" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Terms of Service", href: "/terms" },
        ],
    },
];

const SOCIAL_LINKS = [
    { icon: Twitter, href: "#", label: "Twitter" },
    { icon: Linkedin, href: "#", label: "LinkedIn" },
    { icon: Github, href: "#", label: "GitHub" },
];

export function SiteFooter() {
    return (
        <footer className="relative border-t border-slate-200 bg-slate-50 pt-20 pb-10">
            {/* Optional: A subtle brand-colored accent line at the very top */}
            <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-reply-navy to-reply-purple opacity-20" />

            <div className="mx-auto max-w-[1280px] px-6 md:px-8">
                <div className="grid gap-12 lg:grid-cols-5 lg:gap-8 xl:gap-12">

                    {/* Brand & Description Column */}
                    <div className="lg:col-span-2">
                        <Link href="/" className="inline-block transition-transform hover:scale-[1.02]">
                            <span className="text-2xl font-bold text-reply-navy tracking-tight">
                                Reply Pulse
                            </span>
                        </Link>
                        <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-slate-600">
                            AI-powered review management for modern businesses. Reply faster,
                            stay on brand, and keep customer communication consistent across
                            every location.
                        </p>

                        {/* Added: Social Media Icons */}
                        <div className="mt-8 flex items-center gap-4">
                            {SOCIAL_LINKS.map((social) => {
                                const Icon = social.icon;
                                return (
                                    <Link
                                        key={social.label}
                                        href={social.href}
                                        aria-label={social.label}
                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200/50 text-slate-500 transition-all hover:bg-reply-purple hover:text-white"
                                    >
                                        <Icon className="h-5 w-5" />
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Links Columns - Dynamically Generated */}
                    <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3">
                        {FOOTER_LINKS.map((column) => (
                            <div key={column.title}>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                                    {column.title}
                                </h3>
                                <ul className="mt-6 space-y-4">
                                    {column.links.map((link) => (
                                        <li key={link.label}>
                                            <Link
                                                href={link.href}
                                                className="text-[15px] font-medium text-slate-500 transition-colors hover:text-reply-purple"
                                            >
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="mt-16 flex flex-col items-center justify-between border-t border-slate-200/60 pt-8 sm:flex-row">
                    <p className="text-sm font-medium text-slate-500">
                        &copy; {new Date().getFullYear()} Reply Pulse. All rights reserved.
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500 sm:mt-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        All systems operational
                    </div>
                </div>
            </div>
        </footer>
    );
}