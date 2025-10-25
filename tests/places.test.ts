import { describe, expect, it } from "vitest";
import { parsePlace } from "../places";

describe("parsePlace", () => {
  it("identifies French cities, departments, and countries", () => {
    const result = parsePlace("Lyon, Rhône, France");
    expect(result).toEqual({
      place: "Lyon, Rhône, France",
      tokens: ["Lyon", "Rhône", "France"],
      matches: [
        {
          fragment: "Lyon",
          canonical: "Lyon",
          category: "city",
        },
        {
          fragment: "Rhône",
          canonical: "Rhône",
          category: "department",
        },
        {
          fragment: "France",
          canonical: "France",
          category: "country",
        },
      ],
    });
  });

  it("maps department codes to their canonical city when available", () => {
    const result = parsePlace("75, France");
    expect(result).toEqual({
      place: "75, France",
      tokens: ["Paris", "France"],
      matches: [
        {
          fragment: "75",
          canonical: "Paris",
          category: "city",
        },
        {
          fragment: "France",
          canonical: "France",
          category: "country",
        },
      ],
    });
  });

  it("recognizes regional aliases", () => {
    const result = parsePlace("Brittany, France");
    expect(result).toEqual({
      place: "Brittany, France",
      tokens: ["Bretagne", "France"],
      matches: [
        {
          fragment: "Brittany",
          canonical: "Bretagne",
          category: "region",
        },
        {
          fragment: "France",
          canonical: "France",
          category: "country",
        },
      ],
    });
  });

  it("ignores fragments that cannot be matched", () => {
    const result = parsePlace("Atlantis; France");
    expect(result).toEqual({
      place: "Atlantis; France",
      tokens: ["France"],
      matches: [
        {
          fragment: "France",
          canonical: "France",
          category: "country",
        },
      ],
    });
  });

  it("returns empty tokens for blank input", () => {
    const result = parsePlace("   ");
    expect(result).toEqual({
      place: "",
      tokens: [],
      matches: [],
    });
  });
});
