import { describe, expect, it } from "vitest";
import { createEmptyProfile, normalizeProfile } from "../src/storage";

describe("normalizeProfile", () => {
  it("trims and coerces profile fields while discarding blanks", () => {
    const profile = normalizeProfile({
      givenNames: [" Anna ", "", "Beth"],
      surname: " Smith ",
      maidenName: "  Johnson  ",
      aliases: [" Annie ", " "],
      sex: "F",
      birth: {
        raw: "  Born in Boston  ",
        year: "1901" as unknown as number,
        month: "2" as unknown as number,
        approx: true,
        place: " Boston ",
      } as unknown,
      death: {
        year: 1975,
        approx: false,
        place: "  Chicago ",
      } as unknown,
      residences: [
        { raw: "1910 census", year: "1910" } as unknown,
        { place: " Chicago ", extra: "ignored" } as unknown,
        null as unknown,
      ] as unknown,
      parents: {
        father: " John Smith ",
        mother: " Mary Smith ",
      } as unknown,
      spouses: [" John Doe ", " "] as unknown,
      children: [" Anna Jr. "] as unknown,
      siblings: [" Bob ", ""] as unknown,
      occupation: " Teacher ",
      religion: " Catholic ",
      notes: "  Loves gardening  ",
    });

    expect(profile.givenNames).toEqual(["Anna", "Beth"]);
    expect(profile.surname).toBe("Smith");
    expect(profile.maidenName).toBe("Johnson");
    expect(profile.aliases).toEqual(["Annie"]);
    expect(profile.sex).toBe("F");
    expect(profile.birth).toEqual({
      raw: "Born in Boston",
      year: 1901,
      month: 2,
      day: undefined,
      approx: true,
      place: "Boston",
    });
    expect(profile.death).toEqual({
      raw: undefined,
      year: 1975,
      month: undefined,
      day: undefined,
      approx: false,
      place: "Chicago",
    });
    expect(profile.residences).toEqual([
      { raw: "1910 census", year: 1910, place: undefined },
      { raw: undefined, year: undefined, place: "Chicago" },
    ]);
    expect(profile.parents).toEqual({ father: "John Smith", mother: "Mary Smith" });
    expect(profile.spouses).toEqual(["John Doe"]);
    expect(profile.children).toEqual(["Anna Jr."]);
    expect(profile.siblings).toEqual(["Bob"]);
    expect(profile.occupation).toBe("Teacher");
    expect(profile.religion).toBe("Catholic");
    expect(profile.notes).toBe("Loves gardening");
  });

  it("returns an empty profile when no input is provided", () => {
    const profile = normalizeProfile(undefined);
    expect(profile).toEqual(createEmptyProfile());
  });

  it("drops invalid values that cannot be normalized", () => {
    const profile = normalizeProfile({
      givenNames: "Not an array" as unknown,
      aliases: ["", "  "],
      sex: "X" as unknown,
      birth: {
        raw: "   ",
        year: Number.NaN,
        month: "not a month",
        day: null,
        approx: "maybe",
        place: "   ",
      } as unknown,
      death: {} as unknown,
      residences: [
        {},
        { raw: "", year: undefined, place: "" },
      ] as unknown,
      parents: {
        father: 123,
        mother: null,
      } as unknown,
      spouses: "Spouse" as unknown,
      children: 42 as unknown,
      siblings: null as unknown,
      occupation: "   ",
      religion: null as unknown,
      notes: "   ",
    });

    expect(profile.givenNames).toEqual([]);
    expect(profile.aliases).toEqual([]);
    expect(profile.sex).toBeUndefined();
    expect(profile.birth).toEqual({
      raw: undefined,
      year: undefined,
      month: undefined,
      day: undefined,
      approx: undefined,
      place: undefined,
    });
    expect(profile.residences).toEqual([]);
    expect(profile.parents).toEqual({ father: undefined, mother: undefined });
    expect(profile.spouses).toEqual([]);
    expect(profile.children).toEqual([]);
    expect(profile.siblings).toEqual([]);
    expect(profile.occupation).toBeUndefined();
    expect(profile.religion).toBeUndefined();
    expect(profile.notes).toBeUndefined();
  });
});
