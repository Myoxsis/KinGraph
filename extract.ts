import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import * as chrono from "chrono-node";
import { IndividualRecordSchema, type IndividualRecord } from "./schema";
import LABELS, { type LabelKey } from "./labels";

type ProvenanceEntry = IndividualRecord["provenance"][number];

interface Range {
  start: number;
  end: number;
}

type ProvenanceSource =
  | Range
  | {
      text: string;
      context?: Range;
    };

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

function clampRange(range: Range, htmlLength: number): Range | undefined {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return undefined;
  }
  const start = Math.max(0, Math.min(htmlLength, Math.floor(range.start)));
  const end = Math.max(start, Math.min(htmlLength, Math.floor(range.end)));
  if (end <= start) {
    return undefined;
  }
  return { start, end };
}

function findRangeByText(html: string, text: string, context?: Range): Range | undefined {
  if (!text) {
    return undefined;
  }

  const normalizedContext = context ? clampRange(context, html.length) : undefined;
  if (normalizedContext) {
    const snippet = html.slice(normalizedContext.start, normalizedContext.end);
    const relativeIndex = snippet.indexOf(text);
    if (relativeIndex !== -1) {
      const start = normalizedContext.start + relativeIndex;
      return { start, end: start + text.length };
    }
  }

  const start = html.indexOf(text);
  if (start === -1) {
    return undefined;
  }

  return { start, end: start + text.length };
}

function addProvenance(
  record: IndividualRecord,
  html: string,
  field: string,
  source: ProvenanceSource,
) {
  let range: Range | undefined;
  if ("start" in source) {
    range = clampRange(source, html.length);
  } else {
    range = findRangeByText(html, source.text, source.context);
  }

  if (!range) {
    return;
  }

  const text = html.slice(range.start, range.end);
  if (!text) {
    return;
  }

const entry: ProvenanceEntry = {
  field,
  text,
  start: range.start,
  end: range.end,
};

record.provenance.push(entry);
}

function getLocationRange(node: AnyNode | null | undefined): Range | undefined {
  const location = (node as unknown as { sourceCodeLocation?: { startOffset?: number; endOffset?: number } })
    ?.sourceCodeLocation;
  if (!location) {
    return undefined;
  }
  const { startOffset, endOffset } = location;
  if (typeof startOffset !== "number" || typeof endOffset !== "number" || endOffset <= startOffset) {
    return undefined;
  }
  return { start: startOffset, end: endOffset };
}

function getInnerRange(node: AnyNode | null | undefined): Range | undefined {
  const location = (node as unknown as {
    sourceCodeLocation?: {
      startOffset?: number;
      endOffset?: number;
      startTag?: { endOffset?: number };
      endTag?: { startOffset?: number };
    };
  })?.sourceCodeLocation;
  if (!location) {
    return undefined;
  }
  const start = location.startTag?.endOffset ?? location.startOffset;
  const end = location.endTag?.startOffset ?? location.endOffset;
  if (typeof start !== "number" || typeof end !== "number" || end <= start) {
    return undefined;
  }
  return { start, end };
}

function findFirstTextNode(node: AnyNode | null | undefined): AnyNode | undefined {
  if (!node) {
    return undefined;
  }
  if ((node as { type?: string }).type === "text") {
    return node;
  }
  const children = (node as { childNodes?: AnyNode[] }).childNodes ?? [];
  for (const child of children) {
    const result = findFirstTextNode(child);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function findLastTextNode(node: AnyNode | null | undefined): AnyNode | undefined {
  if (!node) {
    return undefined;
  }
  if ((node as { type?: string }).type === "text") {
    return node;
  }
  const children = (node as { childNodes?: AnyNode[] }).childNodes ?? [];
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const result = findLastTextNode(children[index]);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function getTextRangeFromNode(node: AnyNode | null | undefined): Range | undefined {
  const first = findFirstTextNode(node);
  const last = findLastTextNode(node);
  if (!first || !last) {
    return undefined;
  }
  const startRange = getLocationRange(first);
  const endRange = getLocationRange(last);
  if (!startRange || !endRange) {
    return undefined;
  }
  return { start: startRange.start, end: endRange.end };
}

function mergeRanges(ranges: (Range | undefined)[]): Range | undefined {
  const valid = ranges.filter((range): range is Range => Boolean(range));
  if (!valid.length) {
    return undefined;
  }
  const start = Math.min(...valid.map((range) => range.start));
  const end = Math.max(...valid.map((range) => range.end));
  if (end <= start) {
    return undefined;
  }
  return { start, end };
}

function traverseNodes(node: AnyNode | null | undefined, visit: (node: AnyNode) => void) {
  if (!node) {
    return;
  }
  visit(node);
  const children = (node as { childNodes?: AnyNode[] }).childNodes ?? [];
  for (const child of children) {
    traverseNodes(child, visit);
  }
}

function getRangeForNodes(nodes: AnyNode[]): Range | undefined {
  return mergeRanges(
    nodes.map((node) => getTextRangeFromNode(node) ?? getInnerRange(node) ?? getLocationRange(node)),
  );
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
    const getComponent = (component: chrono.Component): number | undefined => {
      const value = components?.get(component);
      return typeof value === "number" ? value : undefined;
    };
    const year = getComponent("year");
    const month = components?.isCertain("month") ? getComponent("month") : undefined;
    const day = components?.isCertain("day") ? getComponent("day") : undefined;

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

type LifeEventType = "birth" | "death";

interface GenewebLifeEvent {
  type: LifeEventType;
  raw: string;
  date: string;
}

function parseGenewebLifeEvent(text: string): GenewebLifeEvent | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  const birthMatch = normalized.match(/^(Born|Baptized|Christened)\s+(.*)$/i);
  const deathMatch = normalized.match(/^(Deceased|Died)\s+(.*)$/i);

  let type: LifeEventType | undefined;
  let remainder: string | undefined;

  if (birthMatch) {
    type = "birth";
    remainder = birthMatch[2];
  } else if (deathMatch) {
    type = "death";
    remainder = deathMatch[2];
  }

  if (!type || !remainder) {
    return undefined;
  }

  let cleaned = remainder.trim();
  if (!cleaned) {
    return undefined;
  }

  cleaned = cleaned.replace(/,\s*aged[^,]*$/i, "").trim();

  const [datePart] = cleaned.split(/\s+-\s+/);
  const date = (datePart ?? "").trim();

  if (!date) {
    return undefined;
  }

  return {
    type,
    raw: cleaned,
    date,
  };
}

function extractGenewebProfile(html: string, record: IndividualRecord, $: CheerioAPI) {
  const personSection = $("#perso");
  if (!personSection.length) {
    return;
  }

  const nameElement = personSection.find("#person-title h1").first();
  if (nameElement.length) {
    const nameNode = nameElement.get(0) as AnyNode | undefined;
    const nameRange = nameNode
      ? getTextRangeFromNode(nameNode) ?? getInnerRange(nameNode) ?? getLocationRange(nameNode)
      : undefined;

    const cloned = nameElement.clone();
    cloned.find("script, style, img, svg").remove();
    const nameText = cloned
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const addNameContextProvenance = (field: string, text: string) => {
      if (!text) {
        return;
      }
      if (nameRange) {
        addProvenance(record, html, field, { text, context: nameRange });
      } else {
        addProvenance(record, html, field, { text });
      }
    };

    if (nameText) {
      const parsed = parseName(nameText);
      if (parsed.givenNames.length && !record.givenNames.length) {
        record.givenNames = parsed.givenNames;
        addNameContextProvenance("givenNames", parsed.givenNames.join(" "));
      }
      if (parsed.surname && !record.surname) {
        record.surname = parsed.surname;
        addNameContextProvenance("surname", parsed.surname);
      }
      if (parsed.maidenName && !record.maidenName) {
        record.maidenName = parsed.maidenName;
        addNameContextProvenance("maidenName", parsed.maidenName);
      }
      parsed.aliases.forEach((alias) => {
        pushUnique(record.aliases, alias);
        addNameContextProvenance("aliases", alias);
      });
    }

    if (!record.sex) {
      const sexIndicator = nameElement.find("img[alt], img[title], img[src]").first();
      if (sexIndicator.length) {
        const sexNode = sexIndicator.get(0) as AnyNode | undefined;
        let descriptor = sexIndicator.attr("alt") ?? sexIndicator.attr("title") ?? "";
        if (!descriptor) {
          const src = sexIndicator.attr("src") ?? "";
          if (/female/i.test(src)) {
            descriptor = "female";
          } else if (/male/i.test(src)) {
            descriptor = "male";
          }
        }
        const normalized = descriptor ? normalizeSex(descriptor) : undefined;
        if (normalized) {
          record.sex = normalized;
          const sexRange = sexNode
            ? getTextRangeFromNode(sexNode) ?? getInnerRange(sexNode) ?? getLocationRange(sexNode)
            : undefined;
          if (sexRange) {
            addProvenance(record, html, "sex", sexRange);
          }
        }
      }
    }

    const detailsList = nameElement.closest("#person-title").nextAll("ul").first();
    if (detailsList.length) {
      detailsList.children("li").each((_, listItem) => {
        const text = $(listItem).text();
        const event = parseGenewebLifeEvent(text);
        if (!event) {
          return;
        }

        const listNode = listItem as unknown as AnyNode;
        const range = getTextRangeFromNode(listNode) ?? getInnerRange(listNode) ?? getLocationRange(listNode);
        const parsed = parseDateFragment(event.date);
        const target = event.type === "birth" ? record.birth : record.death;
        const fieldPrefix = event.type;

        if (event.raw && !target.raw) {
          target.raw = event.raw;
          if (range) {
            addProvenance(record, html, `${fieldPrefix}.raw`, range);
          }
        }
        if (parsed.year !== undefined && target.year === undefined) {
          target.year = parsed.year;
          if (range) {
            addProvenance(record, html, `${fieldPrefix}.year`, range);
          }
        }
        if (parsed.month !== undefined && target.month === undefined) {
          target.month = parsed.month;
          if (range) {
            addProvenance(record, html, `${fieldPrefix}.month`, range);
          }
        }
        if (parsed.day !== undefined && target.day === undefined) {
          target.day = parsed.day;
          if (range) {
            addProvenance(record, html, `${fieldPrefix}.day`, range);
          }
        }
        if (parsed.approx && !target.approx) {
          target.approx = true;
          if (range) {
            addProvenance(record, html, `${fieldPrefix}.approx`, range);
          }
        }
      });
    }
  }

  const headingMatches = (headingNode: AnyNode, keyword: string) => {
    const text = $(headingNode as unknown as AnyNode)
      .text()
      .replace(/\s+/g, " ")
      .trim();
    return normalizeForComparison(text).includes(normalizeForComparison(keyword));
  };

  const parentsHeading = personSection
    .find("h2")
    .filter((_, heading) => headingMatches(heading as unknown as AnyNode, "Parents"))
    .first();

  if (parentsHeading.length) {
    const parentsList = parentsHeading.nextAll("ul").first();
    const parentItems = parentsList.children("li");

    const assignParent = (index: number, field: "father" | "mother") => {
      if (record.parents[field]) {
        return;
      }
      const item = parentItems.eq(index);
      if (!item.length) {
        return;
      }
      const anchor = item.children("a").first().length ? item.children("a").first() : item.find("a").first();
      const nameText = anchor.length
        ? anchor
            .text()
            .replace(/\s+/g, " ")
            .trim()
        : item
            .text()
            .replace(/\s+/g, " ")
            .trim();
      if (!nameText) {
        return;
      }
      record.parents[field] = nameText;
      const node = (anchor.length ? anchor.get(0) : item.get(0)) as AnyNode | undefined;
      const range = node
        ? getTextRangeFromNode(node) ?? getInnerRange(node) ?? getLocationRange(node)
        : undefined;
      if (range) {
        addProvenance(record, html, `parents.${field}`, range);
      }
    };

    assignParent(0, "father");
    assignParent(1, "mother");
  }

  const spousesHeading = personSection
    .find("h2")
    .filter((_, heading) => headingMatches(heading as unknown as AnyNode, "Spouses and children"))
    .first();

  if (spousesHeading.length) {
    const unionsList = spousesHeading.nextAll("ul").first();
    unionsList.children("li").each((_, unionItem) => {
      const unionNode = unionItem as unknown as AnyNode;
      const unionRange =
        getTextRangeFromNode(unionNode) ?? getInnerRange(unionNode) ?? getLocationRange(unionNode);

      const spouseAnchor = $(unionItem).children("a").first().length
        ? $(unionItem).children("a").first()
        : $(unionItem).find("a").first();
      const spouseName = spouseAnchor
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (spouseName) {
        pushUnique(record.spouses, spouseName);
        const spouseNode = spouseAnchor.get(0) as AnyNode | undefined;
        const range = spouseNode
          ? getTextRangeFromNode(spouseNode) ?? getInnerRange(spouseNode) ?? getLocationRange(spouseNode)
          : unionRange;
        if (range) {
          addProvenance(record, html, "spouses", range);
        }
      }

      const childrenList = $(unionItem).children("ul").first();
      childrenList.children("li").each((_, childItem) => {
        const childAnchor = $(childItem).find("a").first();
        const childName = childAnchor
          .text()
          .replace(/\s+/g, " ")
          .trim();
        if (!childName) {
          return;
        }
        pushUnique(record.children, childName);
        const childNode = childAnchor.get(0) as AnyNode | undefined;
        const childRange = childNode
          ? getTextRangeFromNode(childNode) ?? getInnerRange(childNode) ?? getLocationRange(childNode)
          : unionRange;
        if (childRange) {
          addProvenance(record, html, "children", childRange);
        }
      });
    });
  }
}

function extractFullNameFromHeadings(html: string, record: IndividualRecord, $: ReturnType<typeof load>) {
  const headingSelector = "h1, h2, h3";
  const fullNamePattern = /([A-Z][^()\n]+?)\s*\((\d{4})\s*[\u2013\-]\s*(\d{4})\)/;

  let matchedText: string | undefined;
  let matchedName: string | undefined;
  let birthYear: number | undefined;
  let deathYear: number | undefined;
  let matchedNode: AnyNode | undefined;

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
        matchedNode = el as unknown as AnyNode;
        return false;
      }
    });

  if (!matchedName) {
    return;
  }

  const headingContext = matchedNode ? getTextRangeFromNode(matchedNode) ?? getInnerRange(matchedNode) : undefined;
  const matchedRange = matchedText ? findRangeByText(html, matchedText, headingContext) ?? headingContext : headingContext;

  const maidenMatch = matchedName.match(/\bn[eé]e\s+([A-Za-z'’\-]+)/i);
  if (maidenMatch && !record.maidenName) {
    record.maidenName = maidenMatch[1];
    matchedName = matchedName.replace(maidenMatch[0], "").trim();
    addProvenance(record, html, "maidenName", { text: maidenMatch[1], context: matchedRange });
  }

  const nameTokens = matchedName.split(/\s+/).filter(Boolean);
  if (nameTokens.length > 0) {
    const surname = nameTokens[nameTokens.length - 1];
    const given = nameTokens.slice(0, -1);

    if (!record.surname) {
      record.surname = surname;
      addProvenance(record, html, "surname", { text: surname, context: matchedRange });
    }

    if (given.length > 0 && !record.givenNames.length) {
      record.givenNames = given;
      addProvenance(record, html, "givenNames", { text: given.join(" "), context: matchedRange });
    }
  }

  if (birthYear && !record.birth.year) {
    record.birth.year = birthYear;
    addProvenance(record, html, "birth.year", { text: String(birthYear), context: matchedRange });
  }

  if (deathYear && !record.death.year) {
    record.death.year = deathYear;
    addProvenance(record, html, "death.year", { text: String(deathYear), context: matchedRange });
  }

  if (matchedText) {
    if (matchedRange) {
      addProvenance(record, html, "name.heading", matchedRange);
    } else {
      addProvenance(record, html, "name.heading", { text: matchedText });
    }
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
  provenance: { context?: Range; valueRange?: Range },
) {
  const normalizedLabel = normalizeForComparison(label);
  const trimmedValue = value.trim();
  const contextRange = provenance.valueRange ?? provenance.context;
  const valueSource: ProvenanceSource =
    provenance.valueRange ?? (trimmedValue ? { text: trimmedValue, context: contextRange } : { text: value });
  const contextualText = (text: string): ProvenanceSource => {
    if (!text) {
      return { text };
    }
    if (provenance.valueRange) {
      return { text, context: provenance.valueRange };
    }
    if (contextRange) {
      return { text, context: contextRange };
    }
    return { text };
  };

  if (labelMatches(label, "maiden")) {
    record.maidenName = trimmedValue;
    addProvenance(record, html, "maidenName", valueSource);
  } else if (labelMatches(label, "surname")) {
    record.surname = trimmedValue;
    addProvenance(record, html, "surname", valueSource);
  } else if (labelMatches(label, "given")) {
    const parts = value.split(/[,;]+|\s+/).map((part) => part.trim()).filter(Boolean);
    record.givenNames = parts;
    if (parts.length) {
      addProvenance(record, html, "givenNames", valueSource);
    }
  } else if (labelMatches(label, "name")) {
    const trimmed = trimmedValue;
    const maidenMatch = trimmed.match(/\bn[eé]e\s+([A-Za-z'’\-]+)/i);
    if (maidenMatch) {
      record.maidenName = maidenMatch[1];
      addProvenance(record, html, "maidenName", contextualText(maidenMatch[1]));
    }

    const cleaned = trimmed
      .replace(/\bn[eé]e\s+[A-Za-z'’\-]+/i, "")
      .replace(/\(\s*\)/g, "")
      .trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      record.surname = tokens[tokens.length - 1];
      addProvenance(record, html, "surname", contextualText(tokens[tokens.length - 1]));
      record.givenNames = tokens.slice(0, -1);
      if (record.givenNames.length) {
        addProvenance(record, html, "givenNames", contextualText(record.givenNames.join(" ")));
      }
    }
  } else if (/\b(sex|gender)\b/.test(normalizedLabel)) {
    const normalizedSex = normalizeSex(value);
    if (normalizedSex) {
      record.sex = normalizedSex;
      addProvenance(record, html, "sex", valueSource);
    }
  } else if (labelMatches(label, "birth")) {
    record.birth.raw = trimmedValue;
    const parsed = parseDateFragment(value);
    if (parsed.year !== undefined) {
      record.birth.year = parsed.year;
      addProvenance(record, html, "birth.year", contextualText(String(parsed.year)));
    }
    if (parsed.month !== undefined) {
      record.birth.month = parsed.month;
      addProvenance(record, html, "birth.month", contextualText(String(parsed.month)));
    }
    if (parsed.day !== undefined) {
      record.birth.day = parsed.day;
      addProvenance(record, html, "birth.day", contextualText(String(parsed.day)));
    }
    if (parsed.year !== undefined || parsed.month !== undefined || parsed.day !== undefined) {
      record.birth.approx = parsed.approx;
      addProvenance(record, html, "birth.approx", valueSource);
    }
    addProvenance(record, html, "birth.raw", valueSource);
  } else if (labelMatches(label, "death")) {
    record.death.raw = trimmedValue;
    const parsed = parseDateFragment(value);
    if (parsed.year !== undefined) {
      record.death.year = parsed.year;
      addProvenance(record, html, "death.year", contextualText(String(parsed.year)));
    }
    if (parsed.month !== undefined) {
      record.death.month = parsed.month;
      addProvenance(record, html, "death.month", contextualText(String(parsed.month)));
    }
    if (parsed.day !== undefined) {
      record.death.day = parsed.day;
      addProvenance(record, html, "death.day", contextualText(String(parsed.day)));
    }
    if (parsed.year !== undefined || parsed.month !== undefined || parsed.day !== undefined) {
      record.death.approx = parsed.approx;
      addProvenance(record, html, "death.approx", valueSource);
    }
    addProvenance(record, html, "death.raw", valueSource);
  } else if (labelMatches(label, "residence")) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const valueSlice =
      provenance.valueRange && provenance.valueRange.end > provenance.valueRange.start
        ? html.slice(provenance.valueRange.start, provenance.valueRange.end)
        : trimmedValue;
    let searchOffset = 0;
    entries.forEach((entry) => {
      const parsed = parseDateFragment(entry);
      record.residences.push({ raw: entry, year: parsed.year });
      let entryRange: Range | undefined;
      if (provenance.valueRange) {
        const relativeIndex = valueSlice.indexOf(entry, searchOffset);
        if (relativeIndex !== -1) {
          entryRange = {
            start: provenance.valueRange.start + relativeIndex,
            end: provenance.valueRange.start + relativeIndex + entry.length,
          };
          searchOffset = relativeIndex + entry.length;
        }
      }
      addProvenance(
        record,
        html,
        `residences[${record.residences.length - 1}].raw`,
        entryRange ?? contextualText(entry),
      );
    });
  } else if (labelMatches(label, "father")) {
    record.parents.father = trimmedValue;
    addProvenance(record, html, "parents.father", valueSource);
  } else if (labelMatches(label, "mother")) {
    record.parents.mother = trimmedValue;
    addProvenance(record, html, "parents.mother", valueSource);
  } else if (labelMatches(label, "spouse")) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const valueSlice =
      provenance.valueRange && provenance.valueRange.end > provenance.valueRange.start
        ? html.slice(provenance.valueRange.start, provenance.valueRange.end)
        : trimmedValue;
    let searchOffset = 0;
    entries.forEach((entry) => {
      pushUnique(record.spouses, entry);
      let entryRange: Range | undefined;
      if (provenance.valueRange) {
        const relativeIndex = valueSlice.indexOf(entry, searchOffset);
        if (relativeIndex !== -1) {
          entryRange = {
            start: provenance.valueRange.start + relativeIndex,
            end: provenance.valueRange.start + relativeIndex + entry.length,
          };
          searchOffset = relativeIndex + entry.length;
        }
      }
      addProvenance(record, html, "spouses", entryRange ?? contextualText(entry));
    });
  } else if (labelMatches(label, "child")) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const valueSlice =
      provenance.valueRange && provenance.valueRange.end > provenance.valueRange.start
        ? html.slice(provenance.valueRange.start, provenance.valueRange.end)
        : trimmedValue;
    let searchOffset = 0;
    entries.forEach((entry) => {
      pushUnique(record.children, entry);
      let entryRange: Range | undefined;
      if (provenance.valueRange) {
        const relativeIndex = valueSlice.indexOf(entry, searchOffset);
        if (relativeIndex !== -1) {
          entryRange = {
            start: provenance.valueRange.start + relativeIndex,
            end: provenance.valueRange.start + relativeIndex + entry.length,
          };
          searchOffset = relativeIndex + entry.length;
        }
      }
      addProvenance(record, html, "children", entryRange ?? contextualText(entry));
    });
  } else if (labelMatches(label, "occupation")) {
    record.occupation = trimmedValue;
    addProvenance(record, html, "occupation", valueSource);
  } else if (labelMatches(label, "religion")) {
    record.religion = trimmedValue;
    addProvenance(record, html, "religion", valueSource);
  } else if (/\bnotes\b/.test(normalizedLabel)) {
    record.notes = trimmedValue;
    addProvenance(record, html, "notes", valueSource);
  }
}

function extractLabelValuePairs(html: string, record: IndividualRecord, $: ReturnType<typeof load>) {
  const processed = new Set<string>();

  const processPair = (label: string, rawValue: string, provenance: { context?: Range; valueRange?: Range }) => {
    if (!label || !rawValue) {
      return;
    }
    const trimmedLabel = label.trim();
    const trimmedValue = rawValue.trim();
    if (!trimmedLabel || !trimmedValue) {
      return;
    }
    const key = `${trimmedLabel.toLowerCase()}::${trimmedValue}`;
    if (processed.has(key)) {
      return;
    }
    processed.add(key);
    handleLabelValue(html, trimmedLabel, rawValue, record, provenance);
  };

  const root = $.root()[0] as AnyNode | undefined;
  if (root) {
    traverseNodes(root, (node) => {
      if ((node as { type?: string }).type !== "text") {
        return;
      }
      const data = (node as { data?: string }).data ?? "";
      if (!data || !data.includes(":")) {
        return;
      }
      const nodeRange = getLocationRange(node);
      if (!nodeRange) {
        return;
      }

      const linePattern = /[^\r\n]+/g;
      let match: RegExpExecArray | null;
      while ((match = linePattern.exec(data)) !== null) {
        const segment = match[0];
        const colonIndex = segment.indexOf(":");
        if (colonIndex === -1) {
          continue;
        }

        const label = segment.slice(0, colonIndex).trim();
        const rawValue = segment.slice(colonIndex + 1);
        if (!label || !rawValue.trim()) {
          continue;
        }

        const lineStart = nodeRange.start + match.index;
        const leadingWhitespace = rawValue.length - rawValue.trimStart().length;
        const trailingWhitespace = rawValue.length - rawValue.trimEnd().length;
        const valueStart = lineStart + colonIndex + 1 + leadingWhitespace;
        const valueEnd = lineStart + colonIndex + 1 + rawValue.length - trailingWhitespace;
        const valueRange = valueEnd > valueStart ? { start: valueStart, end: valueEnd } : undefined;
        const contextRange: Range = {
          start: lineStart,
          end: lineStart + segment.length,
        };

        processPair(label, rawValue, { context: contextRange, valueRange });
      }
    });
  }

  $("tr").each((_, row) => {
    const cells = $(row).children("th,td");
    if (cells.length < 2) {
      return;
    }

    const label = $(cells[0]).text();
    const value = cells
      .slice(1)
      .map((_, cell) => $(cell).text())
      .get()
      .join(" ");

    if (!label || !value.trim()) {
      return;
    }

    const rowNode = row as unknown as AnyNode;
    const valueNodes = cells
      .slice(1)
      .map((_, cell) => cell as unknown as AnyNode)
      .get();
    const contextRange = getTextRangeFromNode(rowNode) ?? getInnerRange(rowNode);
    const valueRange = getRangeForNodes(valueNodes);

    processPair(label, value, { context: contextRange ?? valueRange, valueRange });
  });

  $("dt").each((_, dt) => {
    const label = $(dt).text();
    const dd = $(dt).next("dd");
    if (!label || !dd.length) {
      return;
    }

    const value = dd
      .map((_, node) => $(node).text())
      .get()
      .join(" ");

    if (!value.trim()) {
      return;
    }

    const dtNode = dt as unknown as AnyNode;
    const ddNodes = dd.map((_, node) => node as unknown as AnyNode).get();
    const contextRange = mergeRanges([
      getTextRangeFromNode(dtNode),
      ...ddNodes.map((node) => getTextRangeFromNode(node) ?? getInnerRange(node)),
    ]);
    const valueRange = getRangeForNodes(ddNodes);

    processPair(label, value, { context: contextRange ?? valueRange, valueRange });
  });
}

export function extractIndividual(html: string): IndividualRecord {
  const $ = load(html, { sourceCodeLocationInfo: true });
  const record = createRecordSkeleton(html);

  const canonicalUrl = $("link[rel='canonical']").attr("href");
  if (canonicalUrl) {
    record.sourceUrl = canonicalUrl;
  }

  extractGenewebProfile(html, record, $);
  extractFullNameFromHeadings(html, record, $);
  extractLabelValuePairs(html, record, $);

  if (!record.givenNames.length && record.surname) {
    const nameFromSurname = record.surname;
    const start = html.indexOf(nameFromSurname);
    if (start !== -1) {
      addProvenance(record, html, "surname", { start, end: start + nameFromSurname.length });
    }
  }

  const validated = IndividualRecordSchema.parse(record);
  return validated;
}
