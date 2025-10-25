import { describe, expect, it } from "vitest";
import { parseDateFragment } from "./extract";

describe("parseDateFragment", () => {
  it("parses exact day precision dates", () => {
    const result = parseDateFragment("17 Mar 1901");
    expect(result).toMatchObject({
      year: 1901,
      month: 3,
      day: 17,
      approx: false,
    });
  });

  it("marks approximate qualifiers", () => {
    const result = parseDateFragment("abt 1902");
    expect(result).toMatchObject({
      year: 1902,
      approx: true,
    });
  });

  it("treats tilde as approximate", () => {
    const result = parseDateFragment("~1902");
    expect(result).toMatchObject({
      year: 1902,
      approx: true,
    });
  });

  it("keeps plain years as non-approximate", () => {
    const result = parseDateFragment("1902");
    expect(result).toMatchObject({
      year: 1902,
      approx: false,
    });
  });

  it("handles before/after qualifiers", () => {
    const before = parseDateFragment("before 1899");
    const after = parseDateFragment("after 1910");
    expect(before).toMatchObject({ year: 1899, approx: true });
    expect(after).toMatchObject({ year: 1910, approx: true });
  });

  it("parses quarter expressions", () => {
    const result = parseDateFragment("Q1 1887");
    expect(result).toMatchObject({ year: 1887, month: 1, approx: true });
  });

  it("recognizes circa notation", () => {
    const result = parseDateFragment("c. 1902");
    expect(result).toMatchObject({ year: 1902, approx: true });
  });
});
