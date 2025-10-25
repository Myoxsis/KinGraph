import { describe, expect, it } from "vitest";
import { parsePlace } from "../places";

describe("parsePlace", () => {
  it("returns trimmed place and country tokens", () => {
    const result = parsePlace("Paris, France");
    expect(result).toEqual({
      place: "Paris, France",
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

  it("handles states and country abbreviations", () => {
    const result = parsePlace("Salt Lake City, Utah, USA");
    expect(result).toEqual({
      place: "Salt Lake City, Utah, USA",
      tokens: ["Utah", "United States"],
      matches: [
        {
          fragment: "Utah",
          canonical: "Utah",
          category: "state",
        },
        {
          fragment: "USA",
          canonical: "United States",
          category: "country",
        },
      ],
    });
  });

  it("preserves aliases for the same location", () => {
    const result = parsePlace("New York, NY, USA");
    expect(result).toEqual({
      place: "New York, NY, USA",
      tokens: ["New York", "United States"],
      matches: [
        {
          fragment: "New York",
          canonical: "New York",
          category: "state",
        },
        {
          fragment: "NY",
          canonical: "New York",
          category: "state",
        },
        {
          fragment: "USA",
          canonical: "United States",
          category: "country",
        },
      ],
    });
  });

  it("splits on semicolons and ignores unrecognized tokens", () => {
    const result = parsePlace("Berlin; Germany; Europe");
    expect(result).toEqual({
      place: "Berlin; Germany; Europe",
      tokens: ["Germany"],
      matches: [
        {
          fragment: "Germany",
          canonical: "Germany",
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
