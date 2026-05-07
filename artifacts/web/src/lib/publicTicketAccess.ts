const STORAGE_PREFIX = "eride.publicTicketToken:";

export type StoredAccess = {
  token: string;
  expiresAt: string; // ISO
};

function key(ticketReference: string): string {
  return `${STORAGE_PREFIX}${ticketReference.toUpperCase()}`;
}

export function storePublicTicketToken(
  ticketReference: string,
  access: StoredAccess,
): void {
  try {
    sessionStorage.setItem(key(ticketReference), JSON.stringify(access));
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function readPublicTicketToken(
  ticketReference: string,
): StoredAccess | null {
  try {
    const raw = sessionStorage.getItem(key(ticketReference));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAccess;
    if (
      typeof parsed.token !== "string" ||
      typeof parsed.expiresAt !== "string"
    )
      return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(key(ticketReference));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPublicTicketToken(ticketReference: string): void {
  try {
    sessionStorage.removeItem(key(ticketReference));
  } catch {
    /* ignore */
  }
}
