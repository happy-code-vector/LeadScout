import "dotenv/config";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";

/**
 * Dev SMTP sink (replaces a Mailpit container — no Docker needed).
 * `npm run maildump` listens on localhost:1025, stores every message in
 * data/maildump.jsonl, and serves a tiny JSON API + inbox on :8025.
 * Phase 6's reply simulation reads the same file.
 */

const SMTP_PORT = Number(process.env.MAILDUMP_SMTP_PORT ?? 1025);
const HTTP_PORT = Number(process.env.MAILDUMP_HTTP_PORT ?? 8025);
const STORE = path.join(process.cwd(), "data", "maildump.jsonl");

async function main() {
  await mkdir(path.dirname(STORE), { recursive: true });

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    // Accept any credentials — clients that insist on AUTH still deliver.
    onAuth(auth, session, callback) {
      void auth;
      void session;
      callback(null, { user: "sink" });
    },
    onRcptTo(address, session, callback) {
      // Accept everything — it's a sink.
      void session;
      void address;
      callback();
    },
    async onData(stream, _session, callback) {
      try {
        const parsed = await simpleParser(stream);
        const toText = Array.isArray(parsed.to)
          ? parsed.to.map((a) => a.text).join(", ")
          : (parsed.to?.text ?? "");
        const record = {
          ts: new Date().toISOString(),
          from: parsed.from?.text ?? "",
          to: toText,
          subject: parsed.subject ?? "",
          messageId: parsed.messageId ?? "",
          inReplyTo: typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : "",
          headers: Object.fromEntries(
            [...parsed.headers].map(([k, v]) => [
              k,
              Array.isArray(v)
                ? v.join(" ")
                : v && typeof v === "object"
                  ? JSON.stringify(v)
                  : String(v ?? ""),
            ]),
          ),
          text: parsed.text ?? "",
        };
        await appendFile(STORE, JSON.stringify(record) + "\n", "utf8");
        console.log(`[maildump] ${record.ts} ${record.from} -> ${record.to} :: ${record.subject}`);
      } catch (err) {
        console.error("[maildump] parse error", err);
      } finally {
        callback();
      }
    },
  });

  server.listen(SMTP_PORT, () => {
    console.log(`[maildump] SMTP sink on http://localhost:${SMTP_PORT} (no auth)`);
  });

  // Tiny HTTP API for the inbox page and reply simulation.
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    if (req.method === "DELETE" && url.pathname === "/messages") {
      await writeFile(STORE, "", "utf8");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    let messages: unknown[] = [];
    try {
      const raw = await readFile(STORE, "utf8");
      messages = raw
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
        .reverse();
    } catch {
      messages = [];
    }
    res.end(JSON.stringify({ messages }));
  });
  httpServer.listen(HTTP_PORT, () => {
    console.log(`[maildump] inbox JSON on http://localhost:${HTTP_PORT}/messages`);
    console.log(`[maildump] app inbox page: http://localhost:3000/dev/inbox`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
