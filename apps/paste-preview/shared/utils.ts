import { highlight } from "../../../highlight";
import type { IndividualRecord } from "../../../schema";
import type { IndividualProfile, StoredRecord } from "@/storage";

type DateFragment = IndividualRecord["birth"];

export function escapeHtmlContent(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function highlightJson(json: string): string {
  const escaped = escapeHtmlContent(json);
  const jsonPattern =
    /(\"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\\"])*\"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  return escaped.replace(jsonPattern, (match) => {
    let cls = "text-slate-300";

    if (/^\".*\":$/.test(match)) {
      cls = "text-sky-400";
    } else if (/^\".*\"$/.test(match)) {
      cls = "text-emerald-300";
    } else if (/true|false/.test(match)) {
      cls = "text-orange-300";
    } else if (/null/.test(match)) {
      cls = "text-pink-300";
    } else if (/^-?\d/.test(match)) {
      cls = "text-amber-300";
    }

    return `<span class="${cls}">${match}</span>`;
  });
}

export function formatDate(fragment: DateFragment): string {
  const { raw, year, month, day, approx } = fragment;

  if (raw) {
    return raw;
  }

  const parts: string[] = [];

  if (year !== undefined || month !== undefined || day !== undefined) {
    if (year !== undefined) {
      parts.push(year.toString());
    }

    if (month !== undefined) {
      parts.push(month.toString().padStart(2, "0"));
    }

    if (day !== undefined) {
      parts.push(day.toString().padStart(2, "0"));
    }
  }

  if (!parts.length) {
    return "";
  }

  const formatted = parts.join("-");
  return approx ? `~${formatted}` : formatted;
}

export function buildHighlightDocument(record: IndividualRecord): string {
  const markedHtml = highlight(record.sourceHtml, record.provenance);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 1.5rem;
        background: #ffffff;
        color: #111827;
      }
      mark[data-field] {
        background: rgba(250, 204, 21, 0.4);
        border-radius: 0.25rem;
        padding: 0 0.2em;
        box-shadow: inset 0 0 0 1px rgba(217, 119, 6, 0.35);
      }
      mark[data-field]::after {
        content: attr(data-field);
        display: inline-block;
        margin-left: 0.35rem;
        font-size: 0.65rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: rgba(120, 53, 15, 0.85);
      }
    </style>
  </head>
  <body>
    ${markedHtml}
  </body>
</html>`;
}

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
