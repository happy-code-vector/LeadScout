"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Phone,
  Radar,
  Settings,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

type ShellUser = { email: string; role?: string };

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Radar },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/call-queue", label: "Call Queue", icon: Phone },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  user = null,
}: {
  children: React.ReactNode;
  user?: ShellUser | null;
}) {
  const pathname = usePathname();
  const nav = user?.role === "ROOT"
    ? [
        ...NAV,
        { href: "/admin/users", label: "Access", icon: ShieldCheck },
      ]
    : NAV;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            L
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">LeadScout</div>
            <div className="text-xs text-muted-foreground">
              local web lead gen
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        {user ? (
          <div className="border-t px-4 py-3">
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        ) : null}
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
          NYC &rarr; any US city
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
