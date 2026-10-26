import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readPaymentEvidence } from "@/modules/payments/evidence";

async function imageForm() {
  const bytes = await sharp({ create: { width: 2100, height: 3000, channels: 3, background: "white" } }).png().toBuffer();
  const form = new FormData();
  form.set("paymentEvidence", new File([new Uint8Array(bytes)], "voucher.png", { type: "image/png" }));
  return form;
}

describe("payment evidence", () => {
  it.each(["cash", "bank_transfer"])("requires an image for %s", async (method) => {
    await expect(readPaymentEvidence(new FormData(), method)).rejects.toMatchObject({ code: "evidence-required" });
  });
  it("requires a signed-receipt confirmation for cash", async () => {
    await expect(readPaymentEvidence(await imageForm(), "cash")).rejects.toMatchObject({ code: "signed-receipt-required" });
  });
  it("decodes and bounds the image while retaining receipt readability", async () => {
    const form = await imageForm();
    const result = await readPaymentEvidence(form, "bank_transfer");
    const metadata = await sharp(Buffer.from(result.image!.slice(2), "hex")).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(2000);
    expect(metadata.height).toBeGreaterThan(2800);
    expect(metadata.exif).toBeUndefined();
    expect(result.signedReceiptAttested).toBe(false);
    form.set("signedReceiptAttested", "on");
    expect((await readPaymentEvidence(form, "cash")).signedReceiptAttested).toBe(true);
  });
  it.each(["image/png", "image/svg+xml"])("rejects invalid content declared as %s", async (type) => {
    const form = new FormData();
    form.set("paymentEvidence", new File(["not an image"], "fake.png", { type }));
    await expect(readPaymentEvidence(form, "bank_transfer")).rejects.toMatchObject({ code: "evidence-invalid" });
  });
  it("rejects images over the upload limit", async () => {
    const form = new FormData();
    form.set("paymentEvidence", new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
    await expect(readPaymentEvidence(form, "bank_transfer")).rejects.toMatchObject({ code: "evidence-invalid" });
  });
  it("keeps an image optional for card and other payments", async () => {
    expect(await readPaymentEvidence(new FormData(), "card")).toEqual({ image: null, signedReceiptAttested: false });
    expect(await readPaymentEvidence(new FormData(), "other")).toEqual({ image: null, signedReceiptAttested: false });
  });
});
