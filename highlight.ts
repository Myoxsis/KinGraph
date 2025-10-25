import type { IndividualRecord } from "./schema";

export type ProvenanceEntry = IndividualRecord["provenance"][number];

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

export function highlight(html: string, provenance: ProvenanceEntry[]): string {
  if (!provenance.length) {
    return html;
  }

  const htmlLength = html.length;
  const sorted = [...provenance].sort((a, b) => {
    if (a.start === b.start) {
      return a.end - b.end;
    }
    return a.start - b.start;
  });

  let cursor = 0;
  let output = "";

  for (const entry of sorted) {
    const safeStart = Math.max(0, Math.min(entry.start, htmlLength));
    const safeEnd = Math.max(safeStart, Math.min(entry.end, htmlLength));

    if (safeEnd <= safeStart || safeStart < cursor) {
      continue;
    }

    if (cursor < safeStart) {
      output += html.slice(cursor, safeStart);
    }

    const snippet = html.slice(safeStart, safeEnd);
    const field = escapeHtmlAttribute(entry.field);
    output += `<mark data-field="${field}">${snippet}</mark>`;

    cursor = safeEnd;
  }

  if (cursor < htmlLength) {
    output += html.slice(cursor);
  }

  return output;
}
