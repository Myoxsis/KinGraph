import { load } from "cheerio";
import * as chrono from "chrono-node";
import { IndividualRecordSchema, type IndividualRecord } from "./schema";
import LABELS, { type LabelKey } from "./labels";

type ProvenanceEntry = IndividualRecord["provenance"][number];

function createRecordSkeleton(html: string): IndividualRecord {
  return {
    sourceHtml: html,
    extractedAt: new Date().toISOString(),
    givenNames: [],
    aliases: [],
    birth: {},
    death: {},
    residences: [],
    parents: {},
    spouses: [],
    children: [],
    provenance: [],
  };
}

function pushUnique(target: string[], value: string | undefined) {
  if (!value) {
    return;
  }

  if (!target.includes(value)) {
    target.push(value);
  }
}

function addProvenance(record: IndividualRecord, html: string, field: string, text: string) {
  const start = html.indexOf(text);
  if (start === -1) {
    return;
  }

  const entry: ProvenanceEntry = {
    field,
    text,
    start,
    end: start + text.length,
  };

  record.provenance.push(entry);
}

function normalizeSex(value: string): "M" | "F" | "U" | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (/female|\bf\b|woman/.test(normalized)) {
    return "F";
  }

  if (/male|\bm\b|man/.test(normalized)) {
    return "M";
  }

  if (/unknown|undetermined|not\s+stated/.test(normalized)) {
    return "U";
  }

  return undefined;
}

const APPROX_KEYWORD_TEST = /\b(?:abt|about|approx(?:\.?|imately)?|around|circa|ca\.?)\b|~/i;
const APPROX_KEYWORD_REPLACE = /\b(?:abt|about|approx(?:\.?|imately)?|around|circa|ca\.?)\b|~/gi;
const C_PREFIX_APPROX = /\bc[.\s]*(?=\d)/i;

const C_PREFIX_PATTERN = /\bc[.\s]*(?=\d)/gi;

export interface ParsedDateFragment {
  raw: string;
  year?: number;
  month?: number;
  day?: number;
  approx: boolean;
}

export interface ParsedName {
  givenNames: string[];
  surname?: string;
  maidenName?: string;
  aliases: string[];
}

const SUFFIX_PATTERN = /(,\s*)?(Jr|Sr|II|III|IV)\.?$/i;
const MAIDEN_REGEX = /\b(?:née|nee)\s+([A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*)*)/i;

export function parseDateFragment(text: string): ParsedDateFragment {
  const raw = text.trim();
  if (!raw) {
    return { raw, approx: false };
  }

  let approx = APPROX_KEYWORD_TEST.test(raw) || C_PREFIX_APPROX.test(raw) || /\b(before|after)\b/i.test(raw);

  const quarterMatch = raw.match(/\bQ([1-4])\s+(\d{4})\b/i);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1]);
    const year = Number(quarterMatch[2]);
    return {
      raw,
      approx: true,
      year,
      month: (quarter - 1) * 3 + 1,
    };
  }

  const boundMatch = raw.match(/\b(before|after)\s+(\d{4})\b/i);
  if (boundMatch) {
    const year = Number(boundMatch[2]);
    return {
      raw,
      approx: true,
      year,
    };
  }

  const cleaned = raw
    .replace(APPROX_KEYWORD_REPLACE, "")
    .replace(C_PREFIX_PATTERN, "")
    .replace(/[~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const results = chrono.parse(cleaned, new Date(), { forwardDate: false });
  if (results.length) {
    const result = results[0];
    const components = result.start;
    const known = components?.knownValues ?? {};
    const implied = components?.impliedValues ?? {};
    const year = known.year ?? implied.year;
    const month = known.month;
    const day = known.day;

    if (year !== undefined || month !== undefined || day !== undefined) {
      const onlyYear = year !== undefined && month === undefined && day === undefined;
      if (onlyYear && !approx) {
        approx = false;
      }

      return {
        raw,
        approx,
        year,
        month,
        day,
      };
    }
  }

  const yearMatch = raw.match(/(\d{4})/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const approxFromText =
      APPROX_KEYWORD_TEST.test(raw) || C_PREFIX_APPROX.test(raw) || /\b(before|after)\b/i.test(raw);
    return {
      raw,
      year,
      approx: approxFromText,
    };
  }

  return { raw, approx: false };
}

export function parseName(full: string): ParsedName {
  const aliases: string[] = [];
  let maidenName: string | undefined;

  if (!full?.trim()) {
    return { givenNames: [], aliases };
  }

  let working = full.trim();

  // Extract nicknames enclosed in quotes.
  working = working.replace(/"([^"\n]+)"/g, (_, alias: string) => {
    pushUnique(aliases, alias.trim());
    return "";
  });

  // Extract parenthetical aliases or maiden names.
  working = working.replace(/\(([^)]+)\)/g, (_, inner: string) => {
    const content = inner.trim();
    if (!content) {
      return "";
    }

    if (/^(?:née|nee)\b/i.test(content)) {
      const extracted = content.replace(/^(?:née|nee)\b/i, "").trim();
      if (extracted) {
        maidenName = extracted;
      }
    } else {
      pushUnique(aliases, content);
    }

    return "";
  });

  // Extract maiden names that are not wrapped in parentheses.
  const maidenMatch = working.match(MAIDEN_REGEX);
  if (maidenMatch) {
    maidenName = maidenMatch[1].trim();
    working = working.replace(MAIDEN_REGEX, "").trim();
  }

  // Remove common suffixes.
  while (SUFFIX_PATTERN.test(working)) {
    working = working.replace(SUFFIX_PATTERN, "").trim();
  }

  working = working.replace(/\s+/g, " ").trim();

  const parts = working ? working.split(/\s+/) : [];

  let surname: string | undefined;
  let givenNames: string[] = [];

  if (parts.length > 1) {
    surname = parts.pop();
    givenNames = parts;
  } else if (parts.length === 1) {
    givenNames = parts;
  }

  return {
    givenNames,
    surname,
    maidenName,
    aliases,
  };
}

function extractFullNameFromHeadings(html: string, record: IndividualRecord, $: ReturnType<typeof load>) {
  const headingSelector = "h1, h2, h3";
  const fullNamePattern = /([A-Z][^()\n]+?)\s*\((\d{4})\s*[\u2013\-]\s*(\d{4})\)/;

  let matchedText: string | undefined;
  let matchedName: string | undefined;
  let birthYear: number | undefined;
  let deathYear: number | undefined;

  $(headingSelector)
    .add($("p").first())
    .each((_, el) => {
      const text = $(el).text().trim();
      if (!text) {
        return;
      }

      const match = text.match(fullNamePattern);
      if (match) {
        matchedText = match[0];
        matchedName = match[1].trim();
        birthYear = Number(match[2]);
        deathYear = Number(match[3]);
        return false;
      }
    });

  if (!matchedName) {
    return;
  }

  const maidenMatch = matchedName.match(/\bn[eé]e\s+([A-Za-z'’\-]+)/i);
  if (maidenMatch) {
    record.maidenName = maidenMatch[1];
    matchedName = matchedName.replace(maidenMatch[0], "").trim();
    addProvenance(record, html, "maidenName", maidenMatch[1]);
  }

  const nameTokens = matchedName.split(/\s+/).filter(Boolean);
  if (nameTokens.length > 0) {
    const surname = nameTokens[nameTokens.length - 1];
    const given = nameTokens.slice(0, -1);

    if (!record.surname) {
      record.surname = surname;
      addProvenance(record, html, "surname", surname);
    }

    if (given.length > 0) {
      record.givenNames = given;
      addProvenance(record, html, "givenNames", given.join(" "));
    }
  }

  if (birthYear && !record.birth.year) {
    record.birth.year = birthYear;
    addProvenance(record, html, "birth.year", String(birthYear));
  }

  if (deathYear && !record.death.year) {
    record.death.year = deathYear;
    addProvenance(record, html, "death.year", String(deathYear));
  }

  if (matchedText) {
    addProvenance(record, html, "name.heading", matchedText);
  }
}

function normalizeForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function labelMatches(label: string, key: LabelKey) {
  const normalizedLabel = normalizeForComparison(label);
  return LABELS[key].some((synonym) => {
    const normalizedSynonym = normalizeForComparison(synonym);
    return normalizedSynonym && normalizedLabel.includes(normalizedSynonym);
  });
}

function handleLabelValue(
  html: string,
  label: string,
  value: string,
  record: IndividualRecord,
  provenanceText: string
) {
  const normalizedLabel = normalizeForComparison(label);

  if (labelMatches(label, "maiden")) {
    record.maidenName = value.trim();
    addProvenance(record, html, "maidenName", value.trim());
  } else if (labelMatches(label, "surname")) {
    record.surname = value.trim();
    addProvenance(record, html, "surname", value.trim());
  } else if (labelMatches(label, "given")) {
    const parts = value.split(/[,;]+|\s+/).map((part) => part.trim()).filter(Boolean);
    record.givenNames = parts;
    addProvenance(record, html, "givenNames", value.trim());
  } else if (labelMatches(label, "name")) {
    const trimmed = value.trim();
    const maidenMatch = trimmed.match(/\bn[eé]e\s+([A-Za-z'’\-]+)/i);
    if (maidenMatch) {
      record.maidenName = maidenMatch[1];
      addProvenance(record, html, "maidenName", maidenMatch[1]);
    }

    const cleaned = trimmed
      .replace(/\bn[eé]e\s+[A-Za-z'’\-]+/i, "")
      .replace(/\(\s*\)/g, "")
      .trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      record.surname = tokens[tokens.length - 1];
      addProvenance(record, html, "surname", tokens[tokens.length - 1]);
      record.givenNames = tokens.slice(0, -1);
      if (record.givenNames.length) {
        addProvenance(record, html, "givenNames", record.givenNames.join(" "));
      }
    }
  } else if (/\b(sex|gender)\b/.test(normalizedLabel)) {
    const normalizedSex = normalizeSex(value);
    if (normalizedSex) {
      record.sex = normalizedSex;
      addProvenance(record, html, "sex", value.trim());
    }
  } else if (labelMatches(label, "birth")) {
    record.birth.raw = value.trim();
    const parsed = parseDateFragment(value);
    if (parsed.year !== undefined) {
      record.birth.year = parsed.year;
    }
    if (parsed.month !== undefined) {
      record.birth.month = parsed.month;
    }
    if (parsed.day !== undefined) {
      record.birth.day = parsed.day;
    }
    if (parsed.year !== undefined || parsed.month !== undefined || parsed.day !== undefined) {
      record.birth.approx = parsed.approx;
    }
    addProvenance(record, html, "birth.raw", provenanceText.trim());
  } else if (labelMatches(label, "death")) {
    record.death.raw = value.trim();
    const parsed = parseDateFragment(value);
    if (parsed.year !== undefined) {
      record.death.year = parsed.year;
    }
    if (parsed.month !== undefined) {
      record.death.month = parsed.month;
    }
    if (parsed.day !== undefined) {
      record.death.day = parsed.day;
    }
    if (parsed.year !== undefined || parsed.month !== undefined || parsed.day !== undefined) {
      record.death.approx = parsed.approx;
    }
    addProvenance(record, html, "death.raw", provenanceText.trim());
  } else if (labelMatches(label, "residence")) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    entries.forEach((entry) => {
      const parsed = parseDateFragment(entry);
      record.residences.push({ raw: entry, year: parsed.year });
      addProvenance(record, html, `residences[${record.residences.length - 1}].raw`, entry);
    });
  } else if (labelMatches(label, "father")) {
    record.parents.father = value.trim();
    addProvenance(record, html, "parents.father", value.trim());
  } else if (labelMatches(label, "mother")) {
    record.parents.mother = value.trim();
    addProvenance(record, html, "parents.mother", value.trim());
  } else if (labelMatches(label, "spouse")) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    entries.forEach((entry) => {
      pushUnique(record.spouses, entry);
      addProvenance(record, html, "spouses", entry);
    });
  } else if (labelMatches(label, "child")) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    entries.forEach((entry) => {
      pushUnique(record.children, entry);
      addProvenance(record, html, "children", entry);
    });
  } else if (labelMatches(label, "occupation")) {
    record.occupation = value.trim();
    addProvenance(record, html, "occupation", value.trim());
  } else if (labelMatches(label, "religion")) {
    record.religion = value.trim();
    addProvenance(record, html, "religion", value.trim());
  } else if (/\bnotes\b/.test(normalizedLabel)) {
    record.notes = value.trim();
    addProvenance(record, html, "notes", provenanceText.trim());
  }
}

function extractLabelValuePairs(html: string, record: IndividualRecord, $: ReturnType<typeof load>) {
  const processed = new Set<string>();

  const processPair = (label: string, value: string, provenanceText: string) => {
    if (!label || !value) {
      return;
    }
    const key = `${label.trim().toLowerCase()}::${value.trim()}`;
    if (processed.has(key)) {
      return;
    }
    processed.add(key);
    handleLabelValue(html, label, value.trim(), record, provenanceText);
  };

  $("*").each((_, element) => {
    const text = $(element)
      .contents()
      .filter((_, node) => node.type === "text")
      .map((_, node) => (node.data ?? "").trim())
      .get()
      .join(" ")
      .trim();

    if (!text || !text.includes(":")) {
      return;
    }

    const segments = text
      .split(/\r?\n/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    segments.forEach((segment) => {
      if (!segment.includes(":")) {
        return;
      }
      const normalizedSegment = segment.replace(/\s+/g, " ");
      const [label, rawValue] = normalizedSegment.split(/:(.+)/).slice(0, 2) as [string, string];
      if (!label || !rawValue) {
        return;
      }

      processPair(label, rawValue, segment);
    });
  });

  $("tr").each((_, row) => {
    const cells = $(row).children("th,td");
    if (cells.length < 2) {
      return;
    }

    const label = $(cells[0]).text().trim();
    const value = cells
      .slice(1)
      .map((_, cell) => $(cell).text().trim())
      .get()
      .filter(Boolean)
      .join(" ");

    if (label && value) {
      processPair(label, value, value);
    }
  });

  $("dt").each((_, dt) => {
    const label = $(dt).text().trim();
    const dd = $(dt).next("dd");
    if (!label || !dd.length) {
      return;
    }

    const value = dd
      .map((_, node) => $(node).text().trim())
      .get()
      .filter(Boolean)
      .join(" ");

    if (value) {
      processPair(label, value, value);
    }
  });
}

export function extractIndividual(html: string): IndividualRecord {
  const $ = load(html);
  const record = createRecordSkeleton(html);

  extractFullNameFromHeadings(html, record, $);
  extractLabelValuePairs(html, record, $);

  if (!record.givenNames.length && record.surname) {
    const nameFromSurname = record.surname;
    const start = html.indexOf(nameFromSurname);
    if (start !== -1) {
      addProvenance(record, html, "surname", nameFromSurname);
    }
  }

  const validated = IndividualRecordSchema.parse(record);
  return validated;
}
