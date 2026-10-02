import Link from "next/link";
import { getBrand } from "@/lib/public/brand";

export async function PublicShell({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">{brand.name}</Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/audit" className="hover:text-foreground">Free site check</Link>
            <Link href="/results" className="hover:text-foreground">Results</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
            <Link href="/audit" className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90">Check my site</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {brand.name}{brand.address ? ` · ${brand.address}` : ""}</span>
          <span className="flex gap-4">
            <Link href="/audit" className="hover:text-foreground">Free site check</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
