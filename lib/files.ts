import "server-only";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type Detected = { contentType: string; ext: string };

/** Identify a file by its first bytes, not by its name or the browser's claim. */
function sniff(bytes: Uint8Array): Detected | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return { contentType: "image/jpeg", ext: "jpg" };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { contentType: "image/png", ext: "png" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return { contentType: "image/webp", ext: "webp" };
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { contentType: "application/pdf", ext: "pdf" };
  return null;
}

export type UploadCheck =
  | { ok: true; data: Buffer; contentType: string; fileName: string; size: number }
  | { ok: false; reason: "missing" | "type" | "size" };

/** Validates an uploaded image/PDF: present, ≤ 5 MB, and really a JPG, PNG, WebP or PDF. */
export async function readUpload(value: FormDataEntryValue | null): Promise<UploadCheck> {
  if (!value || typeof value === "string" || value.size === 0) return { ok: false, reason: "missing" };
  if (value.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "size" };
  const data = Buffer.from(await value.arrayBuffer());
  const detected = sniff(data);
  if (!detected) return { ok: false, reason: "type" };
  const base = (value.name || "file").replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || "file";
  return { ok: true, data, contentType: detected.contentType, fileName: `${base}.${detected.ext}`, size: data.length };
}
