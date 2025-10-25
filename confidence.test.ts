import { describe, expect, it } from "vitest";
import { scoreConfidence } from "./confidence";
import { type IndividualRecord } from "./schema";

function createBaseRecord(overrides: Partial<IndividualRecord> = {}): IndividualRecord {
  return {
    sourceHtml: overrides.sourceHtml ?? "",
    extractedAt: overrides.extractedAt ?? new Date("2024-01-01").toISOString(),
    givenNames: overrides.givenNames ?? [],
    surname: overrides.surname,
    maidenName: overrides.maidenName,
    aliases: overrides.aliases ?? [],
    birth: overrides.birth ?? {},
    death: overrides.death ?? {},
    residences: overrides.residences ?? [],
    parents: overrides.parents ?? {},
    spouses: overrides.spouses ?? [],
    children: overrides.children ?? [],
    occupation: overrides.occupation,
    religion: overrides.religion,
    notes: overrides.notes,
    provenance: overrides.provenance ?? [],
    sourceUrl: overrides.sourceUrl,
  } as IndividualRecord;
}

describe("scoreConfidence", () => {
  it("assigns high confidence to heading-derived names", () => {
    const record = createBaseRecord({
      sourceHtml: "<h1>Jane Doe (1900-1950)</h1>",
      givenNames: ["Jane"],
      surname: "Doe",
      provenance: [
        { field: "name.heading", text: "Jane Doe (1900-1950)", start: 0, end: 22 },
        { field: "givenNames", text: "Jane", start: 4, end: 8 },
        { field: "surname", text: "Doe", start: 9, end: 12 },
      ],
    });

    const scores = scoreConfidence(record);

    expect(scores.givenNames).toBe(0.9);
    expect(scores.surname).toBe(0.9);
  });

  it("uses table label heuristics when provenance lacks headings", () => {
    const record = createBaseRecord({
      givenNames: ["John"],
      surname: "Smith",
      provenance: [
        { field: "givenNames", text: "John", start: 10, end: 14 },
        { field: "surname", text: "Smith", start: 15, end: 20 },
      ],
    });

    const scores = scoreConfidence(record);

    expect(scores.givenNames).toBe(0.8);
    expect(scores.surname).toBe(0.8);
  });

  it("falls back to narrative confidence when provenance is missing", () => {
    const record = createBaseRecord({
      givenNames: ["Anna"],
      surname: "Taylor",
    });

    const scores = scoreConfidence(record);

    expect(scores.givenNames).toBe(0.6);
    expect(scores.surname).toBe(0.6);
  });

  it("scores maiden names from explicit nee differently than guesses", () => {
    const explicit = createBaseRecord({
      maidenName: "Johnson",
      sourceHtml: "Mary Smith (née Johnson)",
    });

    const guess = createBaseRecord({
      maidenName: "[Brown]",
      sourceHtml: "Mary Smith [Brown]",
    });

    expect(scoreConfidence(explicit).maidenName).toBe(0.95);
    expect(scoreConfidence(guess).maidenName).toBe(0.5);
  });

  it("computes date confidence with precision and approximation", () => {
    const record = createBaseRecord({
      birth: { year: 1900, month: 5, day: 12, approx: false },
      death: { year: 1950, approx: true },
    });

    const scores = scoreConfidence(record);

    expect(scores["birth.date"]).toBe(0.95);
    expect(scores["death.date"]).toBe(0.6);
  });

  it("reflects higher confidence for parent labels", () => {
    const labeled = createBaseRecord({
      parents: { father: "William Doe", mother: "Sarah Doe" },
      provenance: [
        { field: "parents.father", text: "William Doe", start: 0, end: 11 },
        { field: "parents.mother", text: "Sarah Doe", start: 12, end: 21 },
      ],
    });

    const narrative = createBaseRecord({
      parents: { father: "William Doe", mother: "Sarah Doe" },
    });

    expect(scoreConfidence(labeled)["parents.father"]).toBe(0.9);
    expect(scoreConfidence(narrative)["parents.father"]).toBe(0.6);
    expect(scoreConfidence(labeled)["parents.mother"]).toBe(0.9);
    expect(scoreConfidence(narrative)["parents.mother"]).toBe(0.6);
  });
});
