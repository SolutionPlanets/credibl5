import Link from "next/link";
import { ArrowUpRight, Linkedin, Twitter, Github } from "lucide-react";

const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Start Free", href: "/auth/signup" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Sign In", href: "/auth/login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
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
    <footer className="relative mt-auto overflow-hidden border-t border-slate-200/70 bg-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="absolute -right-24 top-0 h-56 w-56 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-6 pb-8 pt-16 md:px-8">
        <div className="grid gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                Credibl5
              </span>
            </Link>

            <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-600">
              AI-powered review operations for location-based businesses. Faster response cycles,
              cleaner workflows, and consistent brand voice across every profile.
            </p>

            <div className="mt-7 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => {
                const Icon = social.icon;
                return (
                  <Link
                    key={social.label}
                    href={social.href}
                    aria-label={social.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-900"
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3">
            {FOOTER_LINKS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {column.title}
                </h3>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950"
                      >
                        {link.label}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-slate-200/70 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} Credibl5. All rights reserved.</p>
          <p className="inline-flex items-center gap-2 font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Systems operational
          </p>
        </div>
      </div>
    </footer>
  );
}
