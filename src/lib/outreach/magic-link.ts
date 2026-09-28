import nodemailer from "nodemailer";
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { log } from "../logger";

/**
 * Send an Auth.js magic-link email. Uses the first active mailbox; when none
 * is configured the link is logged instead so local dev still works.
 */
export async function sendMagicLink(to: string, url: string): Promise<void> {
  const mailbox = await prisma.mailbox.findFirst({ where: { active: true } });
  if (!mailbox) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("no mailbox configured");
    }
    log.info("magic link (no mailbox configured — open this URL)", { to, url });
    return;
  }

  const transport = nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpPort === 465,
    auth: { user: mailbox.user, pass: decryptSecret(mailbox.passwordEncrypted) },
  });
  await transport.sendMail({
    from: `"LeadScout" <${mailbox.user}>`,
    to,
    subject: "Sign in to LeadScout",
    text: `Sign in to LeadScout:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
  });
  log.info("magic link sent", { to });
}
