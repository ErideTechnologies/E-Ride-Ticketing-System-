import { Resend } from "resend";
import { logger } from "./logger";

const DEFAULT_FROM = "Eride Support <support@eridetech.africa>";
const DEFAULT_REPLY_TO = "support@eridetech.africa";

export type SendSupportEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  from?: string | null;
};

export type SendSupportEmailResult = {
  success: boolean;
  provider: "resend";
  providerMessageId?: string | null;
  errorMessage?: string | null;
  disabled: boolean;
};

let cachedClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) {
    cachedClient = new Resend(key);
  }
  return cachedClient;
}

export function isSupportEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getSupportEmailFrom(): string {
  return process.env.SUPPORT_EMAIL_FROM || DEFAULT_FROM;
}

export function getSupportEmailReplyTo(): string {
  return process.env.SUPPORT_EMAIL_REPLY_TO || DEFAULT_REPLY_TO;
}

export async function sendSupportEmail(
  params: SendSupportEmailParams,
): Promise<SendSupportEmailResult> {
  const client = getResend();
  if (!client) {
    return {
      success: false,
      provider: "resend",
      disabled: true,
      providerMessageId: null,
      errorMessage: "RESEND_API_KEY not configured",
    };
  }

  const from = params.from?.trim() || getSupportEmailFrom();
  const replyTo = params.replyTo?.trim() || getSupportEmailReplyTo();

  try {
    const result = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo,
    });
    if (result.error) {
      logger.warn(
        { err: result.error, to: params.to },
        "Resend returned an error",
      );
      return {
        success: false,
        provider: "resend",
        disabled: false,
        providerMessageId: null,
        errorMessage: result.error.message ?? "Resend error",
      };
    }
    return {
      success: true,
      provider: "resend",
      disabled: false,
      providerMessageId: result.data?.id ?? null,
      errorMessage: null,
    };
  } catch (err) {
    logger.error({ err }, "Failed to send support email via Resend");
    return {
      success: false,
      provider: "resend",
      disabled: false,
      providerMessageId: null,
      errorMessage:
        err instanceof Error ? err.message : "Unknown email send failure",
    };
  }
}
