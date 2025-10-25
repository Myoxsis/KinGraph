import React, { useMemo, useState } from "react";
import { extractIndividual } from "../extract";
import { scoreConfidence } from "../confidence";
import { highlight } from "../highlight";
import type { IndividualRecord } from "../schema";

interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

type DateFragment = IndividualRecord["birth"];

function escapeHtmlContent(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJson(json: string): string {
  const escaped = escapeHtmlContent(json);
  const jsonPattern =
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  return escaped.replace(jsonPattern, (match) => {
    let cls = "text-slate-300";

    if (/^".*":$/.test(match)) {
      cls = "text-sky-400";
    } else if (/^".*"$/.test(match)) {
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

function formatDate(fragment: DateFragment): string {
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

function buildHighlightDocument(record: IndividualRecord): string {
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

export default function PastePreview(): JSX.Element {
  const [htmlInput, setHtmlInput] = useState("<h1>Jane Doe</h1><p>Born about 1892 to Mary &amp; John.</p>");
  const [showSources, setShowSources] = useState(false);

  const { record, error } = useMemo(() => {
    if (!htmlInput.trim()) {
      return { record: null, error: null };
    }

    try {
      const nextRecord = extractIndividual(htmlInput);
      return { record: nextRecord, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { record: null, error: message };
    }
  }, [htmlInput]);

  const confidenceScores = useMemo(() => {
    if (!record) {
      return {} as ReturnType<typeof scoreConfidence>;
    }
    return scoreConfidence(record);
  }, [record]);

  const fieldRows: FieldRow[] = useMemo(() => {
    if (!record) {
      return [];
    }

    const rows: FieldRow[] = [];

    if (record.givenNames.length) {
      rows.push({
        label: "Given names",
        value: record.givenNames.join(", "),
        confidence: confidenceScores.givenNames,
      });
    }

    if (record.surname) {
      rows.push({
        label: "Surname",
        value: record.surname,
        confidence: confidenceScores.surname,
      });
    }

    if (record.maidenName) {
      rows.push({
        label: "Maiden name",
        value: record.maidenName,
        confidence: confidenceScores.maidenName,
      });
    }

    const birth = formatDate(record.birth);
    if (birth) {
      rows.push({
        label: "Birth date",
        value: birth,
        confidence: confidenceScores["birth.date"],
      });
    }

    const death = formatDate(record.death);
    if (death) {
      rows.push({
        label: "Death date",
        value: death,
        confidence: confidenceScores["death.date"],
      });
    }

    if (record.parents.father) {
      rows.push({
        label: "Father",
        value: record.parents.father,
        confidence: confidenceScores["parents.father"],
      });
    }

    if (record.parents.mother) {
      rows.push({
        label: "Mother",
        value: record.parents.mother,
        confidence: confidenceScores["parents.mother"],
      });
    }

    if (record.residences.length) {
      rows.push({
        label: "Residences",
        value: record.residences
          .map((res) =>
            [res.raw, res.place, res.year?.toString()].filter(Boolean).join(" · ")
          )
          .join("\n"),
      });
    }

    if (record.spouses.length) {
      rows.push({
        label: "Spouses",
        value: record.spouses.join(", "),
      });
    }

    if (record.children.length) {
      rows.push({
        label: "Children",
        value: record.children.join(", "),
      });
    }

    if (record.occupation) {
      rows.push({
        label: "Occupation",
        value: record.occupation,
      });
    }

    if (record.religion) {
      rows.push({
        label: "Religion",
        value: record.religion,
      });
    }

    if (record.notes) {
      rows.push({
        label: "Notes",
        value: record.notes,
      });
    }

    return rows;
  }, [record, confidenceScores]);

  const jsonPreview = useMemo(() => {
    if (!record) {
      return "";
    }

    return JSON.stringify(record, null, 2);
  }, [record]);

  const highlightedJson = useMemo(() => {
    if (!jsonPreview) {
      return "";
    }

    return highlightJson(jsonPreview);
  }, [jsonPreview]);

  const highlightDoc = useMemo(() => {
    if (!record) {
      return "";
    }

    return buildHighlightDocument(record);
  }, [record]);

  return (
    <div className="flex flex-col gap-6 bg-slate-950 p-6 text-slate-100">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Source HTML
            </label>
            <textarea
              className="h-[24rem] w-full resize-y rounded-lg border border-slate-800 bg-slate-900/60 p-4 font-mono text-sm text-slate-200 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/50"
              placeholder="Paste HTML here..."
              value={htmlInput}
              onChange={(event) => {
                setHtmlInput(event.target.value);
                setShowSources(false);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowSources((prev) => !prev)}
            disabled={!record}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Highlight sources
          </button>
          {showSources && record && (
            <div className="h-80 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
              <iframe
                title="Source preview"
                className="h-full w-full"
                srcDoc={highlightDoc}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Structured JSON
              </h2>
              {record && (
                <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400">
                  {record.provenance.length} provenance span{record.provenance.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="max-h-[22rem] overflow-auto p-4">
              {error && (
                <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {error}
                </div>
              )}
              {!error && !record && (
                <p className="text-sm text-slate-400">
                  Paste HTML into the left pane to see the extracted record.
                </p>
              )}
              {!error && record && (
                <pre
                  className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200"
                  dangerouslySetInnerHTML={{ __html: highlightedJson }}
                />
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 shadow-lg">
            <div className="border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Field confidence
              </h2>
            </div>
            <div className="max-h-[22rem] overflow-auto">
              {fieldRows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">No extracted fields yet.</p>
              ) : (
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <tbody className="divide-y divide-slate-800">
                    {fieldRows.map((row) => {
                      const percent = row.confidence !== undefined ? Math.round(row.confidence * 100) : null;
                      return (
                        <tr key={`${row.label}-${row.value}`} className="align-top">
                          <th className="w-36 whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                            {row.label}
                          </th>
                          <td className="px-4 py-3">
                            <div className="whitespace-pre-wrap text-sm text-slate-200">{row.value}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-2 w-full rounded-full bg-slate-800">
                                {percent !== null && (
                                  <div
                                    className="h-2 rounded-full bg-emerald-400 transition-all"
                                    style={{ width: `${percent}%` }}
                                  />
                                )}
                              </div>
                              <span className="text-xs text-slate-400">
                                {percent !== null ? `${percent}%` : "—"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
