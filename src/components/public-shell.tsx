import Link from "next/link";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">AppHub</Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/audit" className="hover:text-foreground">Free site check</Link>
            <Link href="/results" className="hover:text-foreground">Results</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground">AppHub LLC</div>
      </footer>
    </div>
  );
}
