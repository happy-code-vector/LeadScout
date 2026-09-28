import { NextResponse } from "next/server";
import { z } from "zod";
import { processIncoming } from "@/lib/outreach/replies";

/**
 * Dev-only reply/bounce simulation from the sink inbox (spec phase 6):
 * constructs the same IncomingMessage the IMAP poller would parse and feeds
 * it to the shared handler.
 */

const schema = z.object({
  messageId: z.string().min(1),
  mode: z.enum(["reply", "bounce"]).default("reply"),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Look the message up in the sink so the simulated reply references the
  // exact Message-ID the campaign sent.
  const sinkBase = process.env.MAILDUMP_HTTP_URL ?? "http://localhost:8025";
  const res = await fetch(`${sinkBase}/messages`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json({ error: "cannot reach the sink — is maildump running?" }, { status: 502 });
  }
  const json = (await res.json()) as {
    messages: { messageId: string; from: string; to: string; subject: string; text: string }[];
  };
  const original = json.messages.find((m) => m.messageId === parsed.data.messageId);
  if (!original) {
    return NextResponse.json({ error: "message not found in sink" }, { status: 404 });
  }

  const incoming =
    parsed.data.mode === "bounce"
      ? {
          // A DSN answering the sent message, naming the failing recipient.
          messageId: `<dsn-${Date.now()}@dev>`,
          inReplyTo: original.messageId,
          from: "MAILER-DAEMON@dev.test",
          subject: "Undelivered Mail Returned to Sender",
          text: `The following address failed:\n\nFinal-Recipient: rfc822; ${extractTo(original.to)}`,
          isDeliveryStatus: true,
        }
      : {
          // A human reply: In-Reply-To the sent Message-ID.
          messageId: `<reply-${Date.now()}@dev>`,
          inReplyTo: original.messageId,
          from: original.to,
          subject: `Re: ${original.subject}`,
          text: "Hi — yes, I'd be interested. When can we talk?",
        };

  const outcome = await processIncoming(incoming);
  return NextResponse.json({ outcome });
}

function extractTo(to: string): string {
  const m = to.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : "unknown@dev.test";
}
