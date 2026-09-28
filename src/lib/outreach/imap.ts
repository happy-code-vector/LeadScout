import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { simpleParser } from "mailparser";
import type { Mailbox } from "@prisma/client";
import { prisma } from "../db";
import { log } from "../logger";
import { decryptSecret } from "../crypto";
import { processIncoming } from "./replies";

/**
 * IMAP polling (spec: poll every 5 minutes per mailbox). New messages since
 * the last seen UID are parsed and fed to the same handler as the dev inbox
 * reply simulation.
 */

export async function pollMailbox(mailbox: Mailbox): Promise<{ processed: number }> {
  const options: ImapFlowOptions = {
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapPort === 993,
    auth: { user: mailbox.user, pass: decryptSecret(mailbox.passwordEncrypted) },
    logger: false,
    emitLogs: false,
  };

  const client = new ImapFlow(options);
  let processed = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      let lastUid = mailbox.imapLastUid;
      const total = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0;
      // Fetch everything newer than the last seen UID (new mailboxes: the
      // most recent 50 messages only, to avoid replaying ancient history).
      const range =
        mailbox.imapLastUid === 0 ? `${Math.max(1, total - 50)}:*` : `${mailbox.imapLastUid + 1}:*`;

      for await (const message of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (message.uid <= mailbox.imapLastUid) continue; // `*` range can re-return the last message
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const isDeliveryStatus =
          parsed.headers.get("content-type")?.toString().includes("delivery-status") ?? false;
        await processIncoming({
          messageId: parsed.messageId ?? undefined,
          inReplyTo: typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined,
          references: Array.isArray(parsed.references)
            ? parsed.references.map(String)
            : parsed.references
              ? [String(parsed.references)]
              : undefined,
          from: parsed.from?.text,
          subject: parsed.subject ?? undefined,
          text: parsed.text ?? undefined,
          isDeliveryStatus,
        });
        processed += 1;
        lastUid = Math.max(lastUid, message.uid);
      }

      if (lastUid !== mailbox.imapLastUid) {
        await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: { imapLastUid: lastUid },
        });
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    log.warn("imap poll failed", { mailbox: mailbox.label, err });
  } finally {
    try {
      client.close();
    } catch {
      // already closed
    }
  }
  return { processed };
}

export async function pollAllMailboxes(): Promise<number> {
  const mailboxes = await prisma.mailbox.findMany({ where: { active: true } });
  let processed = 0;
  for (const mailbox of mailboxes) {
    const res = await pollMailbox(mailbox);
    processed += res.processed;
  }
  if (processed > 0) {
    log.info("imap poll done", { mailboxes: mailboxes.length, processed });
  }
  return processed;
}
