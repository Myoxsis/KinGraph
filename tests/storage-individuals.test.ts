import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearAll,
  createEmptyProfile,
  createIndividual,
  createRecord,
  deleteIndividual,
  getState,
  ready,
  updateIndividualProfile,
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

describe("deleteIndividual", () => {
  beforeAll(async () => {
    await ready;
  });

  beforeEach(async () => {
    await clearAll();
  });

  afterEach(async () => {
    await clearAll();
  });

  it("removes the individual, their records, and relationship links", async () => {
    const alice = await createIndividual("Alice");
    const bob = await createIndividual("Bob");

    const bobProfile = createEmptyProfile();
    bobProfile.linkedSpouses = [alice.id];
    bobProfile.linkedChildren = [alice.id];
    bobProfile.linkedParents.father = alice.id;

    const bobBefore = await updateIndividualProfile(bob.id, bobProfile);
    expect(bobBefore).not.toBeNull();
    const previousProfileUpdatedAt = bobBefore?.profileUpdatedAt ?? "";

    await createRecord({ individualId: alice.id, summary: "Record", record: baseRecord });

    await deleteIndividual(alice.id);

    const state = getState();
    expect(state.individuals.map((item) => item.id)).not.toContain(alice.id);
    expect(state.records.some((record) => record.individualId === alice.id)).toBe(false);

    const bobAfter = state.individuals.find((item) => item.id === bob.id);
    expect(bobAfter).toBeDefined();
    expect(bobAfter?.profile.linkedSpouses).toEqual([]);
    expect(bobAfter?.profile.linkedChildren).toEqual([]);
    expect(bobAfter?.profile.linkedParents.father).toBeUndefined();
    expect(bobAfter?.profileUpdatedAt).not.toBe(previousProfileUpdatedAt);
    expect(bobAfter?.updatedAt).not.toBe(previousProfileUpdatedAt);
  });
});
