import { SignupForm } from "./signup-form";

export const metadata = { title: "Request access" };

export default function SignupPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Request access</h1>
          <p className="text-sm text-muted-foreground">
            Accounts are reviewed by an administrator before sign-in is enabled.
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <a className="underline underline-offset-4" href="/signin">Sign in</a>
        </p>
      </div>
    </div>
  );
}
