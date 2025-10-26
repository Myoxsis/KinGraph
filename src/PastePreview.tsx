import React, { useMemo, useState, type ChangeEvent } from "react";
import { extractIndividual } from "../extract";
import { scoreConfidence } from "../confidence";
import type { IndividualRecord } from "../schema";
import {
  buildHighlightDocument,
  formatDate,
  formatEvent,
  highlightJson,
} from "./formatting/recordPreview";
import { FieldConfidencePanel } from "./components/FieldConfidencePanel";
import type { FieldRow } from "./components/FieldConfidenceTable";
import { SourceInputColumn } from "./components/SourceInputColumn";
import {
  StructuredRecordPanel,
  type RecordViewMode,
} from "./components/StructuredRecordPanel";
import type {
  StructuredSection,
  StructuredSectionItem,
} from "./components/StructuredSections";

const DEFAULT_HTML =
  "<h1>Jane Doe</h1><p>Born about 1892 to Mary &amp; John.</p>";

export default function PastePreview(): JSX.Element {
  const [htmlInput, setHtmlInput] = useState(DEFAULT_HTML);
  const [showSources, setShowSources] = useState(false);
  const [viewMode, setViewMode] = useState<RecordViewMode>("modular");

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

  const fieldRows = useMemo<FieldRow[]>(() => {
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
            [res.raw, res.place, res.year?.toString()].filter(Boolean).join(" · "),
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
    const birthEvent = formatEvent(record.birth);
    if (birthEvent) {
      lifeEventItems.push({
        label: "Birth",
        content: birthEvent,
      });
    }

    const deathEvent = formatEvent(record.death);
    if (deathEvent) {
      lifeEventItems.push({
        label: "Death",
        content: deathEvent,
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
        content: (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
            {record.spouses.map((spouse, index) => (
              <li key={`${spouse}-${index}`}>{spouse}</li>
            ))}
          </ul>
        ),
      });
    }

    if (record.children.length) {
      relationshipsItems.push({
        label: "Children",
        content: (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200">
            {record.children.map((child, index) => (
              <li key={`${child}-${index}`}>{child}</li>
            ))}
          </ul>
        ),
      });
    }

    const contextItems: StructuredSectionItem[] = [];

    if (record.residences.length) {
      const latestResidence = record.residences[record.residences.length - 1];
      if (latestResidence.place) {
        contextItems.push({
          label: "Last known residence",
          content: latestResidence.place,
        });
      }
    }

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
        content: (
          <div className="whitespace-pre-wrap text-sm text-slate-200">
            {record.notes}
          </div>
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
            className="text-sm text-sky-400 hover:text-sky-300"
            target="_blank"
            rel="noreferrer"
          >
            {record.sourceUrl}
          </a>
        ),
      });
    }

    if (record.sourceCitation) {
      metadataItems.push({
        label: "Citation",
        content: record.sourceCitation,
      });
    }

    if (record.extractedAt) {
      const date = new Date(record.extractedAt);
      metadataItems.push({
        label: "Extracted",
        content: isNaN(date.getTime())
          ? record.extractedAt
          : date.toLocaleString(),
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
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[0.65rem] text-slate-400">
                {record.provenance.length}
              </span>
            </summary>
            <ul className="mt-3 space-y-2">
              {record.provenance.map((span, index) => (
                <li
                  key={`${span.field}-${span.start}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {span.field}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{span.text}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {span.start} – {span.end}
                  </p>
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

  const handleHtmlChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setHtmlInput(event.target.value);
    setShowSources(false);
  };

  const toggleSources = () => {
    setShowSources((prev) => !prev);
  };

  return (
    <div className="flex flex-col gap-6 bg-slate-950 p-6 text-slate-100">
      <div className="grid gap-6 lg:grid-cols-2">
        <SourceInputColumn
          htmlInput={htmlInput}
          onHtmlInputChange={handleHtmlChange}
          onToggleSources={toggleSources}
          showSources={showSources}
          record={record}
          highlightDocument={highlightDoc}
        />
        <div className="flex flex-col gap-4">
          <StructuredRecordPanel
            record={record}
            sections={structuredSections}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            highlightedJson={highlightedJson}
            error={error}
          />
          <FieldConfidencePanel rows={fieldRows} />
        </div>
      </div>
    </div>
  );
}
