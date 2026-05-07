import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

const DEV_FALLBACK_SECRET = "dev-only-public-ticket-secret-change-me";
const TOKEN_TTL_SECONDS = 30 * 60;

let warned = false;

function getSecret(): string {
  const explicit = process.env["SUPPORT_PUBLIC_TICKET_SECRET"];
  if (explicit && explicit.length >= 16) return explicit;

  const session = process.env["SESSION_SECRET"];
  if (session && session.length >= 16) return session;

  if (!warned) {
    warned = true;
    logger.warn(
      "SUPPORT_PUBLIC_TICKET_SECRET (and SESSION_SECRET) is not set — falling back to a development-only signing key. Set SUPPORT_PUBLIC_TICKET_SECRET in production.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export type PublicTicketTokenPayload = {
  ticketId: string;
  exp: number; // epoch seconds
};

export function signPublicTicketToken(ticketId: string): {
  token: string;
  expiresAt: Date;
} {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${ticketId}.${exp}`;
  const sig = sign(payload);
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPublicTicketToken(
  token: string,
): PublicTicketTokenPayload | null {
  if (typeof token !== "string" || token.length < 10) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [ticketId, expStr, sig] = parts as [string, string, string];

  const expected = sign(`${ticketId}.${expStr}`);
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, "hex");
    expBuf = Buffer.from(expected, "hex");
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000))
    return null;

  return { ticketId, exp };
}
