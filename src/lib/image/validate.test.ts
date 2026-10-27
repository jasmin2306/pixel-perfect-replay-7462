import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, validateImageFile } from "./validate";

describe("validateImageFile", () => {
  it("accepts a PNG under the size limit", () => {
    expect(validateImageFile({ type: "image/png", size: 2048 })).toEqual({ ok: true });
  });
  it("rejects non-image files", () => {
    expect(validateImageFile({ type: "application/pdf", size: 2048 }).ok).toBe(false);
  });
  it("rejects images above 10 MB", () => {
    expect(validateImageFile({ type: "image/jpeg", size: MAX_IMAGE_BYTES + 1 }).ok).toBe(false);
  });
  it("accepts exactly 10 MB", () => {
    expect(validateImageFile({ type: "image/jpeg", size: MAX_IMAGE_BYTES }).ok).toBe(true);
  });
});
