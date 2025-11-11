import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearAll,
  createIndividual,
  createRecord,
  getState,
  ready,
  updateRecord,
} from "../src/storage";
import type { IndividualRecord } from "../schema";

const baseRecord: IndividualRecord = {
  sourceHtml: "<p>Example</p>",
  extractedAt: new Date().toISOString(),
  givenNames: ["Alice"],
  aliases: [],
  birth: {},
  death: {},
  residences: [],
  parents: {},
  spouses: [],
  children: [],
  siblings: [],
  provenance: [],
  sources: [],
};

describe("updateRecord", () => {
  beforeAll(async () => {
    await ready;
  });

  beforeEach(async () => {
    await clearAll();
  });

  afterEach(async () => {
    await clearAll();
  });

  it("updates the record summary", async () => {
    const individual = await createIndividual("Alice");
    const stored = await createRecord({
      individualId: individual.id,
      summary: "Original summary",
      record: baseRecord,
    });

    const updated = await updateRecord({ id: stored.id, summary: "Updated summary" });

    expect(updated).not.toBeNull();
    expect(updated?.summary).toBe("Updated summary");

    const state = getState();
    const persisted = state.records.find((record) => record.id === stored.id);
    expect(persisted?.summary).toBe("Updated summary");
  });

  it("trims the summary before saving", async () => {
    const individual = await createIndividual("Alice");
    const stored = await createRecord({
      individualId: individual.id,
      summary: "Original",
      record: baseRecord,
    });

    const updated = await updateRecord({ id: stored.id, summary: "  New summary  " });

    expect(updated).not.toBeNull();
    expect(updated?.summary).toBe("New summary");
  });

  it("returns null when the record does not exist", async () => {
    const result = await updateRecord({ id: "missing", summary: "Updated" });
    expect(result).toBeNull();
  });
});

