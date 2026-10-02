import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <AppShell user={session?.user ? { email: session.user.email ?? "", role: session.user.role } : null}>
      {children}
    </AppShell>
  );
}
