// Transactional email for sign-in codes.
//
// Mirrors the provider-detection order used by jobmatch.ai's mailer so the
// rcinc.app apps can share one mail account: Cloudflare Email Sending first,
// then Resend. Nothing here is required for Google sign-in; it exists so there
// is a way into the app when Google is unavailable.
//
// No provider configured is a loud error, not a silent success — a sign-in code
// that was never delivered must not look like one that was.

import { HttpError } from './http';
import type { Env } from '../types';

type Provider = 'cloudflare' | 'resend' | null;

function detect(env: Env): Provider {
  if (env.CLOUDFLARE_EMAIL_API_TOKEN && env.CF_ACCOUNT_ID) return 'cloudflare';
  if (env.RESEND_API_KEY) return 'resend';
  return null;
}

export const mailConfigured = (env: Env) => detect(env) !== null;

const from = (env: Env) => env.MAIL_FROM || 'MyYTEngine <no-reply.myytengine@rcinc.app>';

export async function sendEmail(
  env: Env,
  message: { to: string; subject: string; html: string; text: string },
): Promise<void> {
  const provider = detect(env);
  if (!provider) {
    throw new HttpError(503, 'Email sign-in is not configured on this deployment.');
  }

  const res =
    provider === 'cloudflare'
      ? await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.CLOUDFLARE_EMAIL_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: from(env),
              to: [message.to],
              subject: message.subject,
              html: message.html,
              text: message.text,
            }),
          },
        )
      : await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: from(env),
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new HttpError(502, `Could not send the email (${provider}): ${detail}`);
  }
}

/** The one-time code email. Plain and short: it is read on a phone, in a hurry. */
export function signInCodeEmail(code: string) {
  return {
    subject: `${code} is your MyYTEngine sign-in code`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
    html:
      `<p>Your sign-in code is:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>` +
      `<p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>`,
  };
}
