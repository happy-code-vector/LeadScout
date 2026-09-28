/**
 * Production entrypoint for single-service deployments: applies migrations,
 * seeds reference data, then runs the Next.js server and the worker together.
 * SQLite lives on a persistent volume (DATABASE_URL points there), so both
 * processes must share one service — separate services would each get their
 * own disk and their own database.
 *
 * Render/Blueprint example: see render.yaml.
 */
import { spawn } from "node:child_process";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  await run("npx", ["prisma", "migrate", "deploy"]);
  await run("npm", ["run", "db:seed"]);

  const children = [
    spawn("npm", ["run", "start"], { stdio: "inherit", shell: true }),
    spawn("npm", ["run", "worker:start"], { stdio: "inherit", shell: true }),
  ];

  const shutdown = () => {
    for (const c of children) c.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // If either process dies, take the other with it (the platform restarts us).
  for (const c of children) {
    c.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[start-all] child exited with ${code}; stopping`);
        shutdown();
      }
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
