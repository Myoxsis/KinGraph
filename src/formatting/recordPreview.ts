import { highlight } from "../../highlight";
import type { IndividualRecord } from "../../schema";

export type DateFragment = IndividualRecord["birth"];

export function escapeHtmlContent(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightJson(json: string): string {
  const escaped = escapeHtmlContent(json);
  const jsonPattern =
    /(\"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\\"])*\"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  return escaped.replace(jsonPattern, (match) => {
    let tokenClass = "token token-plain";

    if (/^\".*\":$/.test(match)) {
      tokenClass = "token token-key";
    } else if (/^\".*\"$/.test(match)) {
      tokenClass = "token token-string";
    } else if (/true|false/.test(match)) {
      tokenClass = "token token-boolean";
    } else if (/null/.test(match)) {
      tokenClass = "token token-null";
    } else if (/^-?\d/.test(match)) {
      tokenClass = "token token-number";
    }

    return `<span class="${tokenClass}">${match}</span>`;
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

export function formatEvent(fragment: DateFragment): string | null {
  if (fragment.raw) {
    const parts = [fragment.raw];

    if (
      fragment.place &&
      !fragment.raw.toLowerCase().includes(fragment.place.toLowerCase())
    ) {
      parts.push(fragment.place);
    }

    return parts.join(" · ");
  }

  const parts: string[] = [];
  const date = formatDate(fragment);

  if (date) {
    parts.push(date);
  }

  if (fragment.place) {
    parts.push(fragment.place);
  }

  if (!parts.length) {
    return null;
  }

  return parts.join(" · ");
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
