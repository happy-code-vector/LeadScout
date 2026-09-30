import { prisma } from "@/lib/db";
import { hashPassword, passwordSchema } from "@/lib/auth/passwords";

/**
 * Idempotent root bootstrap, run on every boot (start-all):
 *  - no ROOT user + valid ROOT_EMAIL/ROOT_PASSWORD in env → create it (ACTIVE).
 *  - a user already exists at that email (e.g. a leftover magic-link-era row)
 *    → promote it to ROOT/ACTIVE and set the password hash.
 *  - a ROOT user already exists → do nothing. The DB password always wins;
 *    ROOT_PASSWORD in .env is read only at creation and ignored afterwards.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function deriveRootCredentials(
  env: NodeJS.ProcessEnv,
): { email: string; password: string } | "missing" | "invalid" {
  const email = (env.ROOT_EMAIL ?? "").trim().toLowerCase();
  const password = env.ROOT_PASSWORD ?? "";
  if (!email || !password) return "missing";
  if (!EMAIL_RE.test(email) || !passwordSchema.safeParse(password).success) return "invalid";
  return { email, password };
}

async function main() {
  const existingRoot = await prisma.user.findFirst({ where: { role: "ROOT" }, select: { id: true } });
  if (existingRoot) {
    console.log("[ensure-root] root exists — ROOT_PASSWORD in .env ignored (DB password wins)");
    return;
  }

  const creds = deriveRootCredentials(process.env);
  if (creds === "missing") {
    console.warn(
      "[ensure-root] no ROOT user and ROOT_EMAIL/ROOT_PASSWORD are unset — nobody can sign in or approve signups. Set them in .env and restart.",
    );
    return;
  }
  if (creds === "invalid") {
    console.warn(
      "[ensure-root] ROOT_EMAIL/ROOT_PASSWORD invalid (email malformed or password under 8 chars) — fix .env and restart.",
    );
    return;
  }

  const byEmail = await prisma.user.findUnique({ where: { email: creds.email }, select: { id: true } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { passwordHash: hashPassword(creds.password), role: "ROOT", status: "ACTIVE" },
    });
    console.log(`[ensure-root] promoted existing user ${creds.email} to root`);
    return;
  }

  await prisma.user.create({
    data: {
      email: creds.email,
      passwordHash: hashPassword(creds.password),
      role: "ROOT",
      status: "ACTIVE",
    },
  });
  console.log(`[ensure-root] created root ${creds.email}`);
}

// Run only when executed directly (`tsx src/db/ensure-root.ts`) — the test
// suite imports deriveRootCredentials from this module and must not boot DB.
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("ensure-root");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
