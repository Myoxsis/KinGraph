import { load } from "cheerio";
import { IndividualRecordSchema, type IndividualRecord } from "./schema";

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

function parseYearInfo(text: string) {
  const yearMatch = text.match(/(c(?:irca)?\.?\s*)?(\d{4})/i);
  if (!yearMatch) {
    return { year: undefined, approx: undefined } as const;
  }

  const approx = Boolean(yearMatch[1]);
  const year = Number(yearMatch[2]);

  return { year, approx } as const;
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

function handleLabelValue(
  html: string,
  label: string,
  value: string,
  record: IndividualRecord,
  provenanceText: string
) {
  const normalizedLabel = label.toLowerCase();

  if (/\b(maiden)\b/.test(normalizedLabel)) {
    record.maidenName = value.trim();
    addProvenance(record, html, "maidenName", value.trim());
  } else if (/\b(surname|last\s+name)\b/.test(normalizedLabel)) {
    record.surname = value.trim();
    addProvenance(record, html, "surname", value.trim());
  } else if (/\b(given|forename)\b/.test(normalizedLabel)) {
    const parts = value.split(/[,;]+|\s+/).map((part) => part.trim()).filter(Boolean);
    record.givenNames = parts;
    addProvenance(record, html, "givenNames", value.trim());
  } else if (/\bname\b/.test(normalizedLabel)) {
    const trimmed = value.trim();
    const maidenMatch = trimmed.match(/\bn[eé]e\s+([A-Za-z'’\-]+)/i);
    if (maidenMatch) {
      record.maidenName = maidenMatch[1];
      addProvenance(record, html, "maidenName", maidenMatch[1]);
    }

    const cleaned = trimmed.replace(/\bn[eé]e\s+[A-Za-z'’\-]+/i, "").trim();
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
  } else if (/\b(born|birth)\b/.test(normalizedLabel)) {
    record.birth.raw = value.trim();
    const { year, approx } = parseYearInfo(value);
    if (year) {
      record.birth.year = year;
    }
    if (approx !== undefined) {
      record.birth.approx = approx;
    }
    addProvenance(record, html, "birth.raw", provenanceText.trim());
  } else if (/\b(died|death)\b/.test(normalizedLabel)) {
    record.death.raw = value.trim();
    const { year, approx } = parseYearInfo(value);
    if (year) {
      record.death.year = year;
    }
    if (approx !== undefined) {
      record.death.approx = approx;
    }
    addProvenance(record, html, "death.raw", provenanceText.trim());
  } else if (/\bresidence\b/.test(normalizedLabel)) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    entries.forEach((entry) => {
      const { year } = parseYearInfo(entry);
      record.residences.push({ raw: entry, year });
      addProvenance(record, html, `residences[${record.residences.length - 1}].raw`, entry);
    });
  } else if (/\bfather\b/.test(normalizedLabel)) {
    record.parents.father = value.trim();
    addProvenance(record, html, "parents.father", value.trim());
  } else if (/\bmother\b/.test(normalizedLabel)) {
    record.parents.mother = value.trim();
    addProvenance(record, html, "parents.mother", value.trim());
  } else if (/\b(spouse|husband|wife)\b/.test(normalizedLabel)) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    entries.forEach((entry) => {
      pushUnique(record.spouses, entry);
      addProvenance(record, html, "spouses", entry);
    });
  } else if (/\bchild\b/.test(normalizedLabel)) {
    const entries = value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    entries.forEach((entry) => {
      pushUnique(record.children, entry);
      addProvenance(record, html, "children", entry);
    });
  } else if (/\boccupation\b/.test(normalizedLabel)) {
    record.occupation = value.trim();
    addProvenance(record, html, "occupation", value.trim());
  } else if (/\breligion\b/.test(normalizedLabel)) {
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
