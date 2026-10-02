import { CONTENT } from "@/content/public-site";
import { AuditForm } from "./audit-form";

export const metadata = { title: "Free site check" };

export default function AuditPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What is your website telling customers?</h1>
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
        Enter your address. In about fifteen seconds you&apos;ll see what your site does well and what it&apos;s quietly getting wrong. No email required.
      </p>
      <div className="mt-8"><AuditForm /></div>
      <p className="mt-4 text-xs text-muted-foreground">One check at a time; we fetch only your homepage and sitemap.</p>
      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {CONTENT.steps.map((s) => (
          <div key={s.title} className="rounded-lg border p-4">
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
