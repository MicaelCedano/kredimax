import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { planMigrations } from "../scripts/migration-plan.mjs";

function entry(tag: string, when: number, source: string) {
  return { tag, when, source };
}

describe("local migration plan", () => {
  it("uses journal order when a new migration timestamp predates the latest applied timestamp", () => {
    const entries = [entry("0000_base", 200, "base"), entry("0001_custom", 100, "custom")];
    const plan: { pending: { entry: { tag: string } }[]; sourceDrift: { tag: string }[] } =
      planMigrations(entries, [{ id: 1, hash: hash("base"), created_at: "200" }], (item: { source: string }) => item.source);

    expect(plan.pending.map((migration) => migration.entry.tag)).toEqual(["0001_custom"]);
    expect(plan.sourceDrift).toEqual([]);
  });

  it("recognizes applied SQL drift by its recorded migration timestamp without replaying it", () => {
    const entries = [entry("0000_base", 200, "current source")];
    const plan: { pending: { entry: { tag: string } }[]; sourceDrift: { tag: string }[] } =
      planMigrations(entries, [{ id: 1, hash: hash("previous source"), created_at: "200" }], (item: { source: string }) => item.source);

    expect(plan.pending).toEqual([]);
    expect(plan.sourceDrift.map((drift) => drift.tag)).toEqual(["0000_base"]);
  });

  it("rejects an applied migration that cannot be matched to the journal", () => {
    expect(() => planMigrations(
      [entry("0000_base", 200, "base")],
      [{ id: 1, hash: hash("unknown"), created_at: "300" }],
      (item: { source: string }) => item.source,
    )).toThrow(/does not match any current journal entry/);
  });

  it("rejects gaps and out-of-order applied migrations", () => {
    const entries = [entry("0000_base", 200, "base"), entry("0001_next", 100, "next")];
    expect(() => planMigrations(
      entries,
      [{ id: 1, hash: hash("next"), created_at: "100" }],
      (item: { source: string }) => item.source,
    )).toThrow(/Applied migration order is inconsistent/);
  });
});

function hash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}
