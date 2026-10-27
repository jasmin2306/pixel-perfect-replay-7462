export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGES_PER_MESSAGE = 4;

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateImageFile(file: { type: string; size: number }): ValidationResult {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "Unsupported format. Use JPG, PNG, WEBP or HEIC." };
  }
  if (file.size === 0) return { ok: false, reason: "This file is empty." };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: `Image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Hook point for Phase 2: Canvas resize + compression inside a Web Worker.
 * Currently returns the file unchanged.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  return file;
}
