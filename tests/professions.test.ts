import { describe, expect, it } from "vitest";
import { TEMPLATE_PROFESSIONS, parseProfession, type ProfessionDefinition } from "../professions";

describe("parseProfession", () => {
  it("returns canonical tokens for recognized fragments", () => {
    const result = parseProfession("Fermier, Marchande");
    expect(result).toEqual({
      profession: "Fermier, Marchande",
      tokens: ["Agriculteur", "Marchand"],
    });
  });

  it("supports custom definitions provided by the caller", () => {
    const custom: ProfessionDefinition[] = [
      {
        label: "Ingénieur",
        aliases: ["Engineer", "Ingénieure"],
      },
    ];

    const result = parseProfession("Senior Engineer", custom);
    expect(result).toEqual({
      profession: "Senior Engineer",
      tokens: ["Ingénieur"],
    });
  });

  it("splits on semicolons and slashes", () => {
    const result = parseProfession("Docteur / Chirurgienne; Enseignante");
    expect(result).toEqual({
      profession: "Docteur / Chirurgienne; Enseignante",
      tokens: ["Médecin", "Instituteur"],
    });
  });

  it("returns empty tokens for blank input", () => {
    const result = parseProfession("   ");
    expect(result).toEqual({
      profession: "",
      tokens: [],
    });
  });

  it("avoids duplicate canonical tokens", () => {
    const result = parseProfession("Maître artisan, Artisane, Artisan");
    expect(result).toEqual({
      profession: "Maître artisan, Artisane, Artisan",
      tokens: ["Artisan"],
    });
  });

  it("ignores fragments that do not match any definition", () => {
    const result = parseProfession("Explorateur, Astronaute");
    expect(result).toEqual({
      profession: "Explorateur, Astronaute",
      tokens: [],
    });
  });

  it("uses the default template list", () => {
    const tokens = TEMPLATE_PROFESSIONS.map((definition) => definition.label);
    expect(tokens).toContain("Médecin");
  });
});
