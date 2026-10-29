import "server-only";

import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES } from "./upload-limits";

export { MAX_UPLOAD_BYTES };

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

/** Video containers, recognised by their first bytes like the images above. */
function sniffVideo(bytes: Uint8Array): Detected | null {
  // MP4 and QuickTime: an "ftyp" box at byte 4; its brand says which.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return brand === "qt  " ? { contentType: "video/quicktime", ext: "mov" } : { contentType: "video/mp4", ext: "mp4" };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { contentType: "video/webm", ext: "webm" };
  return null;
}

export type MediaCheck =
  | { ok: true; kind: "image" | "video"; data: Buffer; contentType: string; fileName: string; size: number }
  | { ok: false; reason: "missing" | "type" | "size"; kind?: "image" | "video" };

/**
 * Validates one gallery item for a help request: a JPG/PNG/WebP photo (≤ 5 MB) or an MP4/WebM/MOV
 * video (≤ 30 MB), identified by its content, not its name. PDFs are not gallery items.
 */
export async function readMedia(value: FormDataEntryValue | null): Promise<MediaCheck> {
  if (!value || typeof value === "string" || value.size === 0) return { ok: false, reason: "missing" };
  if (value.size > MAX_VIDEO_BYTES) return { ok: false, reason: "size" };
  const data = Buffer.from(await value.arrayBuffer());
  const image = sniff(data);
  const video = image ? null : sniffVideo(data);
  const detected = image && image.contentType.startsWith("image/") ? image : video;
  if (!detected) return { ok: false, reason: "type" };
  const kind = detected.contentType.startsWith("video/") ? "video" : "image";
  if (kind === "image" && data.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "size", kind };
  const base = (value.name || kind).replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80) || kind;
  return { ok: true, kind, data, contentType: detected.contentType, fileName: `${base}.${detected.ext}`, size: data.length };
}
