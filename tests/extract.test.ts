import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

import { scoreConfidence } from "../confidence";
import { extractIndividual } from "../extract";

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("extractIndividual end-to-end", () => {
  it("parses tabular layouts with explicit labels", () => {
    const html = readFixture("table.html");
    const record = extractIndividual(html);

    expect(record.givenNames).toEqual(["John"]);
    expect(record.surname).toBe("Carter");
    expect(record.parents.father).toBe("William Carter");
    expect(record.parents.mother).toBe("Sarah Miller");
    expect(record.birth).toMatchObject({
      raw: "17 Mar 1901",
      year: 1901,
      month: 3,
      day: 17,
      approx: false,
    });
    expect(record.death).toMatchObject({
      raw: "12 Jun 1980",
      year: 1980,
      month: 6,
      day: 12,
      approx: false,
    });

    const confidence = scoreConfidence(record);
    expect(confidence.givenNames).toBeGreaterThanOrEqual(0.8);
    expect(confidence.surname).toBeGreaterThanOrEqual(0.8);
    expect(confidence["birth.date"]).toBeGreaterThanOrEqual(0.95);
    expect(confidence["death.date"]).toBeGreaterThanOrEqual(0.95);
    expect(confidence["parents.father"]).toBeGreaterThanOrEqual(0.9);
    expect(confidence["parents.mother"]).toBeGreaterThanOrEqual(0.9);
  });

  it("extracts narrative records from headings and prose", () => {
    const html = readFixture("narrative.html");
    const record = extractIndividual(html);

    expect(record.givenNames).toEqual(["John"]);
    expect(record.surname).toBe("Carter");
    expect(record.birth.year).toBe(1901);
    expect(record.death.year).toBe(1975);

    const confidence = scoreConfidence(record);
    expect(confidence.givenNames).toBe(0.9);
    expect(confidence.surname).toBe(0.9);
    expect(confidence["birth.date"]).toBeGreaterThanOrEqual(0.7);
    expect(confidence["death.date"]).toBeGreaterThanOrEqual(0.7);
  });

  it("captures maiden names and approximate birth years", () => {
    const html = readFixture("maiden.html");
    const record = extractIndividual(html);

    expect(record.givenNames).toEqual(["Elizabeth"]);
    expect(record.surname).toBe("Carter");
    expect(record.maidenName).toBe("Brown");
    expect(record.birth).toMatchObject({
      raw: "abt 1902",
      year: 1902,
      approx: true,
    });
    expect(record.death.year).toBe(1975);

    const confidence = scoreConfidence(record);
    expect(confidence.givenNames).toBeGreaterThanOrEqual(0.8);
    expect(confidence.surname).toBeGreaterThanOrEqual(0.8);
    expect(confidence.maidenName).toBeGreaterThanOrEqual(0.95);
    expect(confidence["birth.date"]).toBeGreaterThanOrEqual(0.6);
    expect(confidence["death.date"]).toBeGreaterThanOrEqual(0.7);
  });

  it("extracts complex Geneanet-style trees", () => {
    const html = readFixture("geneanet.html");
    const record = extractIndividual(html);

    expect(record.sourceUrl).toBe(
      "https://gw.geneanet.org/tlechat71?lang=en&n=renault&oc=6&p=jean+julien",
    );
    expect(record.givenNames).toEqual(["Jean", "Julien"]);
    expect(record.surname).toBe("RENAULT");
    expect(record.sex).toBe("M");
    expect(record.parents.father).toBe("Jean RENAULT");
    expect(record.parents.mother).toBe("Marie Françoise TRIGER");
    expect(record.spouses).toEqual(["Marie Françoise TOURET"]);
    expect(record.children).toEqual(["Jean RENAULT", "Marie RENAULT"]);
    expect(record.birth).toMatchObject({
      raw: "July 24, 1813 - Saint-Longis, 72295, Sarthe, Pays de la Loire, France",
      year: 1813,
      month: 7,
      day: 24,
    });
    expect(record.death).toMatchObject({
      raw: "April 13, 1880 - Saint-Rémy-du-Plain, 72317, Sarthe, Pays de la Loire, France",
      year: 1880,
      month: 4,
      day: 13,
    });

    const confidence = scoreConfidence(record);
    expect(confidence.givenNames).toBeGreaterThanOrEqual(0.8);
    expect(confidence.surname).toBeGreaterThanOrEqual(0.8);
    expect(confidence["birth.date"]).toBeGreaterThanOrEqual(0.95);
    expect(confidence["death.date"]).toBeGreaterThanOrEqual(0.95);
    expect(confidence["parents.father"]).toBeGreaterThanOrEqual(0.9);
    expect(confidence["parents.mother"]).toBeGreaterThanOrEqual(0.9);
  });
});
