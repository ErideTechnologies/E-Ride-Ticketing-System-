/**
 * Captures lightweight client-side context attached to public ticket
 * submissions. Used by support to reproduce environment-specific issues.
 *
 * Privacy: we deliberately avoid full URLs because query strings and
 * fragments can contain tokens, reset codes, email addresses, or account
 * IDs. Only pathnames are retained, and every string is length-capped.
 */
export type DeviceInfo = {
  ua: string;
  os: string;
  viewport: string;
  language: string;
  referrerPath: string;
  hrefPath: string;
};

const MAX_UA = 256;
const MAX_PATH = 256;
const MAX_LANG = 16;
const MAX_VIEWPORT = 16;

function detectOs(ua: string): string {
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

function safePath(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl, window.location.origin);
    return (u.pathname || "/").slice(0, MAX_PATH);
  } catch {
    return "";
  }
}

function clamp(s: string, max: number): string {
  return (s ?? "").toString().slice(0, max);
}

export function captureDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      ua: "",
      os: "",
      viewport: "",
      language: "",
      referrerPath: "",
      hrefPath: "",
    };
  }
  const ua = clamp(window.navigator.userAgent ?? "", MAX_UA);
  return {
    ua,
    os: detectOs(ua),
    viewport: clamp(
      `${window.innerWidth}x${window.innerHeight}`,
      MAX_VIEWPORT,
    ),
    language: clamp(window.navigator.language ?? "", MAX_LANG),
    referrerPath: safePath(document.referrer ?? ""),
    hrefPath: safePath(window.location.href ?? ""),
  };
}
