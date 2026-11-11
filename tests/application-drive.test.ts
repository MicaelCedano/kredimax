import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBusinessApplicationDocument, uploadBusinessApplicationDocuments } from "@/lib/financing/application-drive.server";
import { businessDocumentRequirements } from "@/modules/financing/application-income";

const context = { tenantId: "tenant-test", submissionKey: "submission-test", actorId: "actor-test" };
const ids = ["financial-file", "utility-file", "registry-file"];
const documents = businessDocumentRequirements.map(({ field, label }) => ({
  field, label, bytes: Buffer.from("%PDF-1.4\nTest document"), mimeType: "application/pdf" as const,
}));

function mockDrive(failingId?: string) {
  const uploads: string[] = [];
  const deletions: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "fake-token" });
    const path = new URL(url).pathname;
    if (path.endsWith("/private-folder")) return Response.json({
      ownedByMe: true, shared: false, trashed: false, mimeType: "application/vnd.google-apps.folder",
      appProperties: { tenantId: context.tenantId, kind: "kredimax-application-folder" },
    });
    if (path.endsWith("/generateIds")) return Response.json({ ids });
    if (options?.method === "DELETE") {
      deletions.push(path.split("/").at(-1)!);
      return new Response(null, { status: 204 });
    }
    const multipart = Buffer.from(options?.body as Buffer).toString("utf8");
    const id = ids.find((candidate) => multipart.includes(`"id":"${candidate}"`))!;
    uploads.push(multipart);
    if (id === failingId) return new Response(null, { status: 503 });
    return Response.json({ id, size: String(documents[0].bytes.length) });
  }));
  return { uploads, deletions };
}

describe("Application document storage in Drive", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_DRIVE_APPLICATION_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_DRIVE_APPLICATION_CLIENT_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_DRIVE_APPLICATION_REFRESH_TOKEN", "test-refresh");
    vi.stubEnv("GOOGLE_DRIVE_APPLICATION_FOLDER_ID", "private-folder");
    vi.stubEnv("GOOGLE_DRIVE_APPLICATION_TENANT_ID", context.tenantId);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stores all three files under the private folder and keeps the references retained by the application", async () => {
    const { uploads, deletions } = mockDrive();
    const batch = await uploadBusinessApplicationDocuments(documents, context);
    expect(batch.documents.map(({ driveFileId }) => driveFileId)).toEqual(ids);
    expect(uploads).toHaveLength(3);
    expect(uploads.every((upload) => upload.includes('"parents":["private-folder"]') && upload.includes("%PDF-1.4"))).toBe(true);
    await batch.discardUnlinked([ids[0], ids[2]]);
    expect(deletions).toEqual([ids[1]]);
  });

  it("cleans up all reserved Drive files when only part of the batch succeeds", async () => {
    const { deletions } = mockDrive(ids[1]);
    await expect(uploadBusinessApplicationDocuments(documents, context)).rejects.toThrow("todos los documentos");
    expect(deletions).toEqual(ids);
  });

  it("never reads file content when the Drive metadata belongs to a different submission or creator", async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes("oauth2.googleapis.com")
      ? Response.json({ access_token: "fake-token" })
      : Response.json({
        mimeType: "application/pdf", size: "10", trashed: false,
        appProperties: { ...context, actorId: "other-actor", kind: "kredimax-application-document", field: documents[0].field },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadBusinessApplicationDocument(ids[0], documents[0].field, context)).resolves.toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("alt=media"))).toBe(false);
  });
});
