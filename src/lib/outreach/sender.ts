import nodemailer, { type Transporter } from "nodemailer";
import type { Mailbox } from "@prisma/client";
import { decryptSecret } from "../crypto";
import type { TemplateVars } from "./render";
import { renderTemplate } from "./render";

/**
 * SMTP sending (spec: Outreach). One transport per mailbox, reused.
 * CAN-SPAM: List-Unsubscribe + List-Unsubscribe-Post headers, physical
 * postal address in the footer (baked into every seeded template body).
 */

const transports = new Map<string, Transporter>();

export function getTransport(mailbox: Mailbox): Transporter {
  let t = transports.get(mailbox.id);
  if (!t || (t as { options?: { host?: string; port?: number } }).options?.host !== mailbox.smtpHost) {
    t = nodemailer.createTransport({
      host: mailbox.smtpHost,
      port: mailbox.smtpPort,
      secure: mailbox.smtpPort === 465,
      auth: { user: mailbox.user, pass: decryptSecret(mailbox.passwordEncrypted) },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    transports.set(mailbox.id, t);
  }
  return t;
}

export interface SendEmailInput {
  mailbox: Mailbox;
  to: string;
  templateSubject: string | null;
  templateBody: string;
  vars: TemplateVars;
  unsubscribeUrl: string;
}

export interface SentMessage {
  messageId: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SentMessage> {
  const transport = getTransport(input.mailbox);
  const subject = renderTemplate(input.templateSubject ?? "(no subject)", input.vars);
  const text = renderTemplate(input.templateBody, input.vars);
  const fromName = input.mailbox.fromName ?? input.vars.senderName;

  const info = await transport.sendMail({
    from: `"${fromName}" <${input.mailbox.user}>`,
    to: input.to,
    subject,
    text,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return { messageId: info.messageId ?? "" };
}

/** Send a test email from the Settings page (any address). */
export async function sendTestEmail(
  mailbox: Mailbox,
  to: string,
  senderName: string,
): Promise<SentMessage> {
  const transport = getTransport(mailbox);
  const info = await transport.sendMail({
    from: `"${senderName}" <${mailbox.user}>`,
    to,
    subject: "LeadScout test email",
    text: `This is a test email from LeadScout via ${mailbox.smtpHost}:${mailbox.smtpPort}.\n\nIf you received this, the mailbox works.`,
  });
  return { messageId: info.messageId ?? "" };
}
