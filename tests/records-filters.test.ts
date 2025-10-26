import { describe, expect, it } from "vitest";
import {
  filterRecordsByCriteria,
  NO_ROLE_FILTER_VALUE,
} from "../apps/paste-preview/records";
import {
  createEmptyProfile,
  type StoredIndividual,
  type StoredRecord,
} from "../src/storage";
import type { IndividualRecord } from "../schema";

type FilterCriteria = Parameters<typeof filterRecordsByCriteria>[2];

const baseRecord: IndividualRecord = {
  sourceHtml: "<p>Record</p>",
  extractedAt: "2024-01-01T00:00:00.000Z",
  givenNames: ["Test"],
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

function buildRecord(id: string, individualId: string, dayOffset: number): StoredRecord {
  const createdAt = new Date(Date.UTC(2024, 0, 1 + dayOffset)).toISOString();
  return {
    id,
    individualId,
    createdAt,
    summary: `Record ${id}`,
    record: { ...baseRecord, extractedAt: createdAt },
  } satisfies StoredRecord;
}

function buildIndividual(id: string, roleId: string | null): StoredIndividual {
  const timestamp = "2024-01-01T00:00:00.000Z";
  return {
    id,
    name: `Individual ${id}`,
    notes: "",
    roleId,
    profile: createEmptyProfile(),
    profileUpdatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies StoredIndividual;
}

describe("filterRecordsByCriteria", () => {
  const linkedRoleIndividual = buildIndividual("ind-1", "role-1");
  const linkedNoRoleIndividual = buildIndividual("ind-2", null);
  const individuals = [linkedRoleIndividual, linkedNoRoleIndividual];
  const individualMap = new Map(individuals.map((individual) => [individual.id, individual]));

  const records = [
    buildRecord("record-1", linkedRoleIndividual.id, 0),
    buildRecord("record-2", linkedNoRoleIndividual.id, 1),
    buildRecord("record-3", "orphan", 2),
  ];

  const baseFilters: FilterCriteria = {
    search: "",
    individualId: "",
    linkStatus: "all",
    roleId: "",
    startDate: "",
    endDate: "",
    minConfidence: 0,
  };

  it("returns only linked records when link status is set to linked", () => {
    const result = filterRecordsByCriteria(records, individualMap, {
      ...baseFilters,
      linkStatus: "linked",
    });

    expect(result.records).toHaveLength(2);
    expect(result.records.map((record) => record.id)).toEqual(
      expect.arrayContaining(["record-1", "record-2"]),
    );
  });

  it("returns only unlinked records when link status is set to unlinked", () => {
    const result = filterRecordsByCriteria(records, individualMap, {
      ...baseFilters,
      linkStatus: "unlinked",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("record-3");
  });

  it("filters by a specific role when provided", () => {
    const result = filterRecordsByCriteria(records, individualMap, {
      ...baseFilters,
      roleId: "role-1",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("record-1");
  });

  it("includes records without a role when filtering for unassigned roles", () => {
    const result = filterRecordsByCriteria(records, individualMap, {
      ...baseFilters,
      roleId: NO_ROLE_FILTER_VALUE,
    });

    expect(result.records).toHaveLength(2);
    expect(result.records.map((record) => record.id)).toEqual(
      expect.arrayContaining(["record-2", "record-3"]),
    );
  });

  it("combines role and link status filters", () => {
    const result = filterRecordsByCriteria(records, individualMap, {
      ...baseFilters,
      linkStatus: "linked",
      roleId: NO_ROLE_FILTER_VALUE,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.id).toBe("record-2");
  });
});
