import { mkdir, unlink, stat, rm } from "node:fs/promises";
import { createReadStream, type ReadStream } from "node:fs";
import { join, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";

export type AttachmentFileType = "image" | "pdf" | "video";

export type AllowedAttachment = {
  fileType: AttachmentFileType;
  mimeType: string;
  extension: string;
  maxBytes: number;
};

const MB = 1024 * 1024;

const ALLOWED: ReadonlyArray<{
  mimeTypes: readonly string[];
  extensions: readonly string[];
  fileType: AttachmentFileType;
  maxBytes: number;
}> = [
  {
    mimeTypes: ["image/png"],
    extensions: [".png"],
    fileType: "image",
    maxBytes: 10 * MB,
  },
  {
    mimeTypes: ["image/jpeg", "image/jpg"],
    extensions: [".jpg", ".jpeg"],
    fileType: "image",
    maxBytes: 10 * MB,
  },
  {
    mimeTypes: ["image/webp"],
    extensions: [".webp"],
    fileType: "image",
    maxBytes: 10 * MB,
  },
  {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    fileType: "pdf",
    maxBytes: 15 * MB,
  },
  {
    mimeTypes: ["video/mp4"],
    extensions: [".mp4"],
    fileType: "video",
    maxBytes: 50 * MB,
  },
  {
    mimeTypes: ["video/quicktime"],
    extensions: [".mov"],
    fileType: "video",
    maxBytes: 50 * MB,
  },
];

export const MAX_UPLOAD_BYTES = 50 * MB;

export const ALLOWED_MIME_TYPES = ALLOWED.flatMap((a) => a.mimeTypes);
export const ALLOWED_EXTENSIONS = ALLOWED.flatMap((a) => a.extensions);

export type ValidationResult =
  | { ok: true; allowed: AllowedAttachment }
  | { ok: false; reason: string };

function sniffMimeFromBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (buf.slice(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buf.length >= 12 && buf.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.slice(8, 12).toString("ascii");
    if (
      ["mp41", "mp42", "isom", "iso2", "avc1", "dash", "mp4 "].includes(brand)
    )
      return "video/mp4";
    if (["qt  ", "moov"].includes(brand)) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

const MIME_EQUIVALENTS: Record<string, readonly string[]> = {
  "image/jpeg": ["image/jpeg", "image/jpg"],
  "image/jpg": ["image/jpeg", "image/jpg"],
  "video/mp4": ["video/mp4", "video/quicktime"],
  "video/quicktime": ["video/quicktime", "video/mp4"],
};

export function validateAttachmentContent(input: {
  declaredMimeType: string;
  buffer: Buffer;
}): ValidationResult | { ok: true; sniffedMime: string } {
  const sniffed = sniffMimeFromBytes(input.buffer);
  if (!sniffed) {
    return {
      ok: false,
      reason:
        "File contents do not match an allowed type (PNG, JPG, WEBP, PDF, MP4, or MOV).",
    };
  }
  const equiv = MIME_EQUIVALENTS[input.declaredMimeType] ?? [
    input.declaredMimeType,
  ];
  if (!equiv.includes(sniffed)) {
    return {
      ok: false,
      reason: "File contents do not match the declared file type.",
    };
  }
  return { ok: true, sniffedMime: sniffed };
}

export function validateAttachment(input: {
  mimeType: string;
  originalFileName: string;
  size: number;
}): ValidationResult {
  const ext = extname(input.originalFileName).toLowerCase();
  const match = ALLOWED.find(
    (a) => a.mimeTypes.includes(input.mimeType) && a.extensions.includes(ext),
  );
  if (!match) {
    return {
      ok: false,
      reason:
        "Unsupported file type. Allowed: PNG, JPG, WEBP, PDF, MP4, or MOV.",
    };
  }
  if (input.size <= 0) {
    return { ok: false, reason: "File is empty." };
  }
  if (input.size > match.maxBytes) {
    const limitMb = Math.round(match.maxBytes / MB);
    return {
      ok: false,
      reason: `File is too large. ${match.fileType === "image" ? "Images" : match.fileType === "pdf" ? "PDFs" : "Videos"} must be ${limitMb}MB or smaller.`,
    };
  }
  return {
    ok: true,
    allowed: {
      fileType: match.fileType,
      mimeType: input.mimeType,
      extension: ext,
      maxBytes: match.maxBytes,
    },
  };
}

const ROOT = resolve(
  process.env["SUPPORT_ATTACHMENTS_DIR"] ?? "./.local-storage/attachments",
);

export async function ensureStorageReady(): Promise<void> {
  await mkdir(ROOT, { recursive: true });
}

export type StoredFile = {
  fileName: string;
  storagePath: string;
};

function safeFileName(extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  return `${randomUUID()}${safeExt}`;
}

export async function buildStoragePath(
  ticketId: string,
  extension: string,
): Promise<StoredFile> {
  const dir = join(ROOT, ticketId);
  await mkdir(dir, { recursive: true });
  const fileName = safeFileName(extension);
  return { fileName, storagePath: join(dir, fileName) };
}

export function resolveStoredPath(storagePath: string): string {
  const abs = resolve(storagePath);
  if (!abs.startsWith(ROOT)) {
    throw new Error("Refusing to access storage path outside attachments root");
  }
  return abs;
}

export async function statStored(storagePath: string): Promise<{
  size: number;
} | null> {
  try {
    const s = await stat(resolveStoredPath(storagePath));
    return { size: s.size };
  } catch {
    return null;
  }
}

export function streamStored(storagePath: string): ReadStream {
  return createReadStream(resolveStoredPath(storagePath));
}

export async function removeStored(storagePath: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(storagePath));
  } catch {
    /* ignore */
  }
}

/**
 * Recursively remove the entire on-disk attachment directory for a ticket
 * (`<ROOT>/<ticketId>`), including any files written concurrently. Returns
 * `true` only when the directory is verifiably gone afterwards, so callers can
 * detect and report partial-cleanup failures instead of silently succeeding.
 */
export async function removeTicketDir(ticketId: string): Promise<boolean> {
  const dir = resolve(join(ROOT, ticketId));
  if (dir !== ROOT && !dir.startsWith(ROOT + "/")) {
    throw new Error("Refusing to remove path outside attachments root");
  }
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* fall through to existence check */
  }
  try {
    await stat(dir);
    return false; // still exists → removal failed
  } catch {
    return true; // gone
  }
}
