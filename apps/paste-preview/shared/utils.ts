import type { IndividualRecord } from "../../../schema";
import type { IndividualProfile, StoredRecord } from "@/storage";
import {
  buildHighlightDocument,
  escapeHtmlContent,
  formatDate,
  highlightJson,
} from "@/formatting/recordPreview";

export { buildHighlightDocument, escapeHtmlContent, formatDate, highlightJson };

export function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getRecordSummary(record: IndividualRecord): string {
  const nameParts = [...record.givenNames];

  if (record.surname) {
    nameParts.push(record.surname);
  }

  const name = nameParts.join(" ").trim();
  const birthYear = record.birth.year ? record.birth.year.toString() : "";
  const deathYear = record.death.year ? record.death.year.toString() : "";
  let years = "";

  if (birthYear || deathYear) {
    const span = `${birthYear || "?"}–${deathYear || "?"}`;
    years = ` (${span})`;
  }

  if (name) {
    return `${name}${years}`;
  }

  if (record.sourceUrl) {
    return record.sourceUrl;
  }

  return `Record extracted ${new Date(record.extractedAt).toLocaleDateString()}`;
}

export function getSuggestedIndividualName(record: IndividualRecord): string {
  const nameParts = [...record.givenNames];

  if (record.surname) {
    nameParts.push(record.surname);
  }

  const name = nameParts.join(" ").trim();

  if (name) {
    return name;
  }

  if (record.sourceUrl) {
    return record.sourceUrl;
  }

  return "Unnamed individual";
}

type LifespanSource = Pick<IndividualRecord, "birth" | "death"> | Pick<IndividualProfile, "birth" | "death">;

export function formatLifespan(source: LifespanSource): string {
  const birthYear = source.birth.year ? source.birth.year.toString() : "";
  const deathYear = source.death.year ? source.death.year.toString() : "";

  if (!birthYear && !deathYear) {
    return "";
  }

  return `${birthYear || "?"}–${deathYear || "?"}`;
}

export function normalizeNameKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildRecordIndex(records: StoredRecord[]): Map<string, StoredRecord> {
  const index = new Map<string, StoredRecord>();

  for (const stored of records) {
    const name = getSuggestedIndividualName(stored.record);
    const key = normalizeNameKey(name);

    if (!key) {
      continue;
    }

    const existing = index.get(key);
    if (!existing || existing.createdAt < stored.createdAt) {
      index.set(key, stored);
    }
  }

  return index;
}

export function getLatestRecordForIndividual(
  id: string,
  records: StoredRecord[],
): StoredRecord | null {
  const relevant = records.filter((record) => record.individualId === id);
  if (!relevant.length) {
    return null;
  }

  relevant.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return relevant[0];
}

export function parseAliasInput(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}
