import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isSameOriginPhotoRequest, MAX_PHOTO_UPLOAD_BYTES, prepareCustomerPhoto } from "@/modules/customers/photo";

describe("customer photo processing", () => {
  it("checks the browser origin against the actual request host, including a local reverse proxy", () => {
    expect(isSameOriginPhotoRequest(new Request("http://localhost:3002/api/clientes/id/foto", { headers: { host: "127.0.0.1:3002", origin: "http://127.0.0.1:3002" } }))).toBe(true);
    expect(isSameOriginPhotoRequest(new Request("http://localhost:3002/api/clientes/id/foto", { headers: { host: "127.0.0.1:3002", origin: "https://example.test" } }))).toBe(false);
    expect(isSameOriginPhotoRequest(new Request("http://localhost:3002/api/clientes/id/foto", { headers: { host: "127.0.0.1:3002" } }))).toBe(false);
  });
  it("decodes and resizes a real image, strips metadata and returns compact WebP", async () => {
    const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#1264dc" } }).jpeg().withExif({ IFD0: { Artist: "private fixture metadata" } }).toBuffer();
    const photo = await prepareCustomerPhoto(original, "image/jpeg");
    const metadata = await sharp(photo).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(427);
    expect(metadata.exif).toBeUndefined();
    expect(photo.length).toBeLessThan(1024 * 1024);
  });

  it("rejects unsupported formats, invalid bytes and oversized uploads", async () => {
    await expect(prepareCustomerPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml")).rejects.toThrow();
    await expect(prepareCustomerPhoto(Buffer.from("not an image"), "image/png")).rejects.toThrow();
    await expect(prepareCustomerPhoto(Buffer.alloc(MAX_PHOTO_UPLOAD_BYTES + 1), "image/jpeg")).rejects.toThrow();
  });
});
