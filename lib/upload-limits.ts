/** Largest single upload. Shared so the browser can refuse a file before sending it. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** A help request's gallery: photos and short videos. Shared with the browser for early checks. */
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export const MAX_REQUEST_IMAGES = 10;
export const MAX_REQUEST_VIDEOS = 3;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
