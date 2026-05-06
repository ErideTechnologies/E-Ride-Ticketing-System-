const MB = 1024 * 1024;

type Rule = {
  fileType: "image" | "pdf" | "video";
  mimeTypes: readonly string[];
  extensions: readonly string[];
  maxBytes: number;
};

const RULES: ReadonlyArray<Rule> = [
  {
    fileType: "image",
    mimeTypes: ["image/png"],
    extensions: [".png"],
    maxBytes: 10 * MB,
  },
  {
    fileType: "image",
    mimeTypes: ["image/jpeg", "image/jpg"],
    extensions: [".jpg", ".jpeg"],
    maxBytes: 10 * MB,
  },
  {
    fileType: "image",
    mimeTypes: ["image/webp"],
    extensions: [".webp"],
    maxBytes: 10 * MB,
  },
  {
    fileType: "pdf",
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 15 * MB,
  },
  {
    fileType: "video",
    mimeTypes: ["video/mp4"],
    extensions: [".mp4"],
    maxBytes: 50 * MB,
  },
  {
    fileType: "video",
    mimeTypes: ["video/quicktime"],
    extensions: [".mov"],
    maxBytes: 50 * MB,
  },
];

export const ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,.mp4,.mov,image/png,image/jpeg,image/webp,application/pdf,video/mp4,video/quicktime";

export const ATTACHMENT_HELP_TEXT =
  "Allowed: PNG, JPG, WEBP (up to 10MB), PDF (up to 15MB), MP4, MOV (up to 50MB).";

export function validateAttachmentFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const rule = RULES.find(
    (r) => r.mimeTypes.includes(file.type) && r.extensions.includes(ext),
  );
  if (!rule) {
    return "Unsupported file type. Allowed: PNG, JPG, WEBP, PDF, MP4, or MOV.";
  }
  if (file.size <= 0) return "File is empty.";
  if (file.size > rule.maxBytes) {
    const limit = Math.round(rule.maxBytes / MB);
    const label =
      rule.fileType === "image"
        ? "Images"
        : rule.fileType === "pdf"
          ? "PDFs"
          : "Videos";
    return `File is too large. ${label} must be ${limit}MB or smaller.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
