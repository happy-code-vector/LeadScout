// src/app/signin/page.tsx
import { SigninForm } from "./signin-form";

export const metadata = { title: "Sign in" };

export default function SigninPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to LeadScout</h1>
          <p className="text-sm text-muted-foreground">Enter your account credentials below.</p>
        </div>
        <SigninForm />
        <p className="text-center text-sm text-muted-foreground">
          No account? <a className="underline underline-offset-4" href="/signup">Request access</a>
        </p>
      </div>
    </div>
  );
}
