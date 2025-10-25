import { describe, expect, it } from "vitest";
import { normalizeYear, parseApprox, parseRange } from "./dates";

describe("normalizeYear", () => {
  it("returns a year for plain digits", () => {
    expect(normalizeYear("1902")).toBe(1902);
  });

  it("extracts a year from surrounding text", () => {
    expect(normalizeYear("born in 1975")).toBe(1975);
  });

  it("returns undefined when no year is present", () => {
    expect(normalizeYear("unknown")).toBeUndefined();
  });
});

describe("parseApprox", () => {
  it("detects approximate keywords", () => {
    expect(parseApprox("ca. 1887")).toBe(true);
  });

  it("detects before/after bounds", () => {
    expect(parseApprox("before 1899")).toBe(true);
    expect(parseApprox("after 1910")).toBe(true);
  });

  it("returns false for exact years", () => {
    expect(parseApprox("1902")).toBe(false);
  });
});

describe("parseRange", () => {
  it("parses a numeric span", () => {
    expect(parseRange("1902–1975")).toEqual({ start: 1902, end: 1975 });
  });

  it("parses a before bound", () => {
    expect(parseRange("before 1899")).toEqual({ end: 1899 });
  });

  it("parses an after bound", () => {
    expect(parseRange("after 1910")).toEqual({ start: 1910 });
  });

  it("returns undefined when no range is present", () => {
    expect(parseRange("unknown")).toBeUndefined();
  });
});
