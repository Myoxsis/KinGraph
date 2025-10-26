import React, { ReactNode, useMemo, useState } from "react";
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

interface StructuredSectionItem {
  label: string;
  content: ReactNode;
}

interface StructuredSection {
  title: string;
  items: StructuredSectionItem[];
  badge?: string;
}

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

function formatEvent(fragment: DateFragment): string | null {
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
  const [viewMode, setViewMode] = useState<"modular" | "json">("modular");

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

  const structuredSections = useMemo<StructuredSection[]>(() => {
    if (!record) {
      return [];
    }

    const identityItems: StructuredSectionItem[] = [];

    if (record.givenNames.length) {
      identityItems.push({
        label: "Given names",
        content: record.givenNames.join(", "),
      });
    }

    if (record.surname) {
      identityItems.push({
        label: "Surname",
        content: record.surname,
      });
    }

    if (record.maidenName) {
      identityItems.push({
        label: "Maiden name",
        content: record.maidenName,
      });
    }

    if (record.aliases.length) {
      identityItems.push({
        label: "Aliases",
        content: (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
            {record.aliases.map((alias, index) => (
              <li key={`${alias}-${index}`}>{alias}</li>
            ))}
          </ul>
        ),
      });
    }

    if (record.sex) {
      const sexLabel =
        record.sex === "M" ? "Male" : record.sex === "F" ? "Female" : "Unknown";
      identityItems.push({
        label: "Sex",
        content: sexLabel,
      });
    }

    const lifeEventItems: StructuredSectionItem[] = [];
    const birth = formatEvent(record.birth);
    if (birth) {
      lifeEventItems.push({
        label: "Birth",
        content: birth,
      });
    }

    const death = formatEvent(record.death);
    if (death) {
      lifeEventItems.push({
        label: "Death",
        content: death,
      });
    }

    if (record.residences.length) {
      const residences = record.residences
        .map((residence) => {
          if (residence.raw) {
            return residence.raw;
          }

          const parts: string[] = [];

          if (residence.year !== undefined) {
            parts.push(residence.year.toString());
          }

          if (residence.place) {
            parts.push(residence.place);
          }

          return parts.join(" · ");
        })
        .filter((entry) => entry && entry.trim().length);

      if (residences.length) {
        lifeEventItems.push({
          label: "Residences",
          content: (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
              {residences.map((summary, index) => (
                <li key={`${summary}-${index}`}>{summary}</li>
              ))}
            </ul>
          ),
        });
      }
    }

    const relationshipsItems: StructuredSectionItem[] = [];

    if (record.parents.father) {
      relationshipsItems.push({
        label: "Father",
        content: record.parents.father,
      });
    }

    if (record.parents.mother) {
      relationshipsItems.push({
        label: "Mother",
        content: record.parents.mother,
      });
    }

    if (record.spouses.length) {
      relationshipsItems.push({
        label: "Spouses",
        content: record.spouses.join(", "),
      });
    }

    if (record.children.length) {
      relationshipsItems.push({
        label: "Children",
        content: record.children.join(", "),
      });
    }

    if (record.siblings.length) {
      relationshipsItems.push({
        label: "Siblings",
        content: record.siblings.join(", "),
      });
    }

    const contextItems: StructuredSectionItem[] = [];

    if (record.occupation) {
      contextItems.push({
        label: "Occupation",
        content: record.occupation,
      });
    }

    if (record.religion) {
      contextItems.push({
        label: "Religion",
        content: record.religion,
      });
    }

    if (record.notes) {
      contextItems.push({
        label: "Notes",
        content: <p className="whitespace-pre-wrap text-sm text-slate-200">{record.notes}</p>,
      });
    }

    if (record.sources.length) {
      contextItems.push({
        label: "Sources",
        content: (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
            {record.sources.map((source, index) => (
              <li key={`${source}-${index}`}>{source}</li>
            ))}
          </ul>
        ),
      });
    }

    const metadataItems: StructuredSectionItem[] = [];

    if (record.sourceUrl) {
      metadataItems.push({
        label: "Source URL",
        content: (
          <a
            href={record.sourceUrl}
            className="text-sm text-sky-400 underline decoration-sky-400/50 decoration-dotted underline-offset-4 hover:text-sky-300"
            target="_blank"
            rel="noreferrer"
          >
            {record.sourceUrl}
          </a>
        ),
      });
    }

    if (record.extractedAt) {
      const date = new Date(record.extractedAt);
      metadataItems.push({
        label: "Extracted",
        content: isNaN(date.getTime()) ? record.extractedAt : date.toLocaleString(),
      });
    }

    let provenanceBadge: string | undefined;

    if (record.provenance.length) {
      provenanceBadge = `${record.provenance.length}`;
      metadataItems.push({
        label: "Provenance spans",
        content: (
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-md bg-slate-900/60 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              <span>View spans</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[0.65rem] text-slate-400">{record.provenance.length}</span>
            </summary>
            <ul className="mt-3 space-y-2">
              {record.provenance.map((span, index) => (
                <li
                  key={`${span.field}-${span.start}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{span.field}</p>
                  <p className="mt-1 text-sm text-slate-200">{span.text}</p>
                  <p className="mt-2 text-xs text-slate-500">{span.start} – {span.end}</p>
                </li>
              ))}
            </ul>
          </details>
        ),
      });
    }

    const sections: StructuredSection[] = [];

    if (identityItems.length) {
      sections.push({ title: "Identity", items: identityItems });
    }

    if (lifeEventItems.length) {
      sections.push({ title: "Life events", items: lifeEventItems });
    }

    if (relationshipsItems.length) {
      sections.push({ title: "Relationships", items: relationshipsItems });
    }

    if (contextItems.length) {
      sections.push({ title: "Context", items: contextItems });
    }

    if (metadataItems.length) {
      sections.push({
        title: "Sources & metadata",
        items: metadataItems,
        badge: provenanceBadge,
      });
    }

    return sections;
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
                Structured record
              </h2>
              {record && (
                <div className="flex items-center gap-2">
                  <span className="hidden rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 sm:inline-flex">
                    {record.provenance.length} provenance span{record.provenance.length === 1 ? "" : "s"}
                  </span>
                  <div className="inline-flex rounded-lg bg-slate-800/70 p-0.5 text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setViewMode("modular")}
                      className={`rounded-md px-3 py-1 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        viewMode === "modular"
                          ? "bg-slate-700 text-slate-100 shadow"
                          : "hover:text-slate-200"
                      }`}
                    >
                      Modular
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("json")}
                      className={`rounded-md px-3 py-1 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        viewMode === "json"
                          ? "bg-slate-700 text-slate-100 shadow"
                          : "hover:text-slate-200"
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                </div>
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
              {!error && record && viewMode === "json" && (
                <pre
                  className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200"
                  dangerouslySetInnerHTML={{ __html: highlightedJson }}
                />
              )}
              {!error && record && viewMode === "modular" && (
                <div className="flex flex-col gap-4">
                  {structuredSections.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No structured fields were extracted from this record.
                    </p>
                  ) : (
                    structuredSections.map((section, index) => (
                      <details
                        key={section.title}
                        className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80"
                        defaultOpen={index === 0}
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
                          <span>{section.title}</span>
                          {section.badge && (
                            <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400">
                              {section.badge}
                            </span>
                          )}
                        </summary>
                        <div className="border-t border-slate-800 px-4 py-3">
                          <dl className="grid gap-4">
                            {section.items.map((item) => (
                              <div key={`${section.title}-${item.label}`} className="space-y-1">
                                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                  {item.label}
                                </dt>
                                <dd className="text-sm text-slate-200">{item.content}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </details>
                    ))
                  )}
                </div>
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
